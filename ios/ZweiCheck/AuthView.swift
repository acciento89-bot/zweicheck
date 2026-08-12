import SwiftUI

struct AuthView: View {
    let model: AppModel
    @State private var createAccount = false
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var authSheet: AuthSheet?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    VStack(spacing: 8) {
                        Image(systemName: "checkmark.shield.fill").font(.system(size: 52)).foregroundStyle(AppTheme.teal)
                        Text("ZweiCheck").font(.largeTitle.bold()).foregroundStyle(AppTheme.navy)
                        Text("Gemeinsam prüfen. Sicher handeln.").font(.headline).foregroundStyle(.secondary)
                    }
                    .padding(.top, 34)

                    Picker("Zugang", selection: $createAccount) {
                        Text("Anmelden").tag(false)
                        Text("Konto erstellen").tag(true)
                    }
                    .pickerStyle(.segmented)

                    VStack(spacing: 16) {
                        if createAccount {
                            TextField("Dein Name", text: $name)
                                .textContentType(.name)
                                .textFieldStyle(.roundedBorder)
                                .font(.title3)
                        }
                        TextField("E-Mail-Adresse", text: $email)
                            .textContentType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.emailAddress)
                            .textFieldStyle(.roundedBorder)
                            .font(.title3)
                        SecureField("Passwort", text: $password)
                            .textContentType(createAccount ? .newPassword : .password)
                            .textFieldStyle(.roundedBorder)
                            .font(.title3)
                        if createAccount {
                            Text("Mindestens 10 Zeichen, Buchstaben und mindestens eine Zahl.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }

                    Button(createAccount ? "Konto erstellen" : "Anmelden") {
                        Task {
                            if createAccount {
                                await model.register(name: name, email: email, password: password)
                            } else {
                                await model.login(email: email, password: password)
                            }
                        }
                    }
                    .buttonStyle(SeniorPrimaryButtonStyle())
                    .disabled(model.isBusy || email.isEmpty || password.isEmpty || (createAccount && name.trimmingCharacters(in: .whitespaces).count < 2))

                    if !createAccount {
                        Button("Passwort vergessen?") { authSheet = .forgot }
                            .font(.body.weight(.semibold))
                    }

                    Link("Datenschutz", destination: URL(string: "https://zweicheck.kamilunavo.com/privacy")!)
                        .font(.body.weight(.semibold))
                }
                .padding(24)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
            }
            .background(AppTheme.background)
        }
        .sheet(item: $authSheet) { sheet in
            switch sheet {
            case .forgot:
                ForgotPasswordView(model: model)
            case .reset(let token):
                ResetPasswordView(model: model, token: token)
            }
        }
        .task(id: model.pendingResetToken) {
            if let token = model.pendingResetToken { authSheet = .reset(token) }
        }
    }
}

private enum AuthSheet: Identifiable {
    case forgot
    case reset(String)

    var id: String {
        switch self {
        case .forgot: "forgot"
        case .reset(let token): "reset-\(token)"
        }
    }
}

private struct ForgotPasswordView: View {
    let model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Gib deine E-Mail-Adresse ein. Wenn ein ZweiCheck-Konto existiert, senden wir dir einen sicheren Link.")
                        .foregroundStyle(.secondary)
                    TextField("E-Mail-Adresse", text: $email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Button("Link anfordern") {
                        Task {
                            await model.requestPasswordReset(email: email)
                            dismiss()
                        }
                    }
                    .disabled(email.isEmpty || model.isBusy)
                }
            }
            .navigationTitle("Passwort vergessen")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Schließen") { dismiss() } }
            }
        }
    }
}

private struct ResetPasswordView: View {
    let model: AppModel
    let token: String
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var confirmation = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Neues Passwort") {
                    SecureField("Neues Passwort", text: $password)
                        .textContentType(.newPassword)
                    SecureField("Passwort wiederholen", text: $confirmation)
                        .textContentType(.newPassword)
                    Text("Mindestens 10 Zeichen, Buchstaben und mindestens eine Zahl.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Section {
                    Button("Passwort ändern") {
                        Task {
                            if await model.resetPassword(token: token, password: password) { dismiss() }
                        }
                    }
                    .disabled(password.count < 10 || password != confirmation || model.isBusy)
                }
            }
            .navigationTitle("Passwort ändern")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Schließen") { dismiss() } }
            }
        }
    }
}
