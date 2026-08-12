import SwiftUI
import UIKit

struct PreviewImage: Identifiable {
    let id = UUID()
    let image: UIImage
    let label: String
}

struct ZoomableImageViewer: View {
    let preview: PreviewImage
    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1
    @State private var baseScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var baseOffset: CGSize = .zero

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            GeometryReader { proxy in
                Image(uiImage: preview.image)
                    .resizable()
                    .scaledToFit()
                    .frame(width: proxy.size.width, height: proxy.size.height)
                    .scaleEffect(scale)
                    .offset(offset)
                    .contentShape(Rectangle())
                    .gesture(magnifyGesture)
                    .simultaneousGesture(dragGesture)
                    .onTapGesture(count: 2) {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            if scale > 1.05 {
                                resetZoom()
                            } else {
                                scale = 2.5
                                baseScale = 2.5
                            }
                        }
                    }
                    .accessibilityLabel(preview.label)
                    .accessibilityHint("Mit zwei Fingern vergrößern oder verkleinern. Doppeltippen wechselt die Vergrößerung.")
            }

            VStack {
                HStack {
                    Spacer()
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.headline.bold())
                            .foregroundStyle(.white)
                            .frame(width: 46, height: 46)
                            .background(.black.opacity(0.65), in: Circle())
                    }
                    .accessibilityLabel("Bild schließen")
                }
                .padding(.horizontal, 18)
                .padding(.top, 8)

                Spacer()

                Text(scale > 1.05 ? "Zum Verschieben ziehen · Doppeltippen zum Zurücksetzen" : "Aufziehen zum Vergrößern · Doppeltippen für Zoom")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .background(.black.opacity(0.62), in: Capsule())
                    .padding(.bottom, 18)
            }
        }
        .statusBarHidden(true)
    }

    private var magnifyGesture: some Gesture {
        MagnifyGesture()
            .onChanged { value in
                scale = min(max(baseScale * value.magnification, 1), 6)
                if scale <= 1.01 {
                    offset = .zero
                    baseOffset = .zero
                }
            }
            .onEnded { _ in
                baseScale = scale
                if scale <= 1.01 {
                    withAnimation(.easeOut(duration: 0.18)) { resetZoom() }
                }
            }
    }

    private var dragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                guard scale > 1.05 else { return }
                offset = CGSize(
                    width: baseOffset.width + value.translation.width,
                    height: baseOffset.height + value.translation.height
                )
            }
            .onEnded { _ in
                guard scale > 1.05 else {
                    resetZoom()
                    return
                }
                baseOffset = offset
            }
    }

    private func resetZoom() {
        scale = 1
        baseScale = 1
        offset = .zero
        baseOffset = .zero
    }
}
