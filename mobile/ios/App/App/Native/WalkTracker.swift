import Foundation
import CoreLocation
import UIKit
import UserNotifications
#if canImport(ActivityKit)
import ActivityKit
#endif

/// Records the walk with the phone's GPS in the background (blue location indicator) and keeps it on the lock
/// screen and in the Dynamic Island as a Live Activity. Same rules as the site (web/src/lib/domain/territory.ts):
/// fixes worse than 35 m are ignored, stretches faster than 18 km/h are skipped, the loop closes within 35 m of
/// the start after 200 m and 8 good fixes.
final class WalkTracker: NSObject, CLLocationManagerDelegate {
    static let shared = WalkTracker()

    struct Point: Codable { let lat: Double; let lng: Double; let t: Double; let acc: Double }

    private let manager = CLLocationManager()
    private(set) var points: [Point] = []
    private(set) var running = false
    private var labels: [String: String] = [:]
    private var color = "#1fa84a"
    private var pendingStart: ((Bool) -> Void)?
    private var lastPanel = Date.distantPast
    private var closedAlerted = false
    private var activity: Any?

    private var file: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("walk.json")
    }

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 2
        manager.activityType = .fitness
        manager.pausesLocationUpdatesAutomatically = false
        load()
    }

    // MARK: - control

    func start(color: String, labels: [String: String], resume: Bool, done: @escaping (Bool) -> Void) {
        self.color = color
        self.labels = labels
        if !resume { points = []; closedAlerted = false; save() }
        switch manager.authorizationStatus {
        case .notDetermined:
            pendingStart = done
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            begin()
            done(true)
        default:
            done(false)
        }
    }

    func stop(clear: Bool) {
        running = false
        manager.stopUpdatingLocation()
        manager.allowsBackgroundLocationUpdates = false
        endActivity()
        if clear { points = []; save() }
    }

    func since(_ from: Int) -> [Point] { from >= points.count ? [] : Array(points[max(0, from)...]) }

    private func begin() {
        running = true
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = true
        manager.startUpdatingLocation()
        startActivity()
    }

    // MARK: - CLLocationManagerDelegate

    func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        guard let done = pendingStart else { return }
        switch m.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            pendingStart = nil
            begin()
            done(true)
        case .denied, .restricted:
            pendingStart = nil
            done(false)
        default: break
        }
    }

    func locationManager(_ m: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for loc in locations where loc.horizontalAccuracy >= 0 {
            points.append(Point(lat: loc.coordinate.latitude, lng: loc.coordinate.longitude, t: loc.timestamp.timeIntervalSince1970 * 1000, acc: loc.horizontalAccuracy))
            WorfixShared.saveLocation(lat: loc.coordinate.latitude, lng: loc.coordinate.longitude)
        }
        if points.count % 5 == 0 { save() }
        if Date().timeIntervalSince(lastPanel) >= 2 {
            lastPanel = Date()
            updateActivity()
        }
    }

    // MARK: - numbers

    struct Stats { var pathM = 0.0; var areaM2 = 0.0; var toStartM = -1.0; var kept = 0; var closed = false }

    static func distance(_ a: Point, _ b: Point) -> Double {
        CLLocation(latitude: a.lat, longitude: a.lng).distance(from: CLLocation(latitude: b.lat, longitude: b.lng))
    }

    func stats() -> Stats {
        var s = Stats()
        var kept: [Point] = []
        for p in points where p.acc <= 35 {
            if let q = kept.last {
                let d = WalkTracker.distance(q, p)
                let hours = max(1, p.t - q.t) / 3_600_000
                if d / 1000 / hours > 18 && d > 25 { continue }
                if d < 2 { continue }
                s.pathM += d
            }
            kept.append(p)
        }
        s.kept = kept.count
        if let a = kept.first, let b = kept.last, kept.count >= 2 {
            s.toStartM = WalkTracker.distance(a, b)
            s.closed = s.pathM >= 200 && kept.count >= 8 && s.toStartM <= 35
        }
        if kept.count >= 3, let o = kept.first {
            let k = cos(o.lat * .pi / 180), m = 111_320.0
            var sum = 0.0
            for i in 0..<kept.count {
                let p = kept[i], q = kept[(i + 1) % kept.count]
                let x1 = (p.lng - o.lng) * m * k, y1 = (p.lat - o.lat) * m
                let x2 = (q.lng - o.lng) * m * k, y2 = (q.lat - o.lat) * m
                sum += x1 * y2 - x2 * y1
            }
            s.areaM2 = abs(sum) / 2
        }
        return s
    }

    static func meters(_ m: Double) -> String { m < 1000 ? "\(Int(m.rounded())) m" : String(format: "%.2f km", m / 1000) }
    static func area(_ m2: Double) -> String {
        if m2 >= 1_000_000 { return String(format: "%.2f km²", m2 / 1_000_000) }
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.groupingSeparator = " "
        return "\(f.string(from: NSNumber(value: Int((m2 / 10).rounded() * 10))) ?? "0") m²"
    }

    private func hint(_ s: Stats) -> String {
        if s.closed { return labels["closed"] ?? "" }
        if s.toStartM >= 0 && s.pathM >= 60 { return (labels["toStart"] ?? "{d}").replacingOccurrences(of: "{d}", with: WalkTracker.meters(s.toStartM)) }
        return labels["hint"] ?? ""
    }

    // MARK: - Live Activity

    private func startActivity() {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *), ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        if activity != nil { updateActivity(); return }
        let s = stats()
        let attrs = WalkAttributes(title: labels["title"] ?? "WORFIX", distanceLabel: labels["distance"] ?? "", areaLabel: labels["area"] ?? "",
                                   colorHex: color, startedAt: Date(timeIntervalSince1970: (points.first?.t ?? Date().timeIntervalSince1970 * 1000) / 1000))
        let state = WalkAttributes.ContentState(distance: WalkTracker.meters(s.pathM), area: s.kept >= 3 ? WalkTracker.area(s.areaM2) : "—", hint: hint(s), closed: s.closed)
        activity = try? Activity<WalkAttributes>.request(attributes: attrs, content: ActivityContent(state: state, staleDate: nil), pushType: nil)
        #endif
    }

    private func updateActivity() {
        let s = stats()
        if s.closed && !closedAlerted {
            closedAlerted = true
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            let n = UNMutableNotificationContent()
            n.title = labels["title"] ?? "WORFIX"
            n.body = labels["closed"] ?? ""
            n.sound = .default
            n.userInfo = ["link": "/app/map"]
            UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "walk-closed", content: n, trigger: nil))
        }
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *), let a = activity as? Activity<WalkAttributes> else { return }
        let state = WalkAttributes.ContentState(distance: WalkTracker.meters(s.pathM), area: s.kept >= 3 ? WalkTracker.area(s.areaM2) : "—", hint: hint(s), closed: s.closed)
        Task { await a.update(ActivityContent(state: state, staleDate: nil)) }
        #endif
    }

    private func endActivity() {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *), let a = activity as? Activity<WalkAttributes> else { return }
        activity = nil
        Task { await a.end(nil, dismissalPolicy: .immediate) }
        #endif
    }

    // MARK: - persistence (a walk survives the app being closed by the system)

    private func save() {
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? JSONEncoder().encode(points).write(to: file, options: .atomic)
    }

    private func load() {
        guard let data = try? Data(contentsOf: file), let list = try? JSONDecoder().decode([Point].self, from: data) else { return }
        if let first = list.first, Date().timeIntervalSince1970 * 1000 - first.t > 6 * 3_600_000 { return }
        points = list
    }
}
