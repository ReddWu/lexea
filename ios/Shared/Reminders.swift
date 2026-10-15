import Foundation
import UserNotifications

/// Daily "words are due" reminders, computed from the real due dates: one
/// local notification per day for the next week at the chosen time, skipped
/// on days where nothing is due. Re-planned whenever the word list changes.
enum Reminders {
    static let enabledKey = "remindersOn"
    static let minutesKey = "reminderMinutes" // minutes after midnight
    static let defaultMinutes = 20 * 60
    private static let idPrefix = "mia.review."
    private static let daysAhead = 7

    static var enabled: Bool { UserDefaults.standard.bool(forKey: enabledKey) }
    static var minutes: Int {
        UserDefaults.standard.object(forKey: minutesKey) as? Int ?? defaultMinutes
    }

    /// Asks for permission. Returns false when the user said no.
    static func requestPermission() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    static func reschedule(_ words: [WordRecord], now: Date = Date()) async {
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(idPrefix) }
        center.removePendingNotificationRequests(withIdentifiers: pending)

        let settings = await center.notificationSettings()
        let allowed = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
        let active = words.filter(\.isActive)
        try? await center.setBadgeCount(allowed && enabled ? active.filter { $0.due <= now }.count : 0)
        guard allowed, enabled else { return }

        for (day, fire) in plan(now: now).enumerated() {
            let due = active.filter { $0.due <= fire }
            guard !due.isEmpty else { continue }
            let content = UNMutableNotificationContent()
            content.title = due.count == 1 ? "1 word to review" : "\(due.count) words to review"
            content.body = sampleLine(due)
            content.sound = .default
            content.badge = NSNumber(value: due.count)
            let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: fire)
            let req = UNNotificationRequest(identifier: idPrefix + "\(day)", content: content,
                                            trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: false))
            try? await center.add(req)
        }
    }

    /// Fire times for the next week at the chosen time of day, future ones only.
    static func plan(now: Date, calendar: Calendar = .current) -> [Date] {
        let start = calendar.startOfDay(for: now)
        return (0..<daysAhead).compactMap { d in
            guard let day = calendar.date(byAdding: .day, value: d, to: start),
                  let fire = calendar.date(byAdding: .minute, value: minutes, to: day) else { return nil }
            return fire > now ? fire : nil
        }
    }

    /// "ephemeral, leverage, ubiquitous and 4 more" — weakest (most lapses) first.
    static func sampleLine(_ due: [WordRecord]) -> String {
        let names = due.sorted { $0.lapses > $1.lapses }.prefix(3).map(\.word)
        let rest = due.count - names.count
        let list = names.joined(separator: ", ")
        return rest > 0 ? "\(list) and \(rest) more" : list
    }
}
