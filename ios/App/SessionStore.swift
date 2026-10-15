import Foundation
import InsForge
import InsForgeAuth
import InsForgeCore
import Observation

/// Google (InsForge OAuth in an in-app browser sheet) or email + password.
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
