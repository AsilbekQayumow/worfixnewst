import UIKit
import Capacitor

/// Long-press the app icon: Walk a loop, Missions, Map (titles in the phone's language).
enum QuickActions {
    private static let titles: [String: [String: String]] = [
        "uz": ["walk": "Hudud chizish", "missions": "Missiyalar", "map": "Xarita"],
        "ru": ["walk": "Захватить", "missions": "Миссии", "map": "Карта"],
        "en": ["walk": "Walk a loop", "missions": "Missions", "map": "Map"],
    ]
    private static let paths = ["walk": "/app/map?walk=1", "missions": "/app/missions", "map": "/app/map"]
    private static let icons = ["walk": "figure.walk", "missions": "magnifyingglass", "map": "map"]

    static func install() {
        let lang = Locale.preferredLanguages.first.map { String($0.prefix(2)) } ?? "uz"
        let t = titles[lang] ?? titles["uz"]!
        UIApplication.shared.shortcutItems = ["walk", "missions", "map"].map { id in
            UIApplicationShortcutItem(type: id, localizedTitle: t[id] ?? id, localizedSubtitle: nil,
                                      icon: UIApplicationShortcutIcon(systemImageName: icons[id] ?? "circle"), userInfo: nil)
        }
    }

    /// Opens the page of a quick action (or any worfix:// link) through Capacitor's appUrlOpen.
    @discardableResult
    static func handle(_ item: UIApplicationShortcutItem, coldStart: Bool = false) -> Bool {
        guard let path = paths[item.type] else { return false }
        open(WorfixShared.link(path), coldStart: coldStart)
        return true
    }

    /// On a cold start the plugins load later: wait for the web view, like SceneDelegateProxy does
    /// (the page also asks App.getLaunchUrl() when it starts).
    static func open(_ url: URL, coldStart: Bool = false) {
        let go = { _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:]) }
        guard coldStart else { go(); return }
        var token: NSObjectProtocol?
        token = NotificationCenter.default.addObserver(forName: .capacitorViewDidAppear, object: nil, queue: .main) { _ in
            if let token { NotificationCenter.default.removeObserver(token) }
            go()
        }
    }
}
