import UIKit
import UniformTypeIdentifiers

/// Share → WORFIX: keeps up to 6 photos in the App Group; the app picks them up next time it opens and asks
/// which mission report they belong to.
final class ShareViewController: UIViewController {
    private let card = UIView()
    private let icon = UIImageView()
    private let label = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.black.withAlphaComponent(0.25)
        card.backgroundColor = .systemBackground
        card.layer.cornerRadius = 24
        card.translatesAutoresizingMaskIntoConstraints = false
        icon.image = UIImage(systemName: "photo.on.rectangle.angled")
        icon.tintColor = UIColor(red: 0.12, green: 0.66, blue: 0.29, alpha: 1)
        icon.contentMode = .scaleAspectFit
        icon.translatesAutoresizingMaskIntoConstraints = false
        label.text = text(0)
        label.font = .systemFont(ofSize: 17, weight: .bold)
        label.textAlignment = .center
        label.numberOfLines = 0
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(card)
        card.addSubview(icon)
        card.addSubview(label)
        NSLayoutConstraint.activate([
            card.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            card.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            card.widthAnchor.constraint(equalToConstant: 280),
            icon.topAnchor.constraint(equalTo: card.topAnchor, constant: 24),
            icon.centerXAnchor.constraint(equalTo: card.centerXAnchor),
            icon.heightAnchor.constraint(equalToConstant: 44),
            icon.widthAnchor.constraint(equalToConstant: 44),
            label.topAnchor.constraint(equalTo: icon.bottomAnchor, constant: 14),
            label.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
            label.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -20),
            label.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -24),
        ])
        Task { await collect() }
    }

    private func text(_ n: Int) -> String {
        let lang = Locale.preferredLanguages.first.map { String($0.prefix(2)) } ?? "uz"
        switch lang {
        case "ru": return n == 0 ? "Сохраняем…" : "Фото: \(n). Откройте WORFIX и выберите миссию"
        case "en": return n == 0 ? "Saving…" : "\(n) photo(s) saved. Open WORFIX and pick the mission"
        default: return n == 0 ? "Saqlanmoqda…" : "\(n) ta rasm saqlandi. WORFIX'ni ochib, missiyani tanlang"
        }
    }

    private func collect() async {
        guard let dir = WorfixShared.sharedFolder else { return finish() }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        // Replace anything left from an earlier share.
        for old in (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? [] { try? FileManager.default.removeItem(at: old) }
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
            .filter { $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) }
        var saved = 0
        for (i, p) in providers.prefix(6).enumerated() {
            if let data = await load(p) {
                let ext = p.hasItemConformingToTypeIdentifier(UTType.png.identifier) ? "png" : p.hasItemConformingToTypeIdentifier(UTType.heic.identifier) ? "heic" : "jpg"
                if (try? data.write(to: dir.appendingPathComponent(String(format: "%02d.%@", i, ext)))) != nil { saved += 1 }
            }
        }
        await MainActor.run {
            label.text = text(saved)
            icon.image = UIImage(systemName: saved > 0 ? "checkmark.circle.fill" : "xmark.circle")
        }
        try? await Task.sleep(nanoseconds: 1_400_000_000)
        finish()
    }

    /// The original bytes (keeps the EXIF capture time the reviewers check).
    private func load(_ p: NSItemProvider) async -> Data? {
        await withCheckedContinuation { cont in
            p.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { data, _ in cont.resume(returning: data) }
        }
    }

    private func finish() {
        DispatchQueue.main.async { self.extensionContext?.completeRequest(returningItems: nil) }
    }
}
