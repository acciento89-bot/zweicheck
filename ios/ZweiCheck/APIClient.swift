import Foundation

final class APIClient {
    private let baseURL = URL(string: "https://zweicheck.kamilunavo.com")!
    private let cookieName = "zc_session"
    private let cookieStorage = HTTPCookieStorage()
    private let keychain = KeychainSessionStore()
    private var sessionToken: String?

    private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = cookieStorage
        configuration.httpShouldSetCookies = true
        configuration.httpCookieAcceptPolicy = .always
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 60
        return URLSession(configuration: configuration)
    }()

    init() {
        sessionToken = keychain.load()
        restoreSessionCookie()
    }

    func me() async throws -> APIUser { try await request("/api/auth/me", as: AuthEnvelope.self).user }

    func login(email: String, password: String) async throws -> APIUser {
        let envelope: AuthEnvelope = try await request("/api/auth/login", method: "POST", json: ["email": email, "password": password])
        persistSessionCookie()
        return envelope.user
    }

    func register(name: String, email: String, password: String) async throws -> APIUser {
        let envelope: AuthEnvelope = try await request("/api/auth/register", method: "POST", json: ["name": name, "email": email, "password": password])
        persistSessionCookie()
        return envelope.user
    }

    func logout() async {
        _ = try? await requestData("/api/auth/logout", method: "POST")
        clearSessionCredentials()
    }

    func resendVerification() async throws { let _: VerificationResult = try await request("/api/auth/resend-verification", method: "POST") }

    func checks() async throws -> [CheckItem] { try await request("/api/checks", as: ChecksEnvelope.self).checks }
    func trustRouting() async throws -> TrustRoutingEnvelope { try await request("/api/trust-routing", as: TrustRoutingEnvelope.self) }
    func activities() async throws -> ActivitiesEnvelope { try await request("/api/activities?limit=50", as: ActivitiesEnvelope.self) }

    func markActivityRead(id: String) async throws -> ActivityItem {
        try await request("/api/activities/\(id)/read", method: "PATCH", as: ActivityEnvelope.self).activity
    }

    func markAllActivitiesRead() async throws {
        _ = try await requestData("/api/activities/read-all", method: "POST")
    }

    func registerNativePush(token: String, environment: String) async throws {
        _ = try await requestData(
            "/api/push/native/tokens",
            method: "POST",
            json: ["token": token, "environment": environment]
        )
    }

    func unregisterNativePush(token: String, environment: String) async throws {
        _ = try await requestData(
            "/api/push/native/tokens",
            method: "DELETE",
            json: ["token": token, "environment": environment]
        )
    }

    func updatePresence(status: String, durationMinutes: Int?) async throws {
        var body: [String: Any] = ["status": status]
        if let durationMinutes { body["durationMinutes"] = durationMinutes }
        _ = try await requestData("/api/trust-routing/presence", method: "PUT", json: body)
    }

    func invite(email: String) async throws -> InvitationResult {
        try await request("/api/invitations", method: "POST", json: ["email": email], as: InvitationResult.self)
    }

    func acceptInvitation(code: String) async throws {
        let _: AcceptInvitationResult = try await request("/api/invitations/accept", method: "POST", json: ["code": code])
    }

    func createCheck(
        reviewerID: String,
        category: CheckCategory,
        description: String,
        amount: String?,
        images: [UploadImage]
    ) async throws -> CheckItem {
        var fields = [
            "reviewerId": reviewerID,
            "category": category.rawValue,
            "description": description,
            "urgency": "none"
        ]
        if let amount, !amount.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { fields["amount"] = amount }

        let boundary = "ZweiCheck-\(UUID().uuidString)"
        var body = Data()
        for (name, value) in fields {
            appendField(name: name, value: value, boundary: boundary, to: &body)
        }
        for image in images.prefix(3) {
            appendFile(fieldName: "images", image: image, boundary: boundary, to: &body)
        }
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        var request = URLRequest(url: baseURL.appending(path: "/api/checks"))
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let data = try await perform(request)
        return try decode(CheckEnvelope.self, from: data).check
    }

    func respond(checkID: String, recommendation: Recommendation, note: String) async throws -> CheckItem {
        try await request("/api/checks/\(checkID)/respond", method: "POST", json: ["recommendation": recommendation.rawValue, "note": note], as: CheckEnvelope.self).check
    }

    func close(checkID: String) async throws { _ = try await requestData("/api/checks/\(checkID)/close", method: "POST") }

    func deleteAccount(password: String) async throws {
        _ = try await requestData("/api/account", method: "DELETE", json: ["password": password])
        clearSessionCredentials()
    }

    private func request<T: Decodable>(_ path: String, method: String = "GET", json: [String: Any]? = nil, as type: T.Type = T.self) async throws -> T {
        let data = try await requestData(path, method: method, json: json)
        return try decode(T.self, from: data)
    }

    private func requestData(_ path: String, method: String = "GET", json: [String: Any]? = nil) async throws -> Data {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let json {
            request.httpBody = try JSONSerialization.data(withJSONObject: json)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return try await perform(request)
    }

    private func perform(_ originalRequest: URLRequest) async throws -> Data {
        var request = originalRequest

        // URLSession's cookie handling with an ephemeral/custom cookie store isn't reliable
        // enough for our HttpOnly server session. Attach the persisted token explicitly.
        if request.value(forHTTPHeaderField: "Cookie") == nil,
           let token = sessionToken ?? keychain.load(),
           !token.isEmpty {
            sessionToken = token
            request.setValue("\(cookieName)=\(token)", forHTTPHeaderField: "Cookie")
        }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIClientError.message("Keine gültige Serverantwort.")
        }

        captureSessionCookie(from: http, requestURL: request.url)

        guard (200..<300).contains(http.statusCode) else {
            let serverMessage = (try? decode(APIErrorEnvelope.self, from: data))?.error
                ?? "ZweiCheck konnte die Anfrage nicht abschließen."
            if http.statusCode == 401 {
                clearSessionCredentials()
                throw APIClientError.unauthorized(serverMessage)
            }
            throw APIClientError.message(serverMessage)
        }
        return data
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do { return try JSONDecoder().decode(type, from: data) }
        catch { throw APIClientError.message("Die Serverantwort konnte nicht gelesen werden.") }
    }

    private func appendField(name: String, value: String, boundary: String, to body: inout Data) {
        body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".data(using: .utf8)!)
    }

    private func appendFile(fieldName: String, image: UploadImage, boundary: String, to body: inout Data) {
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"\(image.fileName)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(image.mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(image.data)
        body.append("\r\n".data(using: .utf8)!)
    }

    private func captureSessionCookie(from response: HTTPURLResponse, requestURL: URL?) {
        guard let url = requestURL else { return }
        var headerFields: [String: String] = [:]
        for (key, value) in response.allHeaderFields {
            headerFields[String(describing: key)] = String(describing: value)
        }

        let responseCookies = HTTPCookie.cookies(withResponseHeaderFields: headerFields, for: url)
        guard let cookie = responseCookies.first(where: { $0.name == cookieName }) else { return }
        cookieStorage.setCookie(cookie)
        sessionToken = cookie.value
        try? keychain.save(cookie.value)
    }

    private func persistSessionCookie() {
        if let token = sessionToken, !token.isEmpty {
            try? keychain.save(token)
            return
        }
        guard let cookie = cookieStorage.cookies(for: baseURL)?.first(where: { $0.name == cookieName }) else { return }
        sessionToken = cookie.value
        try? keychain.save(cookie.value)
    }

    private func restoreSessionCookie() {
        guard let value = sessionToken ?? keychain.load(), let host = baseURL.host else { return }
        sessionToken = value
        let properties: [HTTPCookiePropertyKey: Any] = [
            .name: cookieName,
            .value: value,
            .domain: host,
            .path: "/",
            .secure: "TRUE",
            .expires: Date().addingTimeInterval(30 * 24 * 60 * 60)
        ]
        if let cookie = HTTPCookie(properties: properties) { cookieStorage.setCookie(cookie) }
    }

    private func clearSessionCredentials() {
        sessionToken = nil
        cookieStorage.removeCookies(since: .distantPast)
        keychain.clear()
    }
}

enum APIClientError: LocalizedError {
    case unauthorized(String)
    case message(String)

    var isUnauthorized: Bool {
        if case .unauthorized = self { return true }
        return false
    }

    var errorDescription: String? {
        switch self {
        case .unauthorized(let text), .message(let text): text
        }
    }
}
