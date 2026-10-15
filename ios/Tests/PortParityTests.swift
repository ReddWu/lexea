import XCTest

/// Expected values were produced by running web/lib/srs.js and the
/// baseCandidates() function from extension/background.js under node, so these
/// tests pin the Swift port to the JS behaviour.
final class PortParityTests: XCTestCase {
    // (state, reps, ease, interval, lapses, rating) -> (ease, interval, reps, lapses, state, due offset seconds)
    let srsCases: [(String, Int, Double, Int, Int, Int, Double, Int, Int, Int, String, Double)] = [
        ("new", 0, 2.5, 0, 0, 1, 2.3, 0, 0, 1, "relearning", 600),
        ("new", 0, 2.5, 0, 0, 2, 2.35, 1, 1, 0, "review", 86400),
        ("new", 0, 2.5, 0, 0, 3, 2.5, 1, 1, 0, "review", 86400),
        ("new", 0, 2.5, 0, 0, 4, 2.65, 4, 1, 0, "review", 345600),
        ("review", 3, 2.5, 6, 0, 1, 2.3, 0, 3, 1, "relearning", 600),
        ("review", 3, 2.5, 6, 0, 2, 2.35, 7, 4, 0, "review", 604800),
        ("review", 3, 2.5, 6, 0, 3, 2.5, 15, 4, 0, "review", 1296000),
        ("review", 3, 2.5, 6, 0, 4, 2.65, 21, 4, 0, "review", 1814400),
        ("review", 5, 1.3, 15, 2, 1, 1.3, 0, 5, 3, "relearning", 600),
        ("review", 5, 1.3, 15, 2, 2, 1.3, 18, 6, 2, "review", 1555200),
        ("review", 5, 1.3, 15, 2, 3, 1.3, 20, 6, 2, "review", 1728000),
        ("review", 5, 1.3, 15, 2, 4, 1.45, 28, 6, 2, "review", 2419200),
        ("relearning", 4, 2.1, 0, 1, 1, 1.9, 0, 4, 2, "relearning", 600),
        ("relearning", 4, 2.1, 0, 1, 2, 1.95, 1, 5, 1, "review", 86400),
        ("relearning", 4, 2.1, 0, 1, 3, 2.1, 1, 5, 1, "review", 86400),
        ("relearning", 4, 2.1, 0, 1, 4, 2.25, 1, 5, 1, "review", 86400),
        ("review", 9, 2.8, 3000, 0, 1, 2.6, 0, 9, 1, "relearning", 600),
        ("review", 9, 2.8, 3000, 0, 2, 2.65, 3600, 10, 0, "review", 311040000),
        ("review", 9, 2.8, 3000, 0, 3, 2.8, 3650, 10, 0, "review", 315360000),
        ("review", 9, 2.8, 3000, 0, 4, 2.95, 3650, 10, 0, "review", 315360000),
    ]

    func testScheduleMatchesJS() {
        let now = Date(timeIntervalSince1970: 1_791_590_400)
        for c in srsCases {
            var w = WordRecord.new(word: "x", lemma: "x", lang: "en", sentence: nil, url: nil, title: nil, userId: nil, now: now)
            w.state = c.0; w.reps = c.1; w.ease = c.2; w.intervalDays = c.3; w.lapses = c.4
            let r = SRS.schedule(w, SRS.Rating(rawValue: c.5)!, now: now)
            let label = "\(c.0) reps=\(c.1) ease=\(c.2) ivl=\(c.3) rating=\(c.5)"
            XCTAssertEqual(r.ease, c.6, accuracy: 1e-9, label)
            XCTAssertEqual(r.intervalDays, c.7, label)
            XCTAssertEqual(r.reps, c.8, label)
            XCTAssertEqual(r.lapses, c.9, label)
            XCTAssertEqual(r.state, c.10, label)
            XCTAssertEqual(r.due.timeIntervalSince(now), c.11, accuracy: 0.001, label)
        }
    }

    func testBaseCandidatesMatchJS() {
        XCTAssertEqual(Lemma.baseCandidates("running"), ["runn", "runne", "run"])
        XCTAssertEqual(Lemma.baseCandidates("studies"), ["study", "studie"])
        XCTAssertEqual(Lemma.baseCandidates("studied"), ["studi", "studie", "study"])
        XCTAssertEqual(Lemma.baseCandidates("made"), ["make"])
        XCTAssertEqual(Lemma.baseCandidates("boxes"), ["box", "boxe"])
        XCTAssertEqual(Lemma.baseCandidates("teacher"), [])
        XCTAssertEqual(Lemma.baseCandidates("making"), ["mak", "make"])
        XCTAssertEqual(Lemma.baseCandidates("stopped"), ["stopp", "stoppe", "stop"])
        XCTAssertEqual(Lemma.baseCandidates("bus"), [])
        XCTAssertEqual(Lemma.baseCandidates("cats"), ["cat"])
    }

    func testResolveMergesInflections() {
        XCTAssertEqual(Lemma.resolve("Running", lang: "en", existing: ["run"]), "run")
        XCTAssertEqual(Lemma.resolve("run", lang: "en", existing: ["running"]), "running")
        XCTAssertEqual(Lemma.resolve("studied", lang: "en", existing: ["study", "studies"]), "study")
        XCTAssertEqual(Lemma.resolve("teacher", lang: "en", existing: ["teach"]), "teacher")
        XCTAssertEqual(Lemma.resolve("  New   York ", lang: "en", existing: []), "new york")
    }

    func testSpanishIgnoresPunctuation() {
        XCTAssertEqual(Lemma.canonical("¿Qué tal?", lang: "es"), "qué tal")
        XCTAssertEqual(Lemma.resolve("\"qué tal\"", lang: "es", existing: ["¿qué tal?"]), "¿qué tal?")
    }

    func testQueueOrdersReviewsBeforeNewAndCapsNew() {
        let now = Date()
        var words: [WordRecord] = []
        for i in 0..<30 {
            words.append(WordRecord.new(word: "n\(i)", lemma: "n\(i)", lang: "en", sentence: nil, url: nil, title: nil, userId: nil, now: now.addingTimeInterval(-60)))
        }
        var old = WordRecord.new(word: "r", lemma: "r", lang: "en", sentence: nil, url: nil, title: nil, userId: nil, now: now)
        old.reps = 2; old.state = "review"; old.due = now.addingTimeInterval(-10)
        var future = old; future.lemma = "f"; future.due = now.addingTimeInterval(3600)
        var known = old; known.lemma = "k"; known.status = "known"
        let q = SRS.queue(words + [old, future, known], now: now)
        XCTAssertEqual(q.first?.lemma, "r")
        XCTAssertEqual(q.count, 21)
    }

    func testGuessLang() {
        XCTAssertEqual(Lemma.guessLang("勉強します"), "ja")
        XCTAssertEqual(Lemma.guessLang("学习"), "zh")
        XCTAssertNil(Lemma.guessLang("hello"))
    }
}
