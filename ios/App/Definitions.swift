import Foundation

/// Looks up what a card's back should say. Same sources as the website:
/// the Mia backend /api/define (LLM: simple English + 中文 + reading) and
/// Datamuse as the English fallback.
enum Definitions {
    struct Result {
        var plain: String?
        var zh: String?
        var reading: String?
    }

    static func lookup(_ w: WordRecord) async -> Result {
        if let r = try? await miaDefine(w) { return r }
        if w.lang == "en", let r = try? await dictionary(w.lemma) { return r }
        return Result()
    }

    private static func miaDefine(_ w: WordRecord) async throws -> Result {
        struct Body: Encodable { let word: String; let lang: String; let context: String }
        struct Out: Decodable { let plain: String?; let zh: String?; let reading: String? }

        func call(_ token: String) async throws -> (Data, Int) {
            var req = URLRequest(url: Backend.webURL.appendingPathComponent("api/define"))
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            req.httpBody = try JSONEncoder().encode(Body(word: w.word, lang: w.lang, context: w.latestSentence ?? ""))
            req.timeoutInterval = 20
            let (data, resp) = try await URLSession.shared.data(for: req)
            return (data, (resp as? HTTPURLResponse)?.statusCode ?? 0)
        }

        guard let token = try await Backend.client.auth.getAccessToken() else { throw URLError(.userAuthenticationRequired) }
        var (data, status) = try await call(token)
        if status == 401, let fresh = try? await Backend.client.auth.refreshAccessToken().accessToken {
            (data, status) = try await call(fresh)
        }
        guard status == 200 else { throw URLError(.badServerResponse) }
        let out = try JSONDecoder().decode(Out.self, from: data)
        guard out.plain != nil || out.zh != nil else { throw URLError(.cannotParseResponse) }
        return Result(plain: out.plain, zh: out.zh, reading: out.reading)
    }

    /// Datamuse: no key, ~0.1s. (dictionaryapi.dev started hanging ~20s and
    /// returning 522 in 2026-10.)
    private static func dictionary(_ lemma: String) async throws -> Result {
        struct Entry: Decodable { let word: String; let tags: [String]?; let defs: [String]? }
        func fetch(_ s: String) async throws -> Entry? {
            var c = URLComponents(string: "https://api.datamuse.com/words")!
            c.queryItems = [.init(name: "sp", value: s), .init(name: "md", value: "dr"),
                            .init(name: "ipa", value: "1"), .init(name: "max", value: "1")]
            let (data, resp) = try await URLSession.shared.data(for: URLRequest(url: c.url!, timeoutInterval: 6))
            guard (resp as? HTTPURLResponse)?.statusCode == 200,
                  let e = try JSONDecoder().decode([Entry].self, from: data).first,
                  e.word.lowercased() == s.lowercased() else { return nil } // sp= can fuzzy-match
            return e
        }
        var entry = try await fetch(lemma)
        if entry == nil, let base = Lemma.baseCandidates(lemma).first { entry = try? await fetch(base) }
        guard let entry else { throw URLError(.fileDoesNotExist) }
        let reading = entry.tags?.first { $0.hasPrefix("ipa_pron:") }.map { "/\($0.dropFirst(9))/" }
        let defs = (entry.defs ?? []).prefix(2).map { d -> String in
            let parts = d.split(separator: "\t", maxSplits: 1)
            return parts.count == 2 ? "(\(parts[0])) \(parts[1].trimmingCharacters(in: .whitespaces))" : d
        }
        return Result(plain: defs.isEmpty ? nil : defs.joined(separator: "\n"), zh: nil, reading: reading)
    }
}
