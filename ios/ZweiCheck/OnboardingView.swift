import SwiftUI

struct OnboardingView: View {
    @Binding var completed: Bool
    @State private var page = 0

    private let pages: [OnboardingPage] = [
        OnboardingPage(
            symbol: "checkmark.shield.fill",
            title: "Erst prüfen. Dann handeln.",
            text: "ZweiCheck gibt dir einen einfachen zweiten Blick, wenn eine Nachricht, Zahlung, Webseite oder Anfrage komisch wirkt.",
            accent: AppTheme.teal
        ),
        OnboardingPage(
            symbol: "person.2.fill",
            title: "1. Vertrauensperson verbinden",
            text: "Verbinde jemanden, den du wirklich kennst. Diese Person bekommt deine Prüfanfrage direkt in ZweiCheck und kann dir antworten.",
            accent: AppTheme.navySolid
        ),
        OnboardingPage(
            symbol: "square.and.arrow.up.fill",
            title: "2. Verdächtiges teilen oder eingeben",
            text: "Beschreibe kurz, worum es geht. Du kannst auch Bilder oder Inhalte direkt über das iPhone-Teilen-Menü an ZweiCheck übergeben.",
            accent: AppTheme.orange
        ),
        OnboardingPage(
            symbol: "bell.badge.fill",
            title: "3. Antwort bekommen",
            text: "Deine Vertrauensperson prüft den Fall. Sobald eine Antwort kommt, informiert dich ZweiCheck per Push und öffnet direkt die passende Prüfung.",
            accent: AppTheme.green
        )
    ]

    var body: some View {
        ZStack {
            AppTheme.background.ignoresSafeArea()

            VStack(spacing: 0) {
                HStack {
                    Spacer()
                    if page < pages.count {
                        Button("Überspringen") { page = pages.count }
                            .font(.body.weight(.semibold))
                            .foregroundStyle(AppTheme.navy)
                    }
                }
                .frame(height: 48)
                .padding(.horizontal, 22)

                if page < pages.count {
                    introPage(pages[page])
                } else {
                    planPage
                }
            }
        }
    }

    private func introPage(_ item: OnboardingPage) -> some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: item.symbol)
                .font(.system(size: 68, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 132, height: 132)
                .background(item.accent, in: RoundedRectangle(cornerRadius: 34))
                .shadow(color: item.accent.opacity(0.22), radius: 22, y: 12)

            VStack(spacing: 14) {
                Text(item.title)
                    .font(.system(size: 31, weight: .bold, design: .rounded))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(AppTheme.navy)

                Text(item.text)
                    .font(.title3)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .lineSpacing(4)
            }
            .padding(.horizontal, 28)

            Spacer()

            pageDots(total: pages.count + 1, selected: page)

            Button(page == pages.count - 1 ? "Weiter" : "Weiter") {
                withAnimation(.easeInOut(duration: 0.22)) { page += 1 }
            }
            .buttonStyle(SeniorPrimaryButtonStyle())
            .padding(.horizontal, 22)
            .padding(.bottom, 24)
        }
    }

    private var planPage: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Du entscheidest")
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .foregroundStyle(AppTheme.navy)
                    Text("Die Grundfunktion bleibt kostenlos. Premium Familie ist optional und kann nach der Anmeldung im Bereich „Konto“ aktiviert werden.")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }

                featureCard(
                    title: "Kostenlos",
                    subtitle: "Alles für den einfachen zweiten Blick",
                    symbol: "checkmark.shield.fill",
                    accent: AppTheme.navy,
                    features: [
                        "Prüfanfragen senden und beantworten",
                        "1 Bild pro Prüfung",
                        "Push-Benachrichtigungen",
                        "Vertrauenspersonen und Aktivitäten"
                    ]
                )

                featureCard(
                    title: "Premium Familie",
                    subtitle: "Optional – später unter „Konto“ aktivierbar",
                    symbol: "person.3.fill",
                    accent: AppTheme.tealBright,
                    features: premiumFeatures
                )

                Label("Premium-Angebote, Preise und Käufe werden nach der Anmeldung direkt aus dem App Store geladen.", systemImage: "apple.logo")
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                Button("Kostenlos starten") {
                    completed = true
                }
                .buttonStyle(SeniorPrimaryButtonStyle())
            }
            .padding(22)
            .padding(.bottom, 18)
        }
    }

    private var premiumFeatures: [String] {
        [
            "Bis zu 3 Bilder pro Prüfung",
            "Automatische Erinnerung nach 5–120 Minuten",
            "Automatisch eine zweite Vertrauensperson fragen",
            "Apple Familienfreigabe"
        ]
    }

    private func featureCard(
        title: String,
        subtitle: String,
        symbol: String,
        accent: Color,
        features: [String]
    ) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: symbol)
                    .font(.title2.bold())
                    .foregroundStyle(.white)
                    .frame(width: 46, height: 46)
                    .background(accent, in: RoundedRectangle(cornerRadius: 13))

                VStack(alignment: .leading, spacing: 4) {
                    Text(title).font(.title2.bold())
                    Text(subtitle).font(.subheadline).foregroundStyle(.secondary)
                }
            }

            VStack(alignment: .leading, spacing: 9) {
                ForEach(features, id: \.self) { feature in
                    Label(feature, systemImage: "checkmark.circle.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AppTheme.navy)
                }
            }
        }
        .padding(18)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20))
        .overlay {
            RoundedRectangle(cornerRadius: 20)
                .stroke(AppTheme.separator.opacity(0.9), lineWidth: 1)
        }
    }

    private func pageDots(total: Int, selected: Int) -> some View {
        HStack(spacing: 8) {
            ForEach(0..<total, id: \.self) { index in
                Capsule()
                    .fill(index == selected ? AppTheme.tealBright : AppTheme.separator.opacity(0.7))
                    .frame(width: index == selected ? 24 : 8, height: 8)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: selected)
    }
}

private struct OnboardingPage {
    let symbol: String
    let title: String
    let text: String
    let accent: Color
}
