import Foundation
import InsForgeAuth
import Security

/// Keeps the InsForge session in the Keychain instead of UserDefaults
/// (SDK 0.0.9 only ships a UserDefaults store).
actor KeychainSessionStorage: AuthStorage {
    private let service: String

    init(service: String) { self.service = service }

    func saveSession(_ session: Session) async throws {
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        try set(enc.encode(session), account: "session")
    }

    func getSession() async throws -> Session? {
        guard let data = try get(account: "session") else { return nil }
        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        return try? dec.decode(Session.self, from: data)
    }

    func deleteSession() async throws { try delete(account: "session") }

    func savePKCEVerifier(_ verifier: String) async throws { try set(Data(verifier.utf8), account: "pkce") }

    func getPKCEVerifier() async throws -> String? {
        try get(account: "pkce").map { String(decoding: $0, as: UTF8.self) }
    }

    func deletePKCEVerifier() async throws { try delete(account: "pkce") }

    // MARK: Keychain

    private func base(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    private func set(_ data: Data, account: String) throws {
        let attrs: [String: Any] = [kSecValueData as String: data,
                                    kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock]
        var status = SecItemUpdate(base(account) as CFDictionary, attrs as CFDictionary)
        if status == errSecItemNotFound {
            status = SecItemAdd(base(account).merging(attrs) { $1 } as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw KeychainError(status: status) }
    }

    private func get(account: String) throws -> Data? {
        var q = base(account)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        let status = SecItemCopyMatching(q as CFDictionary, &out)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw KeychainError(status: status) }
        return out as? Data
    }

    private func delete(account: String) throws {
        let status = SecItemDelete(base(account) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw KeychainError(status: status) }
    }

    struct KeychainError: Error { let status: OSStatus }
}
