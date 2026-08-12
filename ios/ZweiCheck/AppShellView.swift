import SwiftUI

struct AppShellView: View {
    let model: AppModel

    var body: some View {
        TabView {
            NavigationStack { HomeView(model: model) }
                .tabItem { Label("Start", systemImage: "house.fill") }
            NavigationStack { ChecksView(model: model) }
                .tabItem { Label("Prüfungen", systemImage: "checkmark.shield.fill") }
            NavigationStack { PeopleView(model: model) }
                .tabItem { Label("Personen", systemImage: "person.2.fill") }
            NavigationStack { AccountView(model: model) }
                .tabItem { Label("Konto", systemImage: "person.crop.circle.fill") }
        }
    }
}
