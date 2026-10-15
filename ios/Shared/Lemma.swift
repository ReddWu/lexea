import Foundation

/// Lemma rules ported from extension/background.js, so a word saved on the
/// phone lands on the same card as the one saved in Chrome.
enum Lemma {
    static let langs = ["en", "zh", "es", "fr", "ja"]

    static func cleanSurface(_ word: String) -> String {
        word.precomposedStringWithCanonicalMapping
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func canonical(_ word: String, lang: String) -> String {
        var lemma = cleanSurface(word).lowercased(with: lang == "es" ? Locale(identifier: "es") : nil)
        if lang == "es" {
            // keep punctuation in `word` for display, but ¿Qué tal?, "qué tal" and qué tal share a card
            let punct = #"[¿¡"'“”«»()\[\]{}.,;:!?…\-–—\s]+"#
            lemma = lemma
                .replacingOccurrences(of: "^" + punct, with: "", options: .regularExpression)
                .replacingOccurrences(of: punct + "$", with: "", options: .regularExpression)
                .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        }
        return lemma
    }

    // "running", "runs", "ran" and "run" are one word. Conservative on purpose:
    // plural/3rd-person -s, -ing, -ed and common irregulars only.
    static let irregular: [String: String] = [
        "went": "go", "gone": "go", "ran": "run", "ate": "eat", "eaten": "eat", "was": "be", "were": "be", "been": "be",
        "children": "child", "mice": "mouse", "feet": "foot", "teeth": "tooth", "men": "man", "women": "woman",
        "people": "person", "geese": "goose", "took": "take", "taken": "take", "made": "make", "said": "say",
        "saw": "see", "seen": "see", "came": "come", "knew": "know", "known": "know", "thought": "think",
        "bought": "buy", "brought": "bring", "felt": "feel", "kept": "keep", "left": "leave", "lost": "lose",
        "met": "meet", "paid": "pay", "sold": "sell", "told": "tell", "understood": "understand", "wrote": "write",
        "written": "write", "spoke": "speak", "spoken": "speak", "broke": "break", "broken": "break",
        "chose": "choose", "chosen": "choose", "drove": "drive", "driven": "drive", "fell": "fall", "fallen": "fall",
        "flew": "fly", "flown": "fly", "forgot": "forget", "forgotten": "forget", "gave": "give", "given": "give",
        "grew": "grow", "grown": "grow", "held": "hold", "led": "lead", "rose": "rise", "risen": "rise",
        "sang": "sing", "sung": "sing", "sat": "sit", "slept": "sleep", "stood": "stand", "swam": "swim",
        "threw": "throw", "thrown": "throw", "woke": "wake", "woken": "wake", "wore": "wear", "worn": "wear", "won": "win",
    ]
    private static let cons = Set("bcdfghjklmnpqrstvwxz")

    /// Candidates in the same order the JS Set yields them (insertion order, no dupes).
    static func baseCandidates(_ w: String) -> [String] {
        var out = OrderedSet()
        if let irr = irregular[w] { out.insert(irr) }
        if w.hasSuffix("ies") && w.count > 4 { out.insert(String(w.dropLast(3)) + "y") }
        if w.range(of: "(ches|shes|xes|zes|sses|oes)$", options: .regularExpression) != nil { out.insert(String(w.dropLast(2))) }
        if w.hasSuffix("s") && w.range(of: "(ss|us|is)$", options: .regularExpression) == nil && w.count > 3 {
            out.insert(String(w.dropLast()))
        }
        for (suf, minLen) in [("ing", 5), ("ed", 4)] where w.hasSuffix(suf) && w.count >= minLen {
            let s = String(w.dropLast(suf.count))
            out.insert(s)        // walk(ing) → walk
            out.insert(s + "e")  // mak(ing) → make
            let chars = Array(s)
            if chars.count > 2, chars[chars.count - 1] == chars[chars.count - 2], cons.contains(chars[chars.count - 1]) {
                out.insert(String(s.dropLast())) // runn → run
            }
        }
        if w.hasSuffix("ied") && w.count > 4 { out.insert(String(w.dropLast(3)) + "y") } // studied → study
        return out.items.filter { $0 != w }
    }

    private struct OrderedSet {
        var items: [String] = []
        mutating func insert(_ s: String) { if !items.contains(s) { items.append(s) } }
    }

    /// Which existing card an incoming word belongs to. English gets the
    /// inflection dance; Spanish matches punctuation-insensitively; others match exactly.
    static func resolve(_ word: String, lang: String, existing: [String]) -> String {
        let lemma = canonical(word, lang: lang)
        if lang == "es" {
            return existing.first { canonical($0, lang: "es") == lemma } ?? lemma
        }
        guard lang == "en" else { return lemma }
        let have = Set(existing)
        if have.contains(lemma) { return lemma }
        if let c = baseCandidates(lemma).first(where: have.contains) { return c }
        if let l = existing.first(where: { baseCandidates($0).contains(lemma) }) { return l }
        return lemma
    }

    /// Learning language implied by the script (kana → ja, Han → zh); nil for Latin text.
    static func guessLang(_ text: String) -> String? {
        if text.unicodeScalars.contains(where: { (0x3040...0x30FF).contains($0.value) }) { return "ja" }
        if text.unicodeScalars.contains(where: { (0x4E00...0x9FFF).contains($0.value) }) { return "zh" }
        return nil
    }
}
