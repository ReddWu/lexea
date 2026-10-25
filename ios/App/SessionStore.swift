import Foundation
import InsForge
import InsForgeAuth
import InsForgeCore
import Observation
import AuthenticationServices
import CryptoKit

/// Sign in with Apple (native, exchanged at /api/auth/id-token), Google (InsForge OAuth
/// in an in-app browser sheet) or email + password.
/// New email accounts confirm with the 6-digit code InsForge emails them;
/// verifying the code also signs the user in.
@MainActor @Observable
final class SessionStore {
    private(set) var user: User?
    private(set) var restoring = true
    /// Email waiting for its verification code (shows the code screen).
    var pendingVerification: String?
    var error: String?
    var notice: String?

    private var auth: AuthClient { Backend.client.auth }

    func restore() async {
        defer { restoring = false }
        user = try? await auth.getSession()?.user
    }

    func signInWithGoogle() async {
        error = nil
        notice = nil
        do {
            user = try await auth.signInWithOAuthView(provider: OAuthProvider.google, redirectTo: Backend.oauthRedirect)?.user
        } catch {
            // closing the sign-in sheet isn't worth an error message
            let ns = error as NSError
            if !(ns.domain == "com.apple.AuthenticationServices.WebAuthenticationSession" && ns.code == 1) {
                self.error = Self.message(error)
            }
        }
    }

    // MARK: Sign in with Apple

    /// Raw nonce for the Apple request in flight; Apple signs its SHA-256 and InsForge checks it.
    private var appleNonce = ""

    func prepareAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
        error = nil
        notice = nil
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        appleNonce = bytes.map { String(format: "%02x", $0) }.joined()
        request.requestedScopes = [.fullName, .email]
        request.nonce = SHA256.hash(data: Data(appleNonce.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    func completeApple(_ result: Result<ASAuthorization, Error>) async {
        switch result {
        case .failure(let e):
            if (e as? ASAuthorizationError)?.code != .canceled { error = Self.message(e) }
        case .success(let auth):
            guard let cred = auth.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = cred.identityToken, let token = String(data: tokenData, encoding: .utf8) else {
                error = "Apple didn't return an identity token. Try again."
                return
            }
            let name = [cred.fullName?.givenName, cred.fullName?.familyName].compactMap { $0 }.joined(separator: " ")
            await run { try await self.exchangeAppleToken(token, name: name.isEmpty ? nil : name) }
        }
    }

    /// SDK 0.0.9 has no id-token sign-in, so call the REST endpoint and hand the session to the SDK.
    private func exchangeAppleToken(_ token: String, name: String?) async throws {
        var req = URLRequest(url: Backend.baseURL.appending(path: "api/auth/id-token")
            .appending(queryItems: [URLQueryItem(name: "client_type", value: "mobile")]))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(Backend.anonKey)", forHTTPHeaderField: "Authorization")
        var body: [String: String] = ["provider": "apple", "token": token, "nonce": appleNonce]
        if let name { body["name"] = name }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, resp) = try await URLSession.shared.data(for: req)
        guard (resp as? HTTPURLResponse)?.statusCode == 200 else {
            let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["message"] as? String
            throw NSError(domain: "Echowords", code: 1, userInfo: [NSLocalizedDescriptionKey: msg ?? "Sign in with Apple failed."])
        }
        let dec = JSONDecoder()
        dec.dateDecodingStrategy = iso8601WithFractionalSecondsDecodingStrategy()
        let res = try dec.decode(AuthResponse.self, from: data)
        guard let access = res.accessToken else { throw NSError(domain: "Echowords", code: 2, userInfo: [NSLocalizedDescriptionKey: "Sign in with Apple failed."]) }
        try await Backend.sessionStorage.saveSession(Session(accessToken: access, refreshToken: res.refreshToken, user: res.user))
        // getSession() loads the stored session into the SDK and switches its auth headers
        user = try await auth.getSession()?.user
    }

    func signIn(email: String, password: String) async {
        await run {
            do {
                self.user = try await self.auth.signIn(email: email, password: password).user
            } catch where Self.isUnverified(error) {
                try? await self.auth.sendEmailVerification(email: email)
                self.pendingVerification = email
                self.notice = "Check \(email) for a 6-digit code."
            }
        }
    }

    func signUp(email: String, password: String) async {
        await run {
            let res = try await self.auth.signUp(email: email, password: password)
            if let u = res.user, res.accessToken != nil {
                self.user = u
            } else {
                self.pendingVerification = email
                self.notice = "We sent a 6-digit code to \(email)."
            }
        }
    }

    func verify(code: String) async {
        guard let email = pendingVerification else { return }
        await run {
            self.user = try await self.auth.verifyEmail(email: email, otp: code).user
            self.pendingVerification = nil
        }
    }

    func resendCode() async {
        guard let email = pendingVerification else { return }
        await run {
            try await self.auth.sendEmailVerification(email: email)
            self.notice = "New code sent to \(email)."
        }
    }

    func signOut() async {
        try? await auth.signOut()
        user = nil
    }

    /// Permanently deletes the account and every saved word (public.delete_my_account
    /// removes the auth user; the app's tables cascade from it).
    func deleteAccount() async {
        await run {
            try await Backend.client.database.rpc("delete_my_account").execute()
            try? await self.auth.signOut()
            self.user = nil
        }
    }

    private func run(_ body: @escaping () async throws -> Void) async {
        error = nil
        notice = nil
        do { try await body() } catch { self.error = Self.message(error) }
    }

    private static func isUnverified(_ e: Error) -> Bool {
        let s = message(e).lowercased()
        return s.contains("verif") || s.contains("not confirmed")
    }

    private static func message(_ e: Error) -> String {
        if case let InsForgeError.httpError(_, message, _, _) = e { return message }
        return (e as? LocalizedError)?.errorDescription ?? e.localizedDescription
    }
}
