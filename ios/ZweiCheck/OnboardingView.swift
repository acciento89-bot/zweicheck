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
            accent: AppTheme.navy
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

            Button(page == pages.count - 1 ? "Tarife ansehen" : "Weiter") {
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
                    Text("Die Grundfunktion bleibt kostenlos. Premium Familie ergänzt die automatischen Sicherheitsfunktionen.")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }

                planCard(
                    title: "Kostenlos",
                    price: "0 €",
                    subtitle: "Für den einfachen zweiten Blick",
                    accent: AppTheme.navy,
                    highlighted: false,
                    badge: nil,
                    features: [
                        "Prüfanfragen senden und beantworten",
                        "1 Bild pro Prüfung",
                        "Push-Benachrichtigungen",
                        "Vertrauenspersonen und Aktivitäten"
                    ]
                )

                planCard(
                    title: "Premium Familie",
                    price: "4,99 € / Monat",
                    subtitle: "Flexibel monatlich",
                    accent: AppTheme.navy,
                    highlighted: false,
                    badge: "MONATLICH",
                    features: premiumFeatures
                )

                planCard(
                    title: "Premium Familie",
                    price: "39,99 € / Jahr",
                    subtitle: "Günstiger als 12 einzelne Monatszahlungen",
                    accent: AppTheme.teal,
                    highlighted: true,
                    badge: "BESTE WAHL",
                    features: premiumFeatures
                )

                Text("Premium kannst du jederzeit später im Bereich „Konto“ aktivieren. Der Kauf und die Verwaltung des Abos laufen sicher über den App Store.")
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

    private func planCard(
        title: String,
        price: String,
        subtitle: String,
        accent: Color,
        highlighted: Bool,
        badge: String?,
        features: [String]
    ) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title).font(.title2.bold())
                    Text(subtitle).font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer()
                if let badge {
                    Text(badge)
                        .font(.caption.bold())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(accent, in: Capsule())
                }
            }

            Text(price)
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundStyle(accent)

            VStack(alignment: .leading, spacing: 9) {
                ForEach(features, id: \.self) { feature in
                    Label(feature, systemImage: "checkmark.circle.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AppTheme.navy)
                }
            }
        }
        .padding(18)
        .background(Color(uiColor: .systemBackground), in: RoundedRectangle(cornerRadius: 20))
        .overlay {
            RoundedRectangle(cornerRadius: 20)
                .stroke(highlighted ? accent : AppTheme.navy.opacity(0.14), lineWidth: highlighted ? 2.5 : 1)
        }
        .shadow(color: highlighted ? accent.opacity(0.12) : .clear, radius: 14, y: 7)
    }

    private func pageDots(total: Int, selected: Int) -> some View {
        HStack(spacing: 8) {
            ForEach(0..<total, id: \.self) { index in
                Capsule()
                    .fill(index == selected ? AppTheme.teal : AppTheme.navy.opacity(0.16))
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
