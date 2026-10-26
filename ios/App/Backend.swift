import Foundation
import Supabase

/// The Supabase client, built from Info.plist values that come from
/// Config/Secrets.xcconfig (never hardcoded). The SDK keeps the session in
/// the Keychain by default.
enum Backend {
    static let baseURL = URL(string: info("SupabaseURL"))!
    static let publishableKey = info("SupabaseKey")
    static let webURL = URL(string: info("MiaWebURL"))!
    static let oauthRedirect = URL(string: "mia://auth/callback")! // in the Supabase auth redirect allow list

    static let client = SupabaseClient(
        supabaseURL: baseURL,
        supabaseKey: publishableKey,
        options: SupabaseClientOptions(auth: .init(redirectToURL: oauthRedirect, flowType: .pkce))
    )

    private static func info(_ key: String) -> String {
        guard let v = Bundle.main.object(forInfoDictionaryKey: key) as? String, !v.isEmpty, !v.contains("$(") else {
            fatalError("Missing \(key) — copy ios/Config/Secrets.example.xcconfig to Secrets.xcconfig")
        }
        return v
    }
}
