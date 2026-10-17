import SwiftUI

struct TutorView: View {
    @Environment(TutorStore.self) private var tutor
    @Environment(WordStore.self) private var store
    @State private var draft = ""
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                transcript
                inputBar
            }
            .navigationTitle("Tutor")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbar }
            .onChange(of: tutor.wordsChanged) { _, _ in
                Task { await store.refresh() }
            }
        }
    }

    private var visible: [TutorStore.Message] { tutor.messages.filter { !$0.hidden } }

    private var showTyping: Bool {
        guard tutor.busy, let last = tutor.messages.last else { return tutor.busy }
        return last.role != "assistant" || last.content.isEmpty
    }

    private var transcript: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    ForEach(visible) { m in
                        Bubble(message: m, forms: wordForms).id(m.id)
                    }
                    footer
                }
                .padding()
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: tutor.messages.last?.content) { _, _ in
                withAnimation { proxy.scrollTo(tutor.messages.last?.id, anchor: .bottom) }
            }
            .onChange(of: tutor.busy) { _, busy in
                withAnimation {
                    if busy { proxy.scrollTo("typing", anchor: .bottom) } else { proxy.scrollTo(tutor.messages.last?.id, anchor: .bottom) }
                }
            }
        }
    }

    @ViewBuilder private var footer: some View {
        if showTyping { TypingDots().id("typing") }
        if let e = tutor.error {
            Text(e).font(.footnote).foregroundStyle(.red)
        }
        if tutor.ended {
            Button("Start a new session") { Task { await tutor.newSession() } }
                .frame(maxWidth: .infinity).padding(.top, 8)
        }
    }

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .principal) {
            Picker("Mode", selection: modeBinding) {
                ForEach(TutorStore.Mode.allCases, id: \.self) { Text($0.label) }
            }
            .pickerStyle(.segmented)
            .frame(width: 180)
            .disabled(tutor.busy)
        }
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button("Quiz me") { Task { await tutor.send("Quiz me on my words.") } }
                Button("End session") { Task { await tutor.endSession() } }
                    .disabled(tutor.ended || tutor.messages.isEmpty)
                Button("New session") { Task { await tutor.newSession() } }
            } label: { Image(systemName: "ellipsis.circle") }
            .disabled(tutor.busy)
        }
    }

    private var modeBinding: Binding<TutorStore.Mode> {
        Binding { tutor.mode } set: { tutor.mode = $0 }
    }

    private var inputBar: some View {
        HStack(alignment: .bottom, spacing: 8) {
            TextField(tutor.ended ? "Session ended" : tutor.mode == .companion ? "Talk about anything" : "Practice, or try “quiz me”",
                      text: $draft, axis: .vertical)
                .lineLimit(1...5)
                .focused($focused)
                .padding(.horizontal, 14).padding(.vertical, 9)
                .background(.quaternary.opacity(0.6), in: RoundedRectangle(cornerRadius: 20))
                .disabled(tutor.ended)
            Button {
                let text = draft
                draft = ""
                Task { await tutor.send(text) }
            } label: {
                Image(systemName: "arrow.up.circle.fill").font(.system(size: 32))
            }
            .disabled(tutor.busy || tutor.ended || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.horizontal).padding(.vertical, 8)
        .background(.bar)
    }

    /// The learner's active words plus simple inflections, for highlighting in Mia's replies.
    private var wordForms: Set<String> {
        var s = Set<String>()
        for w in store.words where w.isActive {
            let l = w.lemma.lowercased()
            s.insert(l)
            s.insert(w.word.lowercased())
            if l.range(of: "^[a-z'-]+$", options: .regularExpression) != nil {
                s.formUnion([l + "s", l + "es", l + "ed", l + "d", l + "ing", l + "ly"])
                if l.hasSuffix("e") { s.insert(String(l.dropLast()) + "ing") }
                if l.hasSuffix("y") { s.formUnion([String(l.dropLast()) + "ies", String(l.dropLast()) + "ied"]) }
            }
        }
        return s
    }
}

private struct Bubble: View {
    let message: TutorStore.Message
    let forms: Set<String>

    private var isUser: Bool { message.role == "user" }

    var body: some View {
        VStack(alignment: isUser ? .trailing : .leading, spacing: 4) {
            Text(isUser ? AttributedString(message.content) : rendered)
                .padding(.horizontal, 14).padding(.vertical, 10)
                .foregroundStyle(isUser ? .white : .primary)
                .background(isUser ? AnyShapeStyle(.indigo) : AnyShapeStyle(.quaternary.opacity(0.6)),
                            in: RoundedRectangle(cornerRadius: 18))
                .textSelection(.enabled)
            ForEach(message.notes, id: \.self) { n in
                Label(n, systemImage: n.hasPrefix("Saved") ? "plus.circle" : "checkmark.circle")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: isUser ? .trailing : .leading)
        .padding(isUser ? .leading : .trailing, 40)
    }

    /// Markdown from the model, with the learner's own words in bold indigo.
    private var rendered: AttributedString {
        var a = (try? AttributedString(markdown: message.content,
                                       options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)))
            ?? AttributedString(message.content)
        let plain = String(a.characters)
        guard let re = try? NSRegularExpression(pattern: "[A-Za-z][A-Za-z'’-]*") else { return a }
        for m in re.matches(in: plain, range: NSRange(plain.startIndex..., in: plain)) {
            guard let r = Range(m.range, in: plain), forms.contains(plain[r].lowercased()) else { continue }
            let lo = a.characters.index(a.startIndex, offsetBy: plain.distance(from: plain.startIndex, to: r.lowerBound))
            let hi = a.characters.index(lo, offsetBy: plain.distance(from: r.lowerBound, to: r.upperBound))
            a[lo..<hi].foregroundColor = .indigo
            a[lo..<hi].inlinePresentationIntent = .stronglyEmphasized
        }
        return a
    }
}

private struct TypingDots: View {
    @State private var on = false
    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<3) { i in
                Circle().frame(width: 7, height: 7)
                    .opacity(on ? 1 : 0.3)
                    .animation(.easeInOut(duration: 0.6).repeatForever().delay(Double(i) * 0.2), value: on)
            }
        }
        .foregroundStyle(.secondary)
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(.quaternary.opacity(0.6), in: RoundedRectangle(cornerRadius: 18))
        .onAppear { on = true }
    }
}
