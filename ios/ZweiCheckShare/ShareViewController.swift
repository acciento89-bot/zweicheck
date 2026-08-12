import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private let groupIdentifier = "group.de.kamilunavo.zweicheck"
    private let titleLabel = UILabel()
    private let detailLabel = UILabel()
    private let saveButton = UIButton(type: .system)
    private let cancelButton = UIButton(type: .system)
    private let progress = UIActivityIndicatorView(style: .medium)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        configureUI()
    }

    private func configureUI() {
        titleLabel.text = "Mit ZweiCheck prüfen"
        titleLabel.font = .preferredFont(forTextStyle: .title2)
        titleLabel.adjustsFontForContentSizeCategory = true
        titleLabel.numberOfLines = 0

        detailLabel.text = "Wir speichern den geteilten Inhalt als Entwurf. Öffne danach ZweiCheck und wähle in Ruhe deine Vertrauensperson aus."
        detailLabel.font = .preferredFont(forTextStyle: .body)
        detailLabel.adjustsFontForContentSizeCategory = true
        detailLabel.textColor = .secondaryLabel
        detailLabel.numberOfLines = 0

        var saveConfig = UIButton.Configuration.filled()
        saveConfig.title = "In ZweiCheck speichern"
        saveConfig.cornerStyle = .large
        saveConfig.baseBackgroundColor = UIColor(red: 0.059, green: 0.510, blue: 0.494, alpha: 1)
        saveConfig.contentInsets = NSDirectionalEdgeInsets(top: 15, leading: 18, bottom: 15, trailing: 18)
        saveButton.configuration = saveConfig
        saveButton.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        saveButton.addTarget(self, action: #selector(saveTapped), for: .touchUpInside)

        var cancelConfig = UIButton.Configuration.plain()
        cancelConfig.title = "Abbrechen"
        cancelConfig.contentInsets = NSDirectionalEdgeInsets(top: 13, leading: 16, bottom: 13, trailing: 16)
        cancelButton.configuration = cancelConfig
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)

        progress.hidesWhenStopped = true

        let stack = UIStackView(arrangedSubviews: [titleLabel, detailLabel, progress, saveButton, cancelButton])
        stack.axis = .vertical
        stack.spacing = 18
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 24),
            saveButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 56),
            cancelButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 48)
        ])
    }

    @objc private func saveTapped() {
        saveButton.isEnabled = false
        cancelButton.isEnabled = false
        progress.startAnimating()
        detailLabel.text = "Der Inhalt wird vorbereitet …"

        Task { @MainActor in
            do {
                try await saveSharedDraft()
                progress.stopAnimating()
                titleLabel.text = "Gespeichert"
                detailLabel.text = "Öffne jetzt ZweiCheck. Dort kannst du auswählen, wer dir helfen soll, und alles vor dem Absenden noch einmal prüfen."
                saveButton.configuration?.title = "Fertig"
                saveButton.isEnabled = false
                try? await Task.sleep(for: .seconds(1.2))
                extensionContext?.completeRequest(returningItems: nil)
            } catch {
                progress.stopAnimating()
                detailLabel.text = error.localizedDescription
                saveButton.isEnabled = true
                cancelButton.isEnabled = true
            }
        }
    }

    @objc private func cancelTapped() {
        let error = NSError(domain: NSCocoaErrorDomain, code: NSUserCancelledError)
        extensionContext?.cancelRequest(withError: error)
    }

    @MainActor
    private func saveSharedDraft() async throws {
        guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupIdentifier) else {
            throw ShareError.noSharedContainer
        }

        let inputs = extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem } ?? []
        let providers = inputs.flatMap { $0.attachments ?? [] }
        var sharedText: [String] = inputs.compactMap(\.attributedContentText?.string)
        var sharedURL: String?
        var imageData: [Data] = []

        for provider in providers {
            if sharedURL == nil, provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                if let item = try? await load(provider, type: UTType.url.identifier) {
                    if let url = item as? URL { sharedURL = url.absoluteString }
                    else if let url = item as? NSURL { sharedURL = url.absoluteString }
                }
            }

            if provider.hasItemConformingToTypeIdentifier(UTType.text.identifier), sharedText.count < 4 {
                if let item = try? await load(provider, type: UTType.text.identifier) {
                    if let text = item as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        sharedText.append(text)
                    } else if let text = item as? NSString {
                        sharedText.append(text as String)
                    }
                }
            }

            if imageData.count < 3, provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                if let item = try? await load(provider, type: UTType.image.identifier),
                   let data = imageBytes(from: item) {
                    imageData.append(data)
                }
            }
        }

        try clearOldDraft(in: container)
        var imageFiles: [String] = []
        for (index, data) in imageData.prefix(3).enumerated() {
            guard let jpeg = preparedJPEG(from: data) else { continue }
            let name = "shared-draft-\(index + 1).jpg"
            try jpeg.write(to: container.appendingPathComponent(name), options: .atomic)
            imageFiles.append(name)
        }

        let cleanText = sharedText
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: "\n\n")
        let category = sharedURL == nil ? "message" : "link"
        let payload = DraftPayload(
            id: UUID().uuidString,
            text: cleanText,
            url: sharedURL,
            category: category,
            imageFiles: imageFiles,
            createdAt: ISO8601DateFormatter().string(from: Date())
        )
        let encoded = try JSONEncoder().encode(payload)
        try encoded.write(to: container.appendingPathComponent("SharedDraft.json"), options: .atomic)
    }

    private func load(_ provider: NSItemProvider, type: String) async throws -> NSSecureCoding? {
        try await withCheckedThrowingContinuation { continuation in
            provider.loadItem(forTypeIdentifier: type, options: nil) { item, error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: item) }
            }
        }
    }

    private func imageBytes(from item: NSSecureCoding) -> Data? {
        if let data = item as? Data { return data }
        if let image = item as? UIImage { return image.jpegData(compressionQuality: 0.82) }
        if let url = item as? URL { return try? Data(contentsOf: url) }
        return nil
    }

    private func preparedJPEG(from data: Data) -> Data? {
        guard let source = UIImage(data: data) else { return nil }
        let largest = max(source.size.width, source.size.height)
        let scale = largest > 1800 ? 1800 / largest : 1
        let target = CGSize(width: max(1, source.size.width * scale), height: max(1, source.size.height * scale))
        let image = UIGraphicsImageRenderer(size: target).image { _ in
            source.draw(in: CGRect(origin: .zero, size: target))
        }
        for quality in [0.82, 0.68, 0.54, 0.42] {
            if let candidate = image.jpegData(compressionQuality: quality), candidate.count <= 7_500_000 {
                return candidate
            }
        }
        return nil
    }

    private func clearOldDraft(in container: URL) throws {
        let manager = FileManager.default
        let oldFiles = try manager.contentsOfDirectory(at: container, includingPropertiesForKeys: nil)
        for file in oldFiles where file.lastPathComponent == "SharedDraft.json" || file.lastPathComponent.hasPrefix("shared-draft-") {
            try? manager.removeItem(at: file)
        }
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

private enum ShareError: LocalizedError {
    case noSharedContainer

    var errorDescription: String? {
        "Der ZweiCheck-Speicher konnte nicht geöffnet werden. Bitte öffne ZweiCheck einmal und versuche es erneut."
    }
}
