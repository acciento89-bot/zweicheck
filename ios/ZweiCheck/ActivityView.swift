import SwiftUI

struct ActivityView: View {
    let model: AppModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if model.activities.isEmpty {
                    ContentUnavailableView(
                        "Noch keine Aktivitäten",
                        systemImage: "bell",
                        description: Text("Neue Prüfanfragen, Antworten und Einladungen erscheinen hier.")
                    )
                } else {
                    List(model.activities) { activity in
                        Button {
                            Task {
                                await model.openActivity(activity)
                                dismiss()
                            }
                        } label: {
                            HStack(alignment: .top, spacing: 14) {
                                Image(systemName: symbol(for: activity.eventType))
                                    .font(.title3)
                                    .foregroundStyle(activity.isUnread ? AppTheme.teal : .secondary)
                                    .frame(width: 30)
                                VStack(alignment: .leading, spacing: 5) {
                                    HStack {
                                        Text(activity.title)
                                            .font(.headline)
                                            .foregroundStyle(.primary)
                                        if activity.isUnread {
                                            Circle().fill(AppTheme.teal).frame(width: 9, height: 9)
                                        }
                                    }
                                    Text(activity.body)
                                        .foregroundStyle(.secondary)
                                        .multilineTextAlignment(.leading)
                                }
                            }
                            .padding(.vertical, 5)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .navigationTitle("Aktivitäten")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Schließen") { dismiss() }
                }
                if model.unreadActivityCount > 0 {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Alle gelesen") { Task { await model.markAllActivitiesRead() } }
                    }
                }
            }
            .task { await model.refreshActivities() }
            .refreshable { await model.refreshActivities() }
        }
    }

    private func symbol(for type: String) -> String {
        switch type {
        case "check_created": "checkmark.shield"
        case "check_answered": "arrowshape.turn.up.left"
        case "check_closed": "checkmark.circle"
        case "invitation_received": "person.badge.plus"
        case "invitation_accepted": "person.2"
        case "invitation_declined": "person.badge.minus"
        case "connection_revoked": "person.crop.circle.badge.xmark"
        default: "bell"
        }
    }
}
