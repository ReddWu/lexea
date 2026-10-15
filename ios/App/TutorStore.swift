import Foundation
import Observation

/// Chat with Mia through the website's /api/tutor agent (same prompt, tools
/// and memory as the web tutor). The server streams NDJSON lines:
/// {type:"delta",text} · {type:"tool",event} · {type:"done",reply} · {type:"error",error}.
@MainActor @Observable
final class TutorStore {
    struct Message: Codable, Identifiable, Equatable {
        var id = UUID()
        var role: String          // "user" | "assistant"
        var content: String
        var hidden = false        // kickoff prompts ride in the history but never render
        var notes: [String] = []  // "Saved ‘x’", "Reviewed ‘y’ · good"
    }

    enum Mode: String, Codable, CaseIterable {
        case companion, study
        var label: String { self == .companion ? "Chat" : "Practice" }
    }

    private(set) var messages: [Message] = []
    private(set) var busy = false
    private(set) var ended = false
    var mode: Mode = .companion { didSet { save() } }
    var error: String?

    /// Set when Mia saved or graded a word, so the word list can refresh.
    private(set) var wordsChanged = 0

    private var sessionId = TutorStore.newSessionId()
    private var userId: String?

    static let kickoff = "Hi Mia, let's start today's session."

    func start(userId: String) {
        guard self.userId != userId else { return }
        self.userId = userId
        load()
        if messages.isEmpty { Task { await send(Self.kickoff, hidden: true) } }
    }

    func newSession() async {
        sessionId = Self.newSessionId()
        messages = []
        ended = false
        error = nil
        save()
        await send(Self.kickoff, hidden: true)
    }

    func endSession() async {
        await send("I need to go — let's wrap up for today.", end: true)
    }

    func send(_ text: String, hidden: Bool = false, end: Bool = false) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !busy else { return }
        messages.append(Message(role: "user", content: trimmed, hidden: hidden))
        busy = true
        error = nil
        defer {
            busy = false
            // drop an empty bubble left by a stream that died before any text
            messages.removeAll { $0.role == "assistant" && $0.content.trimmingCharacters(in: .whitespaces).isEmpty }
            save()
        }

        do {
            let history = messages.map { ["role": $0.role, "content": $0.content] }
            let body: [String: Any] = ["messages": Array(history.suffix(40)), "end": end,
                                       "session_id": sessionId, "mode": mode.rawValue]
            let (bytes, status) = try await stream(body)
            guard status == 200 else {
                var raw = ""
                for try await line in bytes.lines { raw += line }
                let msg = (try? JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any])?["error"] as? String
                throw TutorError.server(status, msg ?? raw)
            }

            messages.append(Message(role: "assistant", content: ""))
            let i = messages.count - 1
            for try await line in bytes.lines {
                guard let ev = try? JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any] else { continue }
                switch ev["type"] as? String {
                case "delta":
                    messages[i].content += ev["text"] as? String ?? ""
                case "tool":
                    if let note = Self.note(ev["event"] as? [String: Any]) {
                        messages[i].notes.append(note)
                        wordsChanged += 1
                    }
                case "done":
                    if let reply = ev["reply"] as? String { messages[i].content = reply }
                case "error":
                    error = ev["error"] as? String
                default: break
                }
            }
            if end { ended = true }
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    // MARK: networking

    private func stream(_ body: [String: Any]) async throws -> (URLSession.AsyncBytes, Int) {
        func call(_ token: String) async throws -> (URLSession.AsyncBytes, Int) {
            var req = URLRequest(url: Backend.webURL.appendingPathComponent("api/tutor"))
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
            req.timeoutInterval = 90
            let (bytes, resp) = try await URLSession.shared.bytes(for: req)
            return (bytes, (resp as? HTTPURLResponse)?.statusCode ?? 0)
        }
        guard let token = try await Backend.client.auth.getAccessToken() else { throw TutorError.signedOut }
        let first = try await call(token)
        if first.1 == 401, let fresh = try? await Backend.client.auth.refreshAccessToken().accessToken {
            return try await call(fresh)
        }
        return first
    }

    private static func note(_ ev: [String: Any]?) -> String? {
        guard let ev, let tool = ev["tool"] as? String,
              let result = ev["result"] as? [String: Any], result["ok"] as? Bool == true else { return nil }
        let args = ev["args"] as? [String: Any] ?? [:]
        let word = (result["word"] as? String) ?? (args["word"] as? String) ?? "word"
        switch tool {
        case "add_word":
            return (result["added"] as? Bool == false) ? nil : "Saved ‘\(word)’"
        case "review_word":
            let r = (result["rating"] as? Int).flatMap { SRS.Rating(rawValue: $0)?.label.lowercased() } ?? ""
            return "Reviewed ‘\(word)’" + (r.isEmpty ? "" : " · \(r)")
        default:
            return nil
        }
    }

    // MARK: persistence (one conversation per user, survives relaunch)

    private struct Saved: Codable { var sessionId: String; var messages: [Message]; var ended: Bool; var mode: Mode }

    private var storeURL: URL? {
        guard let userId else { return nil }
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("tutor-\(userId).json")
    }

    private func load() {
        guard let url = storeURL, let data = try? Data(contentsOf: url),
              let s = try? JSONDecoder().decode(Saved.self, from: data) else {
            messages = []; ended = false; sessionId = Self.newSessionId()
            return
        }
        sessionId = s.sessionId
        messages = s.messages
        ended = s.ended
        mode = s.mode
    }

    private func save() {
        guard let url = storeURL else { return }
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? JSONEncoder().encode(Saved(sessionId: sessionId, messages: messages, ended: ended, mode: mode))
            .write(to: url, options: .atomic)
    }

    func reset() {
        userId = nil
        messages = []
        ended = false
    }

    private static func newSessionId() -> String { "mia-" + UUID().uuidString.lowercased().prefix(13) }

    enum TutorError: LocalizedError {
        case signedOut, server(Int, String)
        var errorDescription: String? {
            switch self {
            case .signedOut: return "Sign in first."
            case .server(401, _): return "Mia's server didn't accept your sign-in. The website backend may still point at the old project."
            case .server(let code, let msg): return "Mia couldn't answer (\(code)): \(msg.prefix(160))"
            }
        }
    }
}
