import SwiftUI

struct AuthView: View {
    let model: AppModel
    @State private var createAccount = false
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    VStack(spacing: 8) {
                        Image(systemName: "checkmark.shield.fill").font(.system(size: 52)).foregroundStyle(AppTheme.teal)
                        Text("ZweiCheck").font(.largeTitle.bold()).foregroundStyle(AppTheme.navy)
                        Text("Gemeinsam prüfen. Sicher handeln.").font(.headline).foregroundStyle(.secondary)
                    }.padding(.top, 34)

                    Picker("Zugang", selection: $createAccount) {
                        Text("Anmelden").tag(false)
                        Text("Konto erstellen").tag(true)
                    }.pickerStyle(.segmented)

                    VStack(spacing: 16) {
                        if createAccount {
                            TextField("Dein Name", text: $name).textContentType(.name).textFieldStyle(.roundedBorder).font(.title3)
                        }
                        TextField("E-Mail-Adresse", text: $email).textContentType(.emailAddress).textInputAutocapitalization(.never).keyboardType(.emailAddress).textFieldStyle(.roundedBorder).font(.title3)
                        SecureField("Passwort", text: $password).textContentType(createAccount ? .newPassword : .password).textFieldStyle(.roundedBorder).font(.title3)
                        if createAccount { Text("Mindestens 10 Zeichen, Buchstaben und mindestens eine Zahl.").font(.footnote).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading) }
                    }

                    Button(createAccount ? "Konto erstellen" : "Anmelden") {
                        Task { createAccount ? await model.register(name: name, email: email, password: password) : await model.login(email: email, password: password) }
                    }
                    .buttonStyle(SeniorPrimaryButtonStyle())
                    .disabled(model.isBusy || email.isEmpty || password.isEmpty || (createAccount && name.trimmingCharacters(in: .whitespaces).count < 2))

                    Link("Datenschutz", destination: URL(string: "https://zweicheck.kamilunavo.com/privacy")!)
                        .font(.body.weight(.semibold))
                }
                .padding(24)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
            }
            .background(AppTheme.background)
        }
    }
}
