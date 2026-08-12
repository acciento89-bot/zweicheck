import SwiftUI

struct HomeView: View {
    let model: AppModel
    @State private var showingNewCheck = false
    @State private var showingActivities = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Text("Hallo \(model.user?.name ?? "")")
                    .font(.largeTitle.bold())
                    .foregroundStyle(AppTheme.navy)
                Text("Wenn dir etwas komisch vorkommt, frag erst eine Person, der du vertraust.")
                    .font(.title3)
                    .foregroundStyle(.secondary)

                if model.user?.emailVerified == false {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Bitte bestätige deine E-Mail-Adresse").font(.headline)
                        Text("Danach kannst du Prüfanfragen senden und beantworten.").foregroundStyle(.secondary)
                        Button("E-Mail erneut senden") { Task { await model.resendVerification() } }
                            .buttonStyle(SeniorSecondaryButtonStyle())
                    }
                    .padding(18)
                    .background(AppTheme.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 18))
                }

                if model.pendingSharedDraft != nil {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Aus dem Teilen-Menü übernommen", systemImage: "square.and.arrow.down")
                            .font(.headline)
                        Text("Der Inhalt ist vorbereitet. Wähle nur noch deine Vertrauensperson und prüfe alles vor dem Absenden.")
                            .foregroundStyle(.secondary)
                        Button("Entwurf jetzt prüfen") { showingNewCheck = true }
                            .buttonStyle(SeniorSecondaryButtonStyle())
                    }
                    .padding(18)
                    .background(AppTheme.teal.opacity(0.10), in: RoundedRectangle(cornerRadius: 18))
                }

                Button {
                    showingNewCheck = true
                } label: {
                    Label("Ich bin unsicher – prüfen lassen", systemImage: "hand.raised.fill")
                }
                .buttonStyle(SeniorPrimaryButtonStyle())
                .disabled(model.routing?.connections.isEmpty != false || model.user?.emailVerified != true)

                if model.routing?.connections.isEmpty != false {
                    Text("Verbinde zuerst unter „Personen“ jemanden, dem du vertraust.")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }

                if let newest = model.checks.first {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Letzte Prüfung").font(.headline)
                        Text(newest.categoryLabel).font(.title3.bold())
                        Text(newest.status == "open" ? "Wartet auf Rückmeldung" : newest.recommendationLabel ?? "Beantwortet")
                            .foregroundStyle(newest.status == "open" ? AppTheme.orange : AppTheme.teal)
                    }
                    .padding(18)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
                }
            }
            .padding(20)
        }
        .navigationTitle("Start")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showingActivities = true
                } label: {
                    ZStack(alignment: .topTrailing) {
                        Image(systemName: "bell.fill").font(.title3)
                        if model.unreadActivityCount > 0 {
                            Text(model.unreadActivityCount > 99 ? "99+" : "\(model.unreadActivityCount)")
                                .font(.caption2.bold())
                                .foregroundStyle(.white)
                                .padding(.horizontal, 5)
                                .frame(minWidth: 18, minHeight: 18)
                                .background(.red, in: Capsule())
                                .offset(x: 10, y: -9)
                        }
                    }
                    .frame(width: 44, height: 44)
                    .accessibilityLabel(model.unreadActivityCount > 0 ? "Aktivitäten, \(model.unreadActivityCount) ungelesen" : "Aktivitäten")
                }
            }
        }
        .refreshable { await model.refreshAll() }
        .task(id: model.pendingSharedDraft?.id) {
            if model.pendingSharedDraft != nil,
               model.routing?.connections.isEmpty == false,
               model.user?.emailVerified == true {
                showingNewCheck = true
            }
        }
        .sheet(isPresented: $showingNewCheck) { NewCheckFlow(model: model) }
        .sheet(isPresented: $showingActivities) { ActivityView(model: model) }
    }
}
