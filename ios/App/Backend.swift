import Foundation
import InsForge
import InsForgeAuth

/// The InsForge client, built from Info.plist values that come from
/// Config/Secrets.xcconfig (never hardcoded).
enum Backend {
    static let baseURL = URL(string: info("InsForgeURL"))!
    static let anonKey = info("InsForgeAnonKey")
    static let webURL = URL(string: info("MiaWebURL"))!
    static let oauthRedirect = "mia://auth/callback" // listed in ../insforge.toml allowed_redirect_urls

    static let client = InsForgeClient(
        baseURL: baseURL,
        anonKey: anonKey,
        options: InsForgeClientOptions(
            auth: AuthOptions(storage: KeychainSessionStorage(service: "com.reddwu.mia.auth")),
            global: .init(logLevel: .warning, logDestination: .osLog, logSubsystem: "com.reddwu.mia")
        )
    )

    private static func info(_ key: String) -> String {
        guard let v = Bundle.main.object(forInfoDictionaryKey: key) as? String, !v.isEmpty, !v.contains("$(") else {
            fatalError("Missing \(key) — copy ios/Config/Secrets.example.xcconfig to Secrets.xcconfig")
        }
        return v
    }
}
