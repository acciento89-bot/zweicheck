import SwiftUI

struct AppShellView: View {
    let model: AppModel
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack { HomeView(model: model) }
                .tabItem { Label("Start", systemImage: "house.fill") }
                .tag(0)
            NavigationStack { ChecksView(model: model) }
                .tabItem { Label("Prüfungen", systemImage: "checkmark.shield.fill") }
                .tag(1)
            NavigationStack { PeopleView(model: model) }
                .tabItem { Label("Personen", systemImage: "person.2.fill") }
                .tag(2)
            NavigationStack { AccountView(model: model) }
                .tabItem { Label("Konto", systemImage: "person.crop.circle.fill") }
                .tag(3)
        }
        .task {
            if let url = NativePushManager.consumePendingNotificationURL() {
                model.handleIncomingURL(url)
            }
        }
        .onChange(of: model.destination) { _, destination in
            guard let destination else { return }
            switch destination {
            case .checks: selectedTab = 1
            case .people: selectedTab = 2
            }
            model.destination = nil
        }
    }
}
