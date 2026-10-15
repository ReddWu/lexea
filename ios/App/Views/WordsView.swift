import SwiftUI

struct WordsView: View {
    @Environment(WordStore.self) private var store
    @State private var search = ""
    @State private var filter = Filter.all
    @State private var adding = false

    enum Filter: String, CaseIterable { case all = "All", due = "Due", mastered = "Mastered", archived = "Archived" }

    private var rows: [WordRecord] {
        let now = Date()
        return store.words
            .filter {
                switch filter {
                case .all: return $0.status != "archived"
                case .due: return $0.isActive && $0.due <= now
                case .mastered: return $0.isMastered
                case .archived: return $0.status == "archived"
                }
            }
            .filter { search.isEmpty || $0.word.localizedCaseInsensitiveContains(search) || $0.lemma.localizedCaseInsensitiveContains(search) }
            .sorted { ($0.createdAt ?? .distantPast) > ($1.createdAt ?? .distantPast) }
    }

    var body: some View {
        NavigationStack {
            List {
                Picker("Filter", selection: $filter) {
                    ForEach(Filter.allCases, id: \.self) { Text($0.rawValue) }
                }
                .pickerStyle(.segmented)
                .listRowSeparator(.hidden)

                ForEach(rows) { w in
                    NavigationLink(value: w) { WordRow(w: w) }
                }
                .onDelete { idx in
                    let doomed = idx.map { rows[$0] }
                    Task { for w in doomed { await store.delete(w) } }
                }
            }
            .listStyle(.plain)
            .overlay {
                if rows.isEmpty && !store.loading {
                    ContentUnavailableView(search.isEmpty ? "No words yet" : "No matches", systemImage: "text.magnifyingglass")
                }
            }
            .searchable(text: $search)
            .refreshable { await store.refresh() }
            .navigationTitle("Words (\(store.words.count))")
            .navigationDestination(for: WordRecord.self) { WordDetailView(id: $0.id) }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { adding = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $adding) { AddWordView() }
        }
    }
}

struct WordRow: View {
    let w: WordRecord

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline) {
                Text(w.word).font(.headline)
                if w.lang != "en" { Text(w.lang).font(.caption2).foregroundStyle(.secondary) }
                Spacer()
                Text(dueText).font(.caption).foregroundStyle(w.due <= Date() ? .orange : .secondary)
            }
            if let g = w.chineseGloss ?? w.englishGloss {
                Text(g).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
            } else if let s = w.latestSentence {
                Text(s).font(.subheadline).foregroundStyle(.secondary).lineLimit(1).italic()
            }
        }
    }

    private var dueText: String {
        if w.status == "known" { return "known" }
        if w.due <= Date() { return "due" }
        return w.due.formatted(.relative(presentation: .numeric, unitsStyle: .abbreviated))
    }
}

struct WordDetailView: View {
    @Environment(WordStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let id: String?

    private var w: WordRecord? { store.words.first { $0.id == id } }

    var body: some View {
        if let w {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text(w.word).font(.system(size: 34, weight: .semibold, design: .serif))
                            SpeakButton(text: w.word, lang: w.lang).font(.title3)
                        }
                        if let p = w.phonetic { Text(p).foregroundStyle(.secondary) }
                        if let g = w.englishGloss { Text(g) }
                        if let z = w.chineseGloss { Text(z).foregroundStyle(.secondary) }
                    }
                    .padding(.vertical, 4)
                }
                Section("Seen in") {
                    if w.contexts.isEmpty { Text("No saved sentences").foregroundStyle(.secondary) }
                    ForEach(w.contexts.reversed(), id: \.self) { c in
                        VStack(alignment: .leading, spacing: 4) {
                            HighlightedSentence(sentence: c.sentence, word: w.word)
                            if let u = c.url, let url = URL(string: u) {
                                Link(c.title ?? url.host() ?? u, destination: url).font(.caption).lineLimit(1)
                            }
                        }
                    }
                }
                Section("Progress") {
                    LabeledContent("Next review", value: w.due.formatted(date: .abbreviated, time: .shortened))
                    LabeledContent("Interval", value: "\(w.intervalDays) days")
                    LabeledContent("Reviews", value: "\(w.reps)")
                    LabeledContent("Lapses", value: "\(w.lapses)")
                    LabeledContent("Ease", value: String(format: "%.2f", w.ease))
                }
                Section {
                    if w.status == "active" {
                        Button("Mark as known") { Task { await store.setStatus(w, "known") } }
                        Button("Archive") { Task { await store.setStatus(w, "archived") } }
                    } else {
                        Button("Back to reviewing") { Task { await store.setStatus(w, "active") } }
                    }
                    Button("Delete", role: .destructive) {
                        Task { await store.delete(w); dismiss() }
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .task { _ = await store.ensureDefinition(w) }
        } else {
            ContentUnavailableView("Word not found", systemImage: "questionmark")
        }
    }
}

struct AddWordView: View {
    @Environment(WordStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @AppStorage("defaultLang", store: UserDefaults(suiteName: CaptureQueue.appGroup)) private var lang = "en"
    @State private var word = ""
    @State private var sentence = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                TextField("Word or phrase", text: $word)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                TextField("Sentence it appeared in (optional)", text: $sentence, axis: .vertical)
                    .lineLimit(2...5)
                Picker("Language", selection: $lang) {
                    ForEach(Languages.all, id: \.code) { Text($0.name).tag($0.code) }
                }
                if let error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle("Add word")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        saving = true
                        Task {
                            do {
                                try await store.add(word: word, lang: lang, sentence: sentence, url: nil, title: nil)
                                dismiss()
                            } catch {
                                self.error = error.localizedDescription
                            }
                            saving = false
                        }
                    }
                    .disabled(word.trimmingCharacters(in: .whitespaces).isEmpty || saving)
                }
            }
        }
    }
}
