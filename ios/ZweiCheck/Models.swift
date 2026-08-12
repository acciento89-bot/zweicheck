import Foundation

struct APIUser: Codable, Identifiable, Equatable {
    let id: String
    let email: String
    let name: String
    let emailVerified: Bool
    let createdAt: String
}

struct AuthEnvelope: Codable { let user: APIUser }

struct Person: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let email: String
}

struct Presence: Codable, Equatable {
    let status: String
    let expiresAt: String?
    let updatedAt: String?

    var label: String {
        switch status {
        case "available": "Ja, ich kann helfen"
        case "urgent_only": "Nur wenn es dringend ist"
        case "unavailable": "Gerade nicht"
        default: "Keine Angabe"
        }
    }
}

struct TrustConnection: Codable, Identifiable, Equatable {
    let connectionId: String
    let person: Person
    let presence: Presence
    var id: String { connectionId }
}

struct TrustRoutingEnvelope: Codable, Equatable {
    let selfPresence: Presence
    let connections: [TrustConnection]

    enum CodingKeys: String, CodingKey {
        case selfPresence = "self"
        case connections
    }
}

struct PendingInvitation: Codable, Identifiable, Equatable {
    let id: String
    let creatorName: String
    let creatorEmail: String
    let expiresAt: String
    let createdAt: String
}

struct PendingInvitationsEnvelope: Codable { let invitations: [PendingInvitation] }

struct InvitationResult: Codable { let code: String; let expiresAt: String; let emailDelivery: String? }
struct AcceptInvitationResult: Codable { let connectionId: String }

struct AttachmentItem: Codable, Identifiable, Equatable {
    let id: String
    let originalName: String
    let mimeType: String
    let sizeBytes: Int
    let url: String
}

struct CheckItem: Codable, Identifiable, Equatable {
    let id: String
    let requesterId: String
    let requesterName: String
    let reviewerId: String
    let reviewerName: String
    let category: String
    let description: String
    let amountCents: Int?
    let urgency: String
    let status: String
    let recommendation: String?
    let responseNote: String?
    let respondedAt: String?
    let closedAt: String?
    let createdAt: String
    let updatedAt: String
    let attachmentCount: Int?
    let attachments: [AttachmentItem]?

    var categoryLabel: String { CheckCategory(rawValue: category)?.label ?? "Prüfanfrage" }
    var recommendationLabel: String? { recommendation.flatMap { Recommendation(rawValue: $0)?.label } }
}

struct ChecksEnvelope: Codable { let checks: [CheckItem] }
struct CheckEnvelope: Codable { let check: CheckItem }

struct RoutingReviewer: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let email: String
    let presence: Presence
}

struct RoutingHistoryPerson: Codable, Equatable {
    let id: String
    let name: String
}

struct RoutingHistoryEntry: Codable, Identifiable, Equatable {
    let id: String
    let from: RoutingHistoryPerson
    let to: RoutingHistoryPerson
    let createdAt: String
}

struct CheckRouting: Codable, Equatable {
    let checkId: String
    let role: String
    let status: String
    let reassignedAt: String?
    let currentReviewer: RoutingReviewer
    let fallbackReviewer: RoutingReviewer?
    let targets: [TrustConnection]
    let canReroute: Bool
    let history: [RoutingHistoryEntry]
}

struct CheckRoutingEnvelope: Codable { let routing: CheckRouting }

struct EscalationFallbackReviewer: Codable, Identifiable, Equatable {
    let id: String
    let name: String
}

struct EscalationPlan: Codable, Equatable {
    let checkId: String?
    let role: String
    let exists: Bool
    let enabled: Bool
    let state: String
    let reminderMinutes: Int?
    let reminderAt: String?
    let remindedAt: String?
    let autoReroute: Bool
    let autoRerouteDelayMinutes: Int
    let rerouteAt: String?
    let reroutedAt: String?
    let cancelledAt: String?
    let lastError: String?
    let canManage: Bool
    let canConfigure: Bool
    let fallbackReviewer: EscalationFallbackReviewer?

    var stateLabel: String {
        switch state {
        case "waiting_reminder": "Wartet auf Erinnerung"
        case "waiting_reroute": "Erinnert – wartet auf zweite Person"
        case "reminded": "Erinnerung gesendet"
        case "rerouted": "Automatisch weitergegeben"
        case "cancelled": "Automatik beendet"
        default: "Keine automatische Erinnerung"
        }
    }
}

struct EscalationEnvelope: Codable { let escalation: EscalationPlan }

struct ActivityItem: Codable, Identifiable, Equatable {
    let id: String
    let eventType: String
    let icon: String
    let title: String
    let body: String
    let actorName: String?
    let checkId: String?
    let invitationId: String?
    let connectionId: String?
    let readAt: String?
    let createdAt: String

    var isUnread: Bool { readAt == nil }
}

struct ActivitiesEnvelope: Codable {
    let activities: [ActivityItem]
    let unreadCount: Int
    let nextBefore: String?
}

struct ActivityEnvelope: Codable { let activity: ActivityItem }
struct DeleteResult: Codable { let deleted: Bool? }
struct VerificationResult: Codable { let sent: Bool?; let alreadyVerified: Bool? }
struct PasswordResetRequestResult: Codable { let sent: Bool?; let debugUrl: String? }
struct PasswordResetResult: Codable { let changed: Bool? }
struct APIErrorEnvelope: Codable { let error: String; let code: String? }

enum CheckCategory: String, CaseIterable, Identifiable {
    case message, payment, link, data
    var id: String { rawValue }
    var label: String {
        switch self {
        case .message: "Nachricht"
        case .payment: "Zahlung"
        case .link: "Link oder Webseite"
        case .data: "Persönliche Daten"
        }
    }
    var symbol: String {
        switch self {
        case .message: "message"
        case .payment: "eurosign.circle"
        case .link: "link"
        case .data: "person.text.rectangle"
        }
    }
}

enum Recommendation: String, CaseIterable, Identifiable {
    case doNotAct = "do_not_act"
    case verifyPersonally = "verify_personally"
    case plausible
    case callMe = "call_me"

    var id: String { rawValue }
    var label: String {
        switch self {
        case .doNotAct: "Nicht handeln"
        case .verifyPersonally: "Erst persönlich klären"
        case .plausible: "Wirkt nachvollziehbar"
        case .callMe: "Ruf mich jetzt an"
        }
    }
}
