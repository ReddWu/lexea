import Foundation

/// Looks up what a card's back should say. Same sources as the website:
/// the Mia backend /api/define (LLM: simple English + 中文 + reading) and
/// dictionaryapi.dev as the English fallback.
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

    private static func dictionary(_ lemma: String) async throws -> Result {
        struct Entry: Decodable {
            struct Phonetic: Decodable { let text: String? }
            struct Meaning: Decodable {
                struct Def: Decodable { let definition: String }
                let partOfSpeech: String?
                let definitions: [Def]
            }
            let phonetic: String?
            let phonetics: [Phonetic]?
            let meanings: [Meaning]
        }
        func fetch(_ s: String) async throws -> [Entry]? {
            let url = URL(string: "https://api.dictionaryapi.dev/api/v2/entries/en/")!.appendingPathComponent(s)
            // this free API can hang ~20s and then 522 — don't hold the card for it
            let (data, resp) = try await URLSession.shared.data(for: URLRequest(url: url, timeoutInterval: 6))
            guard (resp as? HTTPURLResponse)?.statusCode == 200 else { return nil }
            return try JSONDecoder().decode([Entry].self, from: data)
        }
        var entries = try await fetch(lemma)
        if entries == nil, let base = Lemma.baseCandidates(lemma).first { entries = try? await fetch(base) }
        guard let entries, let first = entries.first else { throw URLError(.fileDoesNotExist) }
        let reading = entries.lazy.compactMap { $0.phonetic ?? $0.phonetics?.compactMap(\.text).first }.first
        let defs = first.meanings.prefix(2).compactMap { m in
            m.definitions.first.map { "\(m.partOfSpeech.map { "(\($0)) " } ?? "")\($0.definition)" }
        }
        return Result(plain: defs.isEmpty ? nil : defs.joined(separator: "\n"), zh: nil, reading: reading)
    }
}
