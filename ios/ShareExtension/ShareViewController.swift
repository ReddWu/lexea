import NaturalLanguage
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// "Save to Echowords" in the share sheet. Pulls the shared text / page URL, lets
/// the user tap the word inside the sentence, and queues it in the App Group.
/// The app pushes the queue to the backend next time it opens.
final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        Task { @MainActor in
            let input = await SharedInput.load(from: extensionContext)
            let host = UIHostingController(rootView: ShareView(input: input) { [weak self] in
                self?.extensionContext?.completeRequest(returningItems: nil)
            })
            addChild(host)
            host.view.frame = view.bounds
            host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            view.addSubview(host.view)
            host.didMove(toParent: self)
        }
    }
}

struct SharedInput {
    var text = ""
    var url: String?
    var title: String?

    @MainActor
    static func load(from context: NSExtensionContext?) async -> SharedInput {
        var out = SharedInput()
        for item in context?.inputItems as? [NSExtensionItem] ?? [] {
            if out.title == nil, let t = item.attributedContentText?.string, !t.isEmpty { out.title = t }
            for p in item.attachments ?? [] {
                if p.hasItemConformingToTypeIdentifier(UTType.url.identifier),
                   let u = try? await p.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL, !u.isFileURL {
                    out.url = out.url ?? u.absoluteString
                } else if p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                          let s = try? await p.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
                    if out.url == nil, let u = URL(string: s.trimmingCharacters(in: .whitespacesAndNewlines)),
                       u.scheme?.hasPrefix("http") == true {
                        out.url = u.absoluteString
                    } else if out.text.isEmpty {
                        out.text = s
                    }
                }
            }
        }
        // the share item's "content text" is often just the selection itself
        if out.title == out.text { out.title = nil }
        out.text = String(out.text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(600))
        return out
    }
}

struct ShareView: View {
    let input: SharedInput
    let finish: () -> Void

    @AppStorage("defaultLang", store: UserDefaults(suiteName: CaptureQueue.appGroup)) private var defaultLang = "en"
    @State private var lang = "en"
    @State private var word = ""
    @State private var selected: [Int] = []
    @State private var saved = false
    @State private var error: String?

    /// A selection of more than a few words is treated as the sentence to pick from.
    private var isSentence: Bool { tokens.count > 3 }
    private var tokens: [String] {
        let tok = NLTokenizer(unit: .word)
        tok.string = input.text
        return tok.tokens(for: input.text.startIndex..<input.text.endIndex).map { String(input.text[$0]) }
    }

    var body: some View {
        NavigationStack {
            Form {
                if isSentence {
                    Section("Tap the word to save") {
                        FlowLayout(spacing: 6) {
                            ForEach(Array(tokens.enumerated()), id: \.offset) { i, t in
                                Button(t) { toggle(i) }
                                    .buttonStyle(.bordered)
                                    .tint(selected.contains(i) ? .indigo : .gray)
                                    .controlSize(.small)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
                Section {
                    TextField("Word or phrase", text: $word)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Picker("Language", selection: $lang) {
                        ForEach(langs, id: \.0) { Text($0.1).tag($0.0) }
                    }
                } footer: {
                    if let u = input.url { Text(input.title ?? u).lineLimit(1) }
                }
                if let error { Text(error).foregroundStyle(.red) }
                if saved {
                    Label("Saved. Open Echowords to sync.", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                }
            }
            .navigationTitle("Save to Echowords")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: finish) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save).disabled(word.trimmingCharacters(in: .whitespaces).isEmpty || saved)
                }
            }
        }
        .onAppear {
            lang = Lemma.guessLang(input.text) ?? defaultLang
            if !isSentence { word = input.text }
        }
    }

    private let langs = [("en", "English"), ("es", "Español"), ("fr", "Français"), ("ja", "日本語"), ("zh", "中文")]

    private func toggle(_ i: Int) {
        if let k = selected.firstIndex(of: i) { selected.remove(at: k) } else { selected.append(i) }
        selected.sort()
        let sep = (lang == "zh" || lang == "ja") ? "" : " "
        word = selected.map { tokens[$0] }.joined(separator: sep)
    }

    private func save() {
        do {
            try CaptureQueue.append(PendingCapture(
                word: word, lang: lang,
                sentence: isSentence ? input.text : nil,
                url: input.url, title: input.title))
            saved = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8, execute: finish)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Wraps chips onto multiple lines.
struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        return CGSize(width: proposal.width ?? rows.map(\.width).max() ?? 0,
                      height: rows.map(\.height).reduce(0, +) + spacing * CGFloat(max(0, rows.count - 1)))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for i in row.items {
                let s = subviews[i].sizeThatFits(.unspecified)
                subviews[i].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
                x += s.width + spacing
            }
            y += row.height + spacing
        }
    }

    private struct Row { var items: [Int] = []; var width: CGFloat = 0; var height: CGFloat = 0 }

    private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows = [Row()]
        for i in subviews.indices {
            let s = subviews[i].sizeThatFits(.unspecified)
            if !rows[rows.count - 1].items.isEmpty && rows[rows.count - 1].width + spacing + s.width > width {
                rows.append(Row())
            }
            var r = rows[rows.count - 1]
            r.width += (r.items.isEmpty ? 0 : spacing) + s.width
            r.height = max(r.height, s.height)
            r.items.append(i)
            rows[rows.count - 1] = r
        }
        return rows
    }
}
