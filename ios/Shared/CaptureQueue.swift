import Foundation

/// A word saved from the share sheet, waiting for the app to push it to the
/// backend. The share extension never talks to the network or holds a token.
struct PendingCapture: Codable, Identifiable, Hashable {
    var id = UUID()
    var word: String
    var lang: String
    var sentence: String?
    var url: String?
    var title: String?
    var savedAt = Date()
}

/// JSON file in the App Group container, shared by the app and the extension.
enum CaptureQueue {
    static let appGroup = "group.com.reddwu.mia"

    private static var fileURL: URL {
        let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("pending-captures.json")
    }

    static func all() -> [PendingCapture] {
        guard let data = try? Data(contentsOf: fileURL) else { return [] }
        return (try? JSONDecoder().decode([PendingCapture].self, from: data)) ?? []
    }

    static func append(_ c: PendingCapture) throws {
        try write(all() + [c])
    }

    static func remove(ids: Set<UUID>) {
        try? write(all().filter { !ids.contains($0.id) })
    }

    private static func write(_ items: [PendingCapture]) throws {
        let coordinator = NSFileCoordinator()
        var coordError: NSError?
        var writeError: Error?
        coordinator.coordinate(writingItemAt: fileURL, options: .forReplacing, error: &coordError) { url in
            do { try JSONEncoder().encode(items).write(to: url, options: .atomic) } catch { writeError = error }
        }
        if let e = coordError ?? writeError { throw e }
    }
}
