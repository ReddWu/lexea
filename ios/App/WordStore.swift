import Foundation
import Supabase
import Observation

/// The signed-in user's word list. `public.words` is the source of truth;
/// RLS scopes every query to the current user. A JSON cache keeps the list
/// readable offline and on cold start.
@MainActor @Observable
final class WordStore {
    private(set) var words: [WordRecord] = []
    private(set) var loading = false
    private(set) var pendingCount = CaptureQueue.all().count
    var error: String?

    private var userId: String?
    private var db: SupabaseClient { Backend.client }

    // MARK: lifecycle

    func start(userId: String) async {
        if self.userId != userId {
            self.userId = userId
            words = loadCache()
        }
        await refresh()
    }

    func reset() {
        userId = nil
        words = []
    }

    #if DEBUG
    func loadDemo(_ demo: [WordRecord]) { words = demo }
    #endif

    func refresh() async {
        guard userId != nil else { return }
        loading = true
        defer { loading = false }
        await ingestPending()
        do {
            let rows: [WordRecord] = try await db.from("words").select()
                .order("due", ascending: true).limit(2000).execute().value
            words = rows
            error = nil
            saveCache()
        } catch {
            self.error = describe(error)
        }
    }

    var reviewQueue: [WordRecord] { SRS.queue(words) }

    // MARK: adding words

    /// Saves a word, merging into an existing card (by lemma) like the extension does.
    @discardableResult
    func add(word raw: String, lang: String, sentence: String?, url: String?, title: String?) async throws -> WordRecord {
        guard let userId else { throw StoreError.signedOut }
        let surface = Lemma.cleanSurface(raw)
        guard !surface.isEmpty else { throw StoreError.emptyWord }
        let lemma = Lemma.resolve(surface, lang: lang, existing: words.filter { $0.lang == lang }.map(\.lemma))

        let existing: [WordRecord] = try await db.from("words").select()
            .eq("lemma", value: lemma).eq("lang", value: lang).limit(1).execute().value

        let saved: WordRecord
        if var cur = existing.first, let id = cur.id {
            let s = sentence?.trimmingCharacters(in: .whitespacesAndNewlines)
            if let s, !s.isEmpty {
                if !cur.contexts.contains(where: { $0.sentence == s }) {
                    cur.contexts.append(.init(sentence: s, url: url, title: title, at: ISO.string(Date())))
                }
                cur.context = s
            }
            let patch = WordPatch(context: cur.context, contexts: cur.contexts, updatedAt: Date())
            let rows: [WordPatch] = try await db.from("words").update(patch).eq("id", value: id)
                .select().execute().value
            guard !rows.isEmpty else { throw StoreError.notFound }
            cur.updatedAt = patch.updatedAt
            saved = cur
        } else {
            let rec = WordRecord.new(word: surface, lemma: lemma, lang: lang, sentence: sentence,
                                     url: url, title: title, userId: userId)
            saved = try await db.from("words").insert(rec).select().single().execute().value
        }
        upsertLocal(saved)
        return saved
    }

    /// Pushes words captured by the share extension while the app was closed.
    func ingestPending() async {
        let pending = CaptureQueue.all()
        guard userId != nil, !pending.isEmpty else { pendingCount = pending.count; return }
        var done = Set<UUID>()
        for c in pending {
            do {
                try await add(word: c.word, lang: c.lang, sentence: c.sentence, url: c.url, title: c.title)
                done.insert(c.id)
            } catch StoreError.emptyWord {
                done.insert(c.id)
            } catch {
                self.error = describe(error)
                break // keep the rest queued; retry on next refresh
            }
        }
        CaptureQueue.remove(ids: done)
        pendingCount = CaptureQueue.all().count
    }

    // MARK: reviewing

    func grade(_ w: WordRecord, _ rating: SRS.Rating) async {
        guard let id = w.id else { return }
        let r = SRS.schedule(w, rating)
        var updated = w
        updated.ease = r.ease; updated.intervalDays = r.intervalDays; updated.reps = r.reps
        updated.lapses = r.lapses; updated.state = r.state; updated.due = r.due
        updated.lastReview = r.lastReview; updated.updatedAt = r.lastReview
        upsertLocal(updated) // optimistic
        let patch = WordPatch(state: r.state, due: r.due, ease: r.ease, intervalDays: r.intervalDays,
                              reps: r.reps, lapses: r.lapses, lastReview: r.lastReview, updatedAt: r.lastReview)
        do {
            try await db.from("words").update(patch).eq("id", value: id).execute()
        } catch {
            self.error = "Couldn't save review: \(describe(error))"
        }
    }

    /// Fills in definition / 中文 / reading the first time a card is revealed.
    func ensureDefinition(_ w: WordRecord) async -> WordRecord {
        guard w.englishGloss == nil || (w.chineseGloss == nil && w.lang != "zh") || w.phonetic == nil, let id = w.id else { return w }
        let d = await Definitions.lookup(w)
        var patch = WordPatch()
        var updated = w
        if w.englishGloss == nil, let p = d.plain { patch.definition = p; updated.definition = p }
        if w.chineseGloss == nil, w.lang != "zh", let z = d.zh { patch.translation = z; updated.translation = z }
        if w.phonetic == nil, let r = d.reading { patch.phonetic = r; updated.phonetic = r }
        guard !patch.isEmpty else { return w }
        upsertLocal(updated)
        _ = try? await db.from("words").update(patch).eq("id", value: id).execute()
        return updated
    }

    func setStatus(_ w: WordRecord, _ status: String) async {
        guard let id = w.id else { return }
        var updated = w
        updated.status = status
        upsertLocal(updated)
        _ = try? await db.from("words").update(WordPatch(status: status, updatedAt: Date())).eq("id", value: id).execute()
    }

    func delete(_ w: WordRecord) async {
        guard let id = w.id else { return }
        words.removeAll { $0.id == id }
        saveCache()
        do { try await db.from("words").delete().eq("id", value: id).execute() } catch { self.error = describe(error) }
    }

    // MARK: helpers

    private func upsertLocal(_ w: WordRecord) {
        if let i = words.firstIndex(where: { $0.id == w.id && w.id != nil }) { words[i] = w } else { words.append(w) }
        saveCache()
    }

    private var cacheURL: URL? {
        guard let userId,
              let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: CaptureQueue.appGroup)
        else { return nil }
        return dir.appendingPathComponent("words-\(userId).json")
    }

    private func loadCache() -> [WordRecord] {
        guard let url = cacheURL, let data = try? Data(contentsOf: url) else { return [] }
        let dec = JSONDecoder(); dec.dateDecodingStrategy = .iso8601
        return (try? dec.decode([WordRecord].self, from: data)) ?? []
    }

    private func saveCache() {
        guard let url = cacheURL else { return }
        let enc = JSONEncoder(); enc.dateEncodingStrategy = .iso8601
        try? enc.encode(words).write(to: url, options: .atomic)
    }

    private func describe(_ e: Error) -> String {
        (e as? LocalizedError)?.errorDescription ?? e.localizedDescription
    }

    enum StoreError: LocalizedError {
        case signedOut, emptyWord, notFound
        var errorDescription: String? {
            switch self {
            case .signedOut: return "Sign in first."
            case .emptyWord: return "Nothing to save."
            case .notFound: return "That word no longer exists."
            }
        }
    }
}

/// Partial update for `public.words`; nil fields are left out of the PATCH body.
struct WordPatch: Codable {
    var context: String?
    var contexts: [WordRecord.ContextEntry]?
    var definition: String?
    var translation: String?
    var phonetic: String?
    var state: String?
    var due: Date?
    var ease: Double?
    var intervalDays: Int?
    var reps: Int?
    var lapses: Int?
    var lastReview: Date?
    var status: String?
    var updatedAt: Date?

    init(context: String? = nil, contexts: [WordRecord.ContextEntry]? = nil, definition: String? = nil,
         translation: String? = nil, phonetic: String? = nil, state: String? = nil, due: Date? = nil,
         ease: Double? = nil, intervalDays: Int? = nil, reps: Int? = nil, lapses: Int? = nil,
         lastReview: Date? = nil, status: String? = nil, updatedAt: Date? = nil) {
        self.context = context; self.contexts = contexts; self.definition = definition
        self.translation = translation; self.phonetic = phonetic; self.state = state; self.due = due
        self.ease = ease; self.intervalDays = intervalDays; self.reps = reps; self.lapses = lapses
        self.lastReview = lastReview; self.status = status; self.updatedAt = updatedAt
    }

    var isEmpty: Bool { definition == nil && translation == nil && phonetic == nil }

    enum CodingKeys: String, CodingKey {
        case context, contexts, definition, translation, phonetic, state, due, ease, reps, lapses, status
        case intervalDays = "interval_days"
        case lastReview = "last_review"
        case updatedAt = "updated_at"
    }
}
