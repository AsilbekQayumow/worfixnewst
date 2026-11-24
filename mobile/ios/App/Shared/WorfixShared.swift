import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

/// Shared by the app, the widget extension and the share extension (App Group "group.site.worfix.app").
enum WorfixShared {
    static let appGroup = "group.site.worfix.app"
    static let base = "https://worfix.site"

    static var defaults: UserDefaults { UserDefaults(suiteName: appGroup) ?? .standard }

    /// Folder where the share extension leaves photos for the app.
    static var sharedFolder: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)?.appendingPathComponent("Shared", isDirectory: true)
    }

    // Widget session (set by the app after sign-in)
    static var widgetToken: String? {
        get { defaults.string(forKey: "widget.token") }
        set { defaults.set(newValue, forKey: "widget.token") }
    }
    static var widgetUser: String? {
        get { defaults.string(forKey: "widget.user") }
        set { defaults.set(newValue, forKey: "widget.user") }
    }
    /// The last widget JSON, so widgets draw at once and offline.
    static var widgetJSON: Data? {
        get { defaults.data(forKey: "widget.json") }
        set { defaults.set(newValue, forKey: "widget.json") }
    }
    /// The last known position (the nearest mission is measured from it).
    static func saveLocation(lat: Double, lng: Double) {
        defaults.set(lat, forKey: "loc.lat")
        defaults.set(lng, forKey: "loc.lng")
    }
    static var lastLocation: (lat: Double, lng: Double)? {
        let lat = defaults.double(forKey: "loc.lat"), lng = defaults.double(forKey: "loc.lng")
        return lat == 0 && lng == 0 ? nil : (lat, lng)
    }

    /// A worfix.site page as a URL the app opens (widgets, Live Activity, shortcuts).
    static func link(_ path: String) -> URL { URL(string: "worfix://open\(path.hasPrefix("/") ? path : "/" + path)")! }
}

#if canImport(ActivityKit)
/// The walk on the lock screen and in the Dynamic Island.
@available(iOS 16.1, *)
struct WalkAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var distance: String
        var area: String
        var hint: String
        var closed: Bool
    }
    var title: String
    var distanceLabel: String
    var areaLabel: String
    var colorHex: String
    var startedAt: Date
}
#endif
