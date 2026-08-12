import SwiftUI

enum AppTheme {
    // Gleiche Markenfarben wie in app.css der Web-Version.
    static let navy = Color(red: 0.024, green: 0.102, blue: 0.184)       // #061a2f
    static let navySoft = Color(red: 0.043, green: 0.161, blue: 0.271)   // #0b2945
    static let teal = Color(red: 0.039, green: 0.651, blue: 0.651)       // #0aa6a6
    static let tealBright = Color(red: 0.075, green: 0.757, blue: 0.729) // #13c1ba
    static let orange = Color(red: 0.859, green: 0.424, blue: 0.125)     // #db6c20
    static let red = Color(red: 0.765, green: 0.239, blue: 0.259)        // #c33d42
    static let green = Color(red: 0.137, green: 0.525, blue: 0.420)      // #23866b
    static let background = Color(uiColor: .systemGroupedBackground)
    static let card = Color(uiColor: .secondarySystemGroupedBackground)
    static let inputBackground = Color(uiColor: .systemBackground)
}

struct SeniorPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.title3.weight(.bold))
            .frame(maxWidth: .infinity, minHeight: 58)
            .padding(.horizontal, 18)
            .foregroundStyle(.white)
            .background(
                LinearGradient(
                    colors: [AppTheme.teal, AppTheme.tealBright],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .opacity(configuration.isPressed ? 0.78 : 1),
                in: RoundedRectangle(cornerRadius: 16)
            )
            .shadow(color: AppTheme.teal.opacity(configuration.isPressed ? 0.08 : 0.22), radius: 12, y: 7)
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
            .background(Color(uiColor: .systemBackground).opacity(configuration.isPressed ? 0.72 : 1), in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(AppTheme.navy.opacity(0.15)))
    }
}

enum ZweiCheckActionTone {
    case positive
    case warning
    case danger
    case navy

    var foreground: Color {
        switch self {
        case .positive, .danger, .navy: .white
        case .warning: Color(red: 0.48, green: 0.21, blue: 0.05)
        }
    }

    var background: Color {
        switch self {
        case .positive: AppTheme.green
        case .warning: Color(red: 1.0, green: 0.85, blue: 0.74)
        case .danger: AppTheme.red
        case .navy: AppTheme.navy
        }
    }
}

struct ZweiCheckActionButtonStyle: ButtonStyle {
    let tone: ZweiCheckActionTone

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.bold))
            .frame(maxWidth: .infinity, minHeight: 54)
            .padding(.horizontal, 16)
            .foregroundStyle(tone.foreground)
            .background(tone.background.opacity(configuration.isPressed ? 0.76 : 1), in: RoundedRectangle(cornerRadius: 14))
            .shadow(color: tone.background.opacity(configuration.isPressed ? 0 : 0.14), radius: 8, y: 4)
    }
}

struct SeniorInputSurface: ViewModifier {
    let focused: Bool
    let cornerRadius: CGFloat

    func body(content: Content) -> some View {
        content
            .background(AppTheme.inputBackground, in: RoundedRectangle(cornerRadius: cornerRadius))
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(focused ? AppTheme.tealBright : AppTheme.navy.opacity(0.28), lineWidth: focused ? 2.5 : 1.5)
            }
    }
}

extension View {
    func seniorInputSurface(focused: Bool = false, cornerRadius: CGFloat = 14) -> some View {
        modifier(SeniorInputSurface(focused: focused, cornerRadius: cornerRadius))
    }
}
