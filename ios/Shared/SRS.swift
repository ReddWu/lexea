import Foundation

/// SM-2 spaced repetition. Line-for-line port of web/lib/srs.js so the app,
/// the website and the extension schedule cards identically.
enum SRS {
    enum Rating: Int, CaseIterable {
        case again = 1, hard, good, easy
        var label: String {
            switch self {
            case .again: return "Again"
            case .hard: return "Hard"
            case .good: return "Good"
            case .easy: return "Easy"
            }
        }
    }

    struct Result: Equatable {
        var ease: Double
        var intervalDays: Int
        var reps: Int
        var lapses: Int
        var state: String
        var due: Date
        var lastReview: Date
    }

    static let maxInterval = 3650 // ~10y — repeated test grading exploded this once

    static func schedule(_ w: WordRecord, _ rating: Rating, now: Date = Date()) -> Result {
        var ease = w.ease == 0 ? 2.5 : w.ease
        var interval = w.intervalDays
        var reps = w.reps
        var lapses = w.lapses
        let state: String
        let due: Date
        let isNew = w.state == "new" || reps == 0

        if rating == .again {
            lapses += 1
            ease = max(1.3, ease - 0.2)
            interval = 0
            state = "relearning"
            due = now.addingTimeInterval(10 * 60) // ~10 min, returns this session
        } else {
            if isNew {
                interval = rating == .easy ? 4 : 1
                if rating == .hard { ease = max(1.3, ease - 0.15) }
                if rating == .easy { ease += 0.15 }
            } else if rating == .hard {
                ease = max(1.3, ease - 0.15)
                interval = max(1, jsRound(Double(interval) * 1.2))
            } else if rating == .good {
                interval = max(1, jsRound(Double(interval) * ease))
            } else {
                ease += 0.15
                interval = max(1, jsRound(Double(interval) * ease * 1.3))
            }
            reps += 1
            state = "review"
            interval = min(interval, maxInterval)
            due = now.addingTimeInterval(Double(interval) * 86400)
        }
        return Result(ease: ease, intervalDays: interval, reps: reps, lapses: lapses,
                      state: state, due: due, lastReview: now)
    }

    /// Math.round semantics (half rounds up, toward +∞).
    static func jsRound(_ x: Double) -> Int { Int((x + 0.5).rounded(.down)) }

    /// Today's queue, same rule as the website: due reviews first, then up to
    /// `newPerSession` new cards.
    static func queue(_ words: [WordRecord], now: Date = Date(), newPerSession: Int = 20) -> [WordRecord] {
        let due = words.filter { $0.isActive && $0.due <= now }.sorted { $0.due < $1.due }
        return due.filter { !$0.isNew } + due.filter { $0.isNew }.prefix(newPerSession)
    }
}
