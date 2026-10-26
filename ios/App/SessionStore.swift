import Foundation
import Supabase
import Observation
import AuthenticationServices
import CryptoKit

/// Sign in with Apple (native ID token), Google (Supabase OAuth in an in-app
/// browser sheet) or email + password.
/// New email accounts confirm with the 6-digit code Supabase emails them;
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
        user = try? await auth.session.user
    }

    func signInWithGoogle() async {
        error = nil
        notice = nil
        do {
            user = try await auth.signInWithOAuth(
                provider: .google, redirectTo: Backend.oauthRedirect,
                queryParams: [(name: "prompt", value: "select_account")]
            ).user
        } catch {
            // closing the sign-in sheet isn't worth an error message
            let ns = error as NSError
            if !(ns.domain == "com.apple.AuthenticationServices.WebAuthenticationSession" && ns.code == 1) {
                self.error = Self.message(error)
            }
        }
    }

    // MARK: Sign in with Apple

    /// Raw nonce for the Apple request in flight; Apple signs its SHA-256 and Supabase checks it.
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

    private func exchangeAppleToken(_ token: String, name: String?) async throws {
        let session = try await auth.signInWithIdToken(
            credentials: OpenIDConnectCredentials(provider: .apple, idToken: token, nonce: appleNonce)
        )
        // Apple only sends the name on the very first authorization; keep it as profile metadata
        if let name {
            _ = try? await auth.update(user: UserAttributes(data: ["full_name": .string(name)]))
        }
        user = session.user
    }

    func signIn(email: String, password: String) async {
        await run {
            do {
                self.user = try await self.auth.signIn(email: email, password: password).user
            } catch where Self.isUnverified(error) {
                try? await self.auth.resend(email: email, type: .signup)
                self.pendingVerification = email
                self.notice = "Check \(email) for a 6-digit code."
            }
        }
    }

    func signUp(email: String, password: String) async {
        await run {
            let res = try await self.auth.signUp(email: email, password: password)
            if let session = res.session {
                self.user = session.user
            } else {
                self.pendingVerification = email
                self.notice = "We sent a 6-digit code to \(email)."
            }
        }
    }

    func verify(code: String) async {
        guard let email = pendingVerification else { return }
        await run {
            self.user = try await self.auth.verifyOTP(email: email, token: code, type: .signup).user
            self.pendingVerification = nil
        }
    }

    func resendCode() async {
        guard let email = pendingVerification else { return }
        await run {
            try await self.auth.resend(email: email, type: .signup)
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
            try await Backend.client.rpc("delete_my_account").execute()
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
        if let e = e as? AuthError { return e.message }
        return (e as? LocalizedError)?.errorDescription ?? e.localizedDescription
    }
}
