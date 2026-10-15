import SwiftUI

@main
struct MiaApp: App {
    @State private var session = SessionStore()
    @State private var store = WordStore()
    @State private var tutor = TutorStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .environment(store)
                .environment(tutor)
                .tint(.indigo)
        }
    }
}

struct RootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(WordStore.self) private var store
    @Environment(TutorStore.self) private var tutor
    @Environment(\.scenePhase) private var phase

    var body: some View {
        Group {
            if session.restoring {
                ProgressView()
            } else if session.user == nil {
                LoginView()
            } else {
                MainTabs()
            }
        }
        .task { await session.restore() }
        .task(id: session.user?.id) {
            if let id = session.user?.id {
                tutor.start(userId: id)
                await store.start(userId: id)
            } else {
                store.reset()
                tutor.reset()
                await Reminders.reschedule([])
            }
        }
        .onChange(of: store.words) { _, words in
            Task { await Reminders.reschedule(words) }
        }
        .onChange(of: phase) { _, p in
            // words saved from the share sheet are waiting in the App Group queue
            if p == .active, session.user != nil { Task { await store.refresh() } }
            if p == .background { Task { await Reminders.reschedule(store.words) } }
        }
    }
}

struct MainTabs: View {
    var body: some View {
        TabView {
            ReviewView()
                .tabItem { Label("Review", systemImage: "rectangle.on.rectangle.angled") }
            TutorView()
                .tabItem { Label("Mia", systemImage: "bubble.left.and.text.bubble.right") }
            WordsView()
                .tabItem { Label("Words", systemImage: "text.book.closed") }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
    }
}

/// Learning-language choices shared by the app and the share extension.
enum Languages {
    static let all: [(code: String, name: String)] = [
        ("en", "English"), ("es", "Español"), ("fr", "Français"), ("ja", "日本語"), ("zh", "中文"),
    ]
    static func name(_ code: String) -> String { all.first { $0.code == code }?.name ?? code }
}
