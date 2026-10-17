import SwiftUI

struct SettingsView: View {
    @Environment(SessionStore.self) private var session
    @Environment(WordStore.self) private var store
    @AppStorage("defaultLang", store: UserDefaults(suiteName: CaptureQueue.appGroup)) private var lang = "en"
    @AppStorage(Reminders.enabledKey) private var remindersOn = false
    @AppStorage(Reminders.minutesKey) private var reminderMinutes = Reminders.defaultMinutes
    @State private var reminderNote: String?

    private var reminderTime: Binding<Date> {
        Binding {
            Calendar.current.date(byAdding: .minute, value: reminderMinutes, to: Calendar.current.startOfDay(for: Date()))!
        } set: {
            let c = Calendar.current.dateComponents([.hour, .minute], from: $0)
            reminderMinutes = (c.hour ?? 20) * 60 + (c.minute ?? 0)
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    LabeledContent("Signed in as", value: session.user?.email ?? "—")
                    Button("Sign out", role: .destructive) { Task { await session.signOut() } }
                }
                Section {
                    Picker("Default language", selection: $lang) {
                        ForEach(Languages.all, id: \.code) { Text($0.name).tag($0.code) }
                    }
                } footer: {
                    Text("Used by the share sheet when it can't tell the language from the text.")
                }
                Section {
                    Toggle("Review reminders", isOn: $remindersOn)
                    if remindersOn {
                        DatePicker("Remind me at", selection: reminderTime, displayedComponents: .hourAndMinute)
                    }
                } footer: {
                    Text(reminderNote ?? "One notification a day when words are due, plus the count on the app icon.")
                }
                .onChange(of: remindersOn) { _, on in
                    Task {
                        if on, !(await Reminders.requestPermission()) {
                            remindersOn = false
                            reminderNote = "Notifications are off for Lexea. Turn them on in iOS Settings → Lexea → Notifications."
                        } else {
                            reminderNote = nil
                        }
                        await Reminders.reschedule(store.words)
                    }
                }
                .onChange(of: reminderMinutes) { _, _ in Task { await Reminders.reschedule(store.words) } }

                Section("Stats") {
                    LabeledContent("Words", value: "\(store.words.count)")
                    LabeledContent("Mastered", value: "\(store.words.filter(\.isMastered).count)")
                    LabeledContent("Due now", value: "\(store.reviewQueue.count)")
                    if store.pendingCount > 0 {
                        LabeledContent("Waiting to sync", value: "\(store.pendingCount)")
                    }
                }
                Section {
                    Link("Open Lexea on the web", destination: Backend.webURL)
                } footer: {
                    Text("To save words on iPhone: select text in Safari (or any app), tap Share, then Save to Lexea. If you don't see it, tap More at the end of the app row and turn it on.")
                }
            }
            .navigationTitle("Settings")
        }
    }
}
