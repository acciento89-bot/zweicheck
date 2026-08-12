import SwiftUI

enum AppTheme {
    static let navy = Color(red: 0.024, green: 0.102, blue: 0.184)
    static let teal = Color(red: 0.059, green: 0.510, blue: 0.494)
    static let orange = Color(red: 0.900, green: 0.420, blue: 0.060)
    static let background = Color(uiColor: .systemGroupedBackground)
    static let card = Color(uiColor: .secondarySystemGroupedBackground)
}

struct SeniorPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.title3.weight(.bold))
            .frame(maxWidth: .infinity, minHeight: 58)
            .padding(.horizontal, 18)
            .foregroundStyle(.white)
            .background(AppTheme.teal.opacity(configuration.isPressed ? 0.78 : 1), in: RoundedRectangle(cornerRadius: 16))
            .contentShape(Rectangle())
    }
}

struct SeniorSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .frame(maxWidth: .infinity, minHeight: 52)
            .padding(.horizontal, 16)
            .foregroundStyle(AppTheme.navy)
            .background(AppTheme.card.opacity(configuration.isPressed ? 0.7 : 1), in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(AppTheme.navy.opacity(0.15)))
    }
}
