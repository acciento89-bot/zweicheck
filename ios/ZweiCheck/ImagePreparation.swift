import Foundation
import UIKit

struct UploadImage: Identifiable, Equatable {
    let id = UUID()
    let data: Data
    let fileName: String
    let mimeType: String
}

enum ImagePreparation {
    static let maximumBytes = 7_500_000
    static let maximumDimension: CGFloat = 2200

    @MainActor
    static func jpeg(from sourceData: Data, index: Int) throws -> UploadImage {
        guard let source = UIImage(data: sourceData) else {
            throw ImagePreparationError.invalidImage
        }

        var image = normalized(source, maximumDimension: maximumDimension)
        var result: Data?
        for quality in [0.86, 0.72, 0.58, 0.45] {
            if let candidate = image.jpegData(compressionQuality: quality) {
                result = candidate
                if candidate.count <= maximumBytes { break }
            }
        }

        if let result, result.count > maximumBytes {
            image = normalized(image, maximumDimension: 1500)
            result = image.jpegData(compressionQuality: 0.55)
        }

        guard let data = result, data.count <= maximumBytes else {
            throw ImagePreparationError.tooLarge
        }

        return UploadImage(data: data, fileName: "zweicheck-\(index + 1).jpg", mimeType: "image/jpeg")
    }

    @MainActor
    private static func normalized(_ source: UIImage, maximumDimension: CGFloat) -> UIImage {
        let width = source.size.width
        let height = source.size.height
        let largest = max(width, height)
        let scale = largest > maximumDimension ? maximumDimension / largest : 1
        let target = CGSize(width: max(1, width * scale), height: max(1, height * scale))
        let renderer = UIGraphicsImageRenderer(size: target)
        return renderer.image { _ in
            source.draw(in: CGRect(origin: .zero, size: target))
        }
    }
}

enum ImagePreparationError: LocalizedError {
    case invalidImage
    case tooLarge

    var errorDescription: String? {
        switch self {
        case .invalidImage: "Ein ausgewähltes Bild konnte nicht gelesen werden."
        case .tooLarge: "Ein Bild ist auch nach der Verkleinerung noch zu groß."
        }
    }
}
