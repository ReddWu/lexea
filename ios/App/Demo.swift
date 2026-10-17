#if DEBUG
import Foundation

/// Debug-only sample data for App Store screenshots: launch with `-demo` (plus `-tab N`,
/// `-card`) to show the signed-in UI without touching the backend.
enum Demo {
    private static var args: [String] { ProcessInfo.processInfo.arguments }
    static var on: Bool { args.contains("-demo") }
    static var showCard: Bool { args.contains("-card") }
    static var tab: Int {
        guard let i = args.firstIndex(of: "-tab"), i + 1 < args.count else { return 0 }
        return Int(args[i + 1]) ?? 0
    }

    static let words: [WordRecord] = {
        let now = Date()
        let samples: [(String, String, String, String, String, String, Int, Int)] = [
            ("ephemeral", "/ɪˈfem(ə)rəl/", "lasting for a very short time", "短暂的",
             "Fame in the age of social media is ephemeral.", "The Atlantic", 0, -1),
            ("ubiquitous", "/juːˈbɪkwɪtəs/", "found everywhere", "无处不在的",
             "Smartphones have become ubiquitous in daily life.", "The Economist", 3, -1),
            ("meticulous", "/məˈtɪkjʊləs/", "very careful about every detail", "一丝不苟的",
             "She kept meticulous notes on every experiment.", "Nature", 1, -1),
            ("serendipity", "/ˌser(ə)nˈdɪpɪti/", "finding something good by chance", "意外收获",
             "Their meeting was pure serendipity.", "The New Yorker", 0, -1),
            ("resilient", "/rɪˈzɪlɪənt/", "able to recover quickly from difficulty", "有韧性的",
             "Cities need resilient power grids.", "Wired", 6, 2),
            ("candid", "/ˈkandɪd/", "honest and direct", "坦率的",
             "He gave a candid interview about his failures.", "BBC News", 12, 5),
            ("nuance", "/ˈnjuːɑːns/", "a subtle difference in meaning", "细微差别",
             "The translation lost much of the poem's nuance.", "The Guardian", 25, 9),
            ("pragmatic", "/praɡˈmatɪk/", "dealing with things sensibly and realistically", "务实的",
             "We need a pragmatic approach to the budget.", "Financial Times", 30, 14),
            ("elusive", "/ɪˈluːsɪv/", "difficult to find, catch, or achieve", "难以捉摸的",
             "A cure has remained elusive for decades.", "Scientific American", 2, -1),
            ("intricate", "/ˈɪntrɪkət/", "very complicated or detailed", "错综复杂的",
             "The novel has an intricate plot.", "The New York Times", 9, 3),
        ]
        return samples.enumerated().map { i, s in
            var w = WordRecord.new(word: s.0, lemma: s.0, lang: "en", sentence: s.4,
                                   url: nil, title: s.5, userId: nil,
                                   now: now.addingTimeInterval(Double(-i) * 86_400 * 1.3))
            w.id = "demo-\(i)"
            w.phonetic = s.1
            w.definition = s.2
            w.translation = s.3
            w.intervalDays = s.6
            w.reps = s.6 == 0 ? 0 : 3
            w.state = s.6 == 0 ? "new" : "review"
            w.due = now.addingTimeInterval(Double(s.7) * 86_400)
            return w
        }
    }()
}
#endif
