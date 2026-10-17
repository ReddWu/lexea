import SwiftUI
import AuthenticationServices

struct LoginView: View {
    @Environment(SessionStore.self) private var session
    @State private var mode = Mode.signIn
    @State private var email = ""
    @State private var password = ""
    @State private var code = ""
    @State private var busy = false
    @Environment(\.colorScheme) private var colorScheme

    enum Mode: String, CaseIterable { case signIn = "Sign in", signUp = "Create account" }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                VStack(spacing: 10) {
                    Text("Lexea")
                        .font(.system(size: 56, weight: .bold, design: .serif))
                    Text("Save words where you read them.\nReview them before you forget.")
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 60)
                .padding(.bottom, 20)

                if let pending = session.pendingVerification {
                    verifyForm(pending)
                } else {
                    credentialsForm
                }

                if let n = session.notice {
                    Text(n).font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }
                if let e = session.error {
                    Text(e).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center)
                }
            }
            .padding(24)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private var credentialsForm: some View {
        VStack(spacing: 14) {
            SignInWithAppleButton(.continue) { session.prepareAppleRequest($0) } onCompletion: { result in
                busy = true
                Task { await session.completeApple(result); busy = false }
            }
            .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
            .frame(height: 50)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .disabled(busy)

            Button {
                busy = true
                Task { await session.signInWithGoogle(); busy = false }
            } label: {
                Label("Continue with Google", systemImage: "person.crop.circle")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
            .disabled(busy)

            HStack {
                VStack { Divider() }
                Text("or use email").font(.caption).foregroundStyle(.secondary)
                VStack { Divider() }
            }
            .padding(.vertical, 4)

            Picker("", selection: $mode) {
                ForEach(Mode.allCases, id: \.self) { Text($0.rawValue) }
            }
            .pickerStyle(.segmented)

            TextField("Email", text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .fieldStyle()
            SecureField("Password", text: $password)
                .textContentType(mode == .signUp ? .newPassword : .password)
                .fieldStyle()
            if mode == .signUp {
                Text("At least 6 characters.").font(.caption).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            primaryButton(mode.rawValue, disabled: !email.contains("@") || password.count < 6) {
                let e = email.trimmingCharacters(in: .whitespaces)
                if mode == .signIn { await session.signIn(email: e, password: password) }
                else { await session.signUp(email: e, password: password) }
            }
        }
    }

    private func verifyForm(_ email: String) -> some View {
        VStack(spacing: 14) {
            Text("Enter the 6-digit code sent to\n\(email)")
                .multilineTextAlignment(.center)
            TextField("123456", text: $code)
                .textContentType(.oneTimeCode)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.center)
                .font(.title2.monospacedDigit())
                .fieldStyle()
                .onChange(of: code) { _, v in code = String(v.filter(\.isNumber).prefix(6)) }

            primaryButton("Verify", disabled: code.count != 6) { await session.verify(code: code) }

            HStack {
                Button("Resend code") { Task { await session.resendCode() } }
                Spacer()
                Button("Use another email") {
                    session.pendingVerification = nil
                    code = ""
                }
            }
            .font(.footnote)
        }
    }

    private func primaryButton(_ title: String, disabled: Bool, action: @escaping () async -> Void) -> some View {
        Button {
            busy = true
            Task { await action(); busy = false }
        } label: {
            Group {
                if busy { ProgressView().tint(.white) } else { Text(title) }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .disabled(disabled || busy)
    }
}

private extension View {
    func fieldStyle() -> some View {
        padding(12).background(.quaternary.opacity(0.6), in: RoundedRectangle(cornerRadius: 10))
    }
}
