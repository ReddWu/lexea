import XCTest

final class RemindersTests: XCTestCase {
    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: Reminders.minutesKey)
    }

    private var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        return c
    }

    func testPlanSkipsTodayWhenTimeHasPassed() {
        UserDefaults.standard.set(20 * 60, forKey: Reminders.minutesKey) // 8 pm
        let now = cal.date(from: DateComponents(year: 2026, month: 10, day: 15, hour: 21))!
        let plan = Reminders.plan(now: now, calendar: cal)
        XCTAssertEqual(plan.count, 6)
        XCTAssertEqual(cal.component(.day, from: plan[0]), 16)
        XCTAssertEqual(cal.component(.hour, from: plan[0]), 20)
    }

    func testPlanIncludesTodayBeforeTheTime() {
        UserDefaults.standard.set(9 * 60 + 30, forKey: Reminders.minutesKey)
        let now = cal.date(from: DateComponents(year: 2026, month: 10, day: 15, hour: 8))!
        let plan = Reminders.plan(now: now, calendar: cal)
        XCTAssertEqual(plan.count, 7)
        XCTAssertEqual(cal.dateComponents([.day, .hour, .minute], from: plan[0]), DateComponents(day: 15, hour: 9, minute: 30))
    }

    func testSampleLineListsWeakestFirst() {
        func w(_ s: String, lapses: Int) -> WordRecord {
            var r = WordRecord.new(word: s, lemma: s, lang: "en", sentence: nil, url: nil, title: nil, userId: nil)
            r.lapses = lapses
            return r
        }
        XCTAssertEqual(Reminders.sampleLine([w("a", lapses: 0), w("b", lapses: 3)]), "b, a")
        XCTAssertEqual(Reminders.sampleLine((0..<5).map { w("w\($0)", lapses: $0) }), "w4, w3, w2 and 2 more")
    }
}
