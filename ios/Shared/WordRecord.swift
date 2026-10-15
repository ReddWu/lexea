import Foundation

/// One row of `public.words`. Field names match the table so the same row
/// round-trips between the extension, the website and the app.
struct WordRecord: Codable, Identifiable, Hashable {
    var id: String?
    var userId: String?
    var word: String
    var lemma: String
    var lang: String
    var translation: String?   // 中文 gloss (legacy rows stored English here)
    var definition: String?    // simple-English explanation
    var phonetic: String?
    var context: String?       // latest sentence it was saved from
    var contexts: [ContextEntry]
    var sourceUrl: String?
    var sourceTitle: String?
    var state: String          // new | learning | review | relearning
    var due: Date
    var ease: Double
    var intervalDays: Int
    var reps: Int
    var lapses: Int
    var lastReview: Date?
    var timesUsedInChat: Int?
    var status: String         // active | known | archived
    var createdAt: Date?
    var updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, word, lemma, lang, translation, definition, phonetic, context, contexts
        case userId = "user_id"
        case sourceUrl = "source_url"
        case sourceTitle = "source_title"
        case state, due, ease
        case intervalDays = "interval_days"
        case reps, lapses
        case lastReview = "last_review"
        case timesUsedInChat = "times_used_in_chat"
        case status
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    struct ContextEntry: Codable, Hashable {
        var sentence: String
        var url: String?
        var title: String?
        var at: String?
    }

    /// A fresh, due-now card — mirrors `newRecord` in extension/background.js.
    static func new(word: String, lemma: String, lang: String, sentence: String?,
                    url: String?, title: String?, userId: String?, now: Date = Date()) -> WordRecord {
        let s = sentence?.trimmingCharacters(in: .whitespacesAndNewlines)
        let sentence = (s?.isEmpty ?? true) ? nil : s
        return WordRecord(
            id: nil, userId: userId, word: Lemma.cleanSurface(word), lemma: lemma,
            lang: Lemma.langs.contains(lang) ? lang : "en",
            translation: nil, definition: nil, phonetic: nil,
            context: sentence,
            contexts: sentence.map { [ContextEntry(sentence: $0, url: url, title: title, at: ISO.string(now))] } ?? [],
            sourceUrl: url, sourceTitle: title,
            state: "new", due: now, ease: 2.5, intervalDays: 0, reps: 0, lapses: 0,
            lastReview: nil, timesUsedInChat: nil, status: "active",
            createdAt: now, updatedAt: now)
    }

    var isNew: Bool { reps == 0 }
    var isActive: Bool { status == "active" }
    var isMastered: Bool { intervalDays >= 21 || status == "known" }
    var latestSentence: String? { context ?? contexts.last?.sentence }

    /// English explanation to show; legacy rows kept English in `translation`.
    var englishGloss: String? {
        if let d = definition, !d.isEmpty { return d }
        if let t = translation, !t.isEmpty, !t.hasCJK { return t }
        return nil
    }

    var chineseGloss: String? {
        if let t = translation, t.hasCJK { return t }
        return nil
    }
}

enum ISO {
    private static let formatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    static func string(_ d: Date) -> String { formatter.string(from: d) }
}

extension String {
    var hasCJK: Bool {
        unicodeScalars.contains { (0x3040...0x30FF).contains($0.value) || (0x3400...0x9FFF).contains($0.value) }
    }
}
