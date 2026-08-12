import Foundation

struct SharedDraft: Identifiable, Equatable {
    let id: String
    let description: String
    let category: CheckCategory
    let images: [UploadImage]
}

enum SharedDraftStore {
    static let groupIdentifier = "group.de.kamilunavo.zweicheck"

    static func load() -> SharedDraft? {
        guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupIdentifier) else {
            return nil
        }
        let metadataURL = container.appendingPathComponent("SharedDraft.json")
        guard let data = try? Data(contentsOf: metadataURL),
              let payload = try? JSONDecoder().decode(DraftPayload.self, from: data) else {
            return nil
        }

        let text = payload.text.trimmingCharacters(in: .whitespacesAndNewlines)
        let url = payload.url?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let description: String
        if !text.isEmpty && !url.isEmpty {
            description = "\(text)\n\n\(url)"
        } else if !text.isEmpty {
            description = text
        } else if !url.isEmpty {
            description = url
        } else if !payload.imageFiles.isEmpty {
            description = "Bitte prüfe diesen Screenshot."
        } else {
            description = "Bitte prüfe diesen geteilten Inhalt."
        }

        let images = payload.imageFiles.prefix(3).enumerated().compactMap { index, name -> UploadImage? in
            let fileURL = container.appendingPathComponent(name)
            guard let imageData = try? Data(contentsOf: fileURL) else { return nil }
            return UploadImage(data: imageData, fileName: "zweicheck-share-\(index + 1).jpg", mimeType: "image/jpeg")
        }

        return SharedDraft(
            id: payload.id,
            description: description,
            category: CheckCategory(rawValue: payload.category) ?? .message,
            images: images
        )
    }

    static func consume() {
        guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupIdentifier) else {
            return
        }
        guard let files = try? FileManager.default.contentsOfDirectory(at: container, includingPropertiesForKeys: nil) else {
            return
        }
        for file in files where file.lastPathComponent == "SharedDraft.json" || file.lastPathComponent.hasPrefix("shared-draft-") {
            try? FileManager.default.removeItem(at: file)
        }
    }

    private struct DraftPayload: Codable {
        let id: String
        let text: String
        let url: String?
        let category: String
        let imageFiles: [String]
        let createdAt: String
    }
}
