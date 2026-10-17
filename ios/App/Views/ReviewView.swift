import SwiftUI

struct ReviewView: View {
    @Environment(WordStore.self) private var store
    @State private var queue: [WordRecord] = []
    @State private var total = 0
    @State private var done = 0
    @State private var started = false
    @State private var revealed = false
    @State private var card: WordRecord?
    @State private var lookingUp = false

    var body: some View {
        NavigationStack {
            VStack {
                if !started {
                    startScreen
                } else if let card {
                    cardView(card)
                } else {
                    finished
                }
            }
            .padding()
            .navigationTitle("Review")
            .toolbar {
                if started && card != nil {
                    ToolbarItem(placement: .topBarTrailing) {
                        Text("\(done)/\(total)").monospacedDigit().foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private var startScreen: some View {
        let q = store.reviewQueue
        let reviews = q.filter { !$0.isNew }.count
        return VStack(spacing: 20) {
            Spacer()
            if store.loading && store.words.isEmpty {
                ProgressView()
            } else if q.isEmpty {
                ContentUnavailableView("Nothing due",
                                       systemImage: "checkmark.seal",
                                       description: Text(store.words.isEmpty
                                            ? "Save a word from Safari: select it, tap Share, then Save to Lexea."
                                            : "You're all caught up. New cards show up as they come due."))
            } else {
                Text("\(q.count)").font(.system(size: 64, weight: .bold, design: .rounded))
                Text("\(reviews) to review · \(q.count - reviews) new").foregroundStyle(.secondary)
                Button("Start") { begin() }
                    .buttonStyle(.borderedProminent).controlSize(.large)
            }
            Spacer()
            if store.pendingCount > 0 {
                Label("\(store.pendingCount) saved word(s) waiting to sync", systemImage: "arrow.triangle.2.circlepath")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            if let e = store.error { Text(e).font(.footnote).foregroundStyle(.red) }
        }
        .refreshable { await store.refresh() }
    }

    private func cardView(_ w: WordRecord) -> some View {
        VStack(spacing: 16) {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        Text(Languages.name(w.lang)).font(.caption).padding(.horizontal, 8).padding(.vertical, 3)
                            .background(.quaternary, in: Capsule())
                        if w.isNew { Text("new").font(.caption).foregroundStyle(.indigo) }
                        Spacer()
                    }
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text(w.word).font(.system(size: 40, weight: .semibold, design: .serif))
                        SpeakButton(text: w.word, lang: w.lang).font(.title2)
                    }
                    if let p = w.phonetic { Text(p).foregroundStyle(.secondary) }

                    if revealed {
                        Divider()
                        if lookingUp && w.englishGloss == nil {
                            ProgressView("Looking it up…")
                        } else {
                            Text(w.englishGloss ?? "(no definition — recall it from the sentence)")
                                .font(.title3)
                        }
                        if let zh = w.chineseGloss { Text(zh).font(.title3).foregroundStyle(.secondary) }
                        if let s = w.latestSentence {
                            HighlightedSentence(sentence: s, word: w.word)
                                .padding(12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            if revealed {
                HStack(spacing: 8) {
                    ForEach(SRS.Rating.allCases, id: \.self) { r in
                        Button { Task { await grade(w, r) } } label: {
                            VStack(spacing: 2) {
                                Text(r.label).font(.subheadline.weight(.semibold))
                                Text(nextLabel(w, r)).font(.caption2).foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity).padding(.vertical, 6)
                        }
                        .buttonStyle(.bordered)
                        .tint(r == .again ? .red : r == .hard ? .orange : r == .good ? .green : .blue)
                    }
                }
            } else {
                Button { Task { await reveal(w) } } label: {
                    Text("Show answer").frame(maxWidth: .infinity).padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent).controlSize(.large)
            }
        }
    }

    private var finished: some View {
        ContentUnavailableView {
            Label("Done for now", systemImage: "sparkles")
        } description: {
            Text("You reviewed \(done) card\(done == 1 ? "" : "s").")
        } actions: {
            Button("Back") { started = false }
        }
    }

    private func begin() {
        queue = store.reviewQueue
        total = queue.count
        done = 0
        started = true
        revealed = false
        card = queue.first
    }

    private func reveal(_ w: WordRecord) async {
        revealed = true
        lookingUp = true
        let filled = await store.ensureDefinition(w)
        if card?.id == w.id { card = filled }
        lookingUp = false
    }

    private func grade(_ w: WordRecord, _ r: SRS.Rating) async {
        queue.removeFirst()
        if r == .again {
            // comes back in ~10 min, so see it again this session
            var again = w
            let s = SRS.schedule(w, r)
            again.state = s.state; again.reps = s.reps; again.lapses = s.lapses; again.ease = s.ease; again.intervalDays = 0
            queue.append(again)
        } else {
            done += 1
        }
        revealed = false
        card = queue.first
        await store.grade(w, r)
    }

    private func nextLabel(_ w: WordRecord, _ r: SRS.Rating) -> String {
        let s = SRS.schedule(w, r)
        if r == .again { return "10m" }
        return s.intervalDays >= 30 ? "\(s.intervalDays / 30)mo" : "\(s.intervalDays)d"
    }
}

/// The saved sentence with the word in bold.
struct HighlightedSentence: View {
    let sentence: String
    let word: String

    var body: some View {
        Text(attributed).font(.body).italic()
    }

    private var attributed: AttributedString {
        var a = AttributedString(sentence)
        if let r = a.range(of: word, options: .caseInsensitive) {
            a[r].font = .body.bold().italic()
            a[r].foregroundColor = .indigo
        }
        return a
    }
}
