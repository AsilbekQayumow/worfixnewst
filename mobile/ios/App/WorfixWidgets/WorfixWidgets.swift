import WidgetKit
import SwiftUI

// MARK: - data (web/src/lib/server/widget.ts)

struct WData: Decodable {
    struct Streak: Decodable { let days: Int; let text: String; let hint: String; let safe: Bool }
    struct Level: Decodable { let n: Int; let title: String; let progress: Double; let text: String }
    struct Tree: Decodable { let stage: Int; let thirst: Int; let count: Int; let title: String; let hint: String }
    struct Mission: Decodable { let id: String; let title: String; let category: String; let categoryText: String; let distance: String?; let when: String; let link: String }
    struct Area: Decodable { let m2: Int; let text: String; let rank: Int; let rankText: String; let rings: [[[Double]]]; let aspect: Double }
    struct Pulse: Decodable { let missions: Int; let people: Int; let hours: Int; let missionsText: String; let peopleText: String; let hoursText: String }
    struct Labels: Decodable {
        let tree: String; let streak: String; let level: String; let mission: String; let join: String; let area: String
        let pulse: String; let noMission: String; let noArea: String; let walk: String; let open: String; let signIn: String
    }
    let name: String
    let color: String
    let streak: Streak
    let level: Level
    let tree: Tree
    let mission: Mission?
    let area: Area?
    let pulse: Pulse
    let labels: Labels
}

struct Entry: TimelineEntry {
    let date: Date
    let data: WData?
}

enum Source {
    static func cached() -> WData? {
        guard WorfixShared.widgetToken != nil, let json = WorfixShared.widgetJSON else { return nil }
        return try? JSONDecoder().decode(WData.self, from: json)
    }

    static func fetch() async -> WData? {
        guard let token = WorfixShared.widgetToken else { return nil }
        var comps = URLComponents(string: "\(WorfixShared.base)/.netlify/functions/widget")!
        if let l = WorfixShared.lastLocation {
            comps.queryItems = [URLQueryItem(name: "lat", value: String(format: "%.5f", l.lat)), URLQueryItem(name: "lng", value: String(format: "%.5f", l.lng))]
        }
        var req = URLRequest(url: comps.url!, timeoutInterval: 12)
        req.setValue(token, forHTTPHeaderField: "x-widget-token")
        guard let result = try? await URLSession.shared.data(for: req), let http = result.1 as? HTTPURLResponse else { return cached() }
        let body = result.0
        if http.statusCode == 401 { WorfixShared.widgetToken = nil; WorfixShared.widgetJSON = nil; return nil }
        guard http.statusCode == 200, let data = try? JSONDecoder().decode(WData.self, from: body) else { return cached() }
        WorfixShared.widgetJSON = body
        return data
    }
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry { Entry(date: Date(), data: nil) }
    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(Entry(date: Date(), data: Source.cached())) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        Task {
            let data = await Source.fetch()
            completion(Timeline(entries: [Entry(date: Date(), data: data)], policy: .after(Date().addingTimeInterval(30 * 60))))
        }
    }
}

// MARK: - look

extension Color {
    init(hex: String) {
        var v: UInt64 = 0
        Scanner(string: hex.replacingOccurrences(of: "#", with: "")).scanHexInt64(&v)
        self.init(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255)
    }
    static let wGreen = Color(hex: "#1fa84a")
    static let wFlame = Color(hex: "#ff8a1f")
    static let wSky = Color(hex: "#1c9bf0")
    static let wBerry = Color(hex: "#ec4f93")
}

extension View {
    /// iOS 17 widgets need containerBackground; earlier ones a plain background.
    @ViewBuilder func widgetBackground(_ style: Color) -> some View {
        if #available(iOSApplicationExtension 17.0, *) { containerBackground(style, for: .widget) } else { padding().background(style) }
    }
}

struct Label12: View {
    let text: String
    var body: some View { Text(text).font(.system(size: 12, weight: .bold, design: .rounded)).foregroundStyle(.secondary).lineLimit(1) }
}

struct SignedOut: View {
    let kind: String
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "leaf.fill").font(.title2).foregroundStyle(Color.wGreen)
            Text(signInText).font(.system(size: 13, weight: .bold, design: .rounded)).multilineTextAlignment(.center)
        }
        .widgetURL(WorfixShared.link("/app"))
    }
    private var signInText: String {
        switch Locale.preferredLanguages.first.map({ String($0.prefix(2)) }) {
        case "ru": return "Войдите в приложение WORFIX"
        case "en": return "Sign in to the WORFIX app"
        default: return "Ko'rish uchun WORFIX ilovasiga kiring"
        }
    }
}

private func categoryIcon(_ c: String) -> String {
    switch c {
    case "environment": return "leaf.fill"
    case "water": return "drop.fill"
    case "animals": return "pawprint.fill"
    case "education": return "book.fill"
    case "recycling": return "arrow.3.trianglepath"
    default: return "hands.sparkles.fill"
    }
}

// MARK: - 1. My tree

struct TreeView: View {
    @Environment(\.widgetFamily) var family
    let d: WData
    var image: some View {
        Image("tree_s\(min(4, max(0, d.tree.stage)))_t\(min(2, max(0, d.tree.thirst)))").resizable().scaledToFit()
    }
    var body: some View {
        Group {
            if family == .systemMedium {
                HStack(spacing: 12) {
                    image.frame(maxWidth: 120)
                    VStack(alignment: .leading, spacing: 4) {
                        Label12(text: d.labels.tree)
                        Text(d.tree.title).font(.system(size: 18, weight: .heavy, design: .rounded))
                        Text(d.tree.hint).font(.system(size: 12, design: .rounded)).foregroundStyle(.secondary).lineLimit(3)
                    }
                    Spacer(minLength: 0)
                }
            } else {
                VStack(spacing: 2) {
                    HStack { Label12(text: d.labels.tree); Spacer(); Text("✓ \(d.tree.count)").font(.system(size: 11, weight: .bold, design: .rounded)) }
                    image
                    Text(d.tree.title).font(.system(size: 14, weight: .heavy, design: .rounded)).lineLimit(1)
                }
            }
        }
        .widgetURL(WorfixShared.link("/app/profile"))
    }
}

struct TreeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WorfixTree", provider: Provider()) { e in
            Group { if let d = e.data { TreeView(d: d) } else { SignedOut(kind: "tree") } }.widgetBackground(Color(.systemBackground))
        }
        .configurationDisplayName("WORFIX · 🌳")
        .description("Mening daraxtim · Моё дерево · My tree")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - 2. Streak and level (also on the lock screen)

struct StreakView: View {
    @Environment(\.widgetFamily) var family
    let d: WData
    var body: some View {
        Group {
            switch family {
            case .accessoryInline:
                Text("🔥 \(d.streak.days) · \(d.level.title)")
            case .accessoryCircular:
                ZStack {
                    AccessoryWidgetBackground()
                    VStack(spacing: 0) {
                        Image(systemName: "flame.fill")
                        Text("\(d.streak.days)").font(.system(size: 18, weight: .heavy, design: .rounded))
                    }
                }
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 2) {
                    Text("🔥 \(d.streak.text)").font(.system(size: 14, weight: .bold, design: .rounded)).lineLimit(1)
                    Text(d.level.title).font(.system(size: 12, design: .rounded))
                    ProgressView(value: d.level.progress)
                }
            default:
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 10) {
                        Image(systemName: "flame.fill").font(.system(size: 22)).foregroundStyle(Color.wFlame)
                            .frame(width: 40, height: 40).background(Color.wFlame.opacity(0.16), in: RoundedRectangle(cornerRadius: 14))
                        VStack(alignment: .leading, spacing: 0) {
                            Label12(text: d.labels.streak)
                            Text("\(d.streak.days)").font(.system(size: 30, weight: .heavy, design: .rounded))
                        }
                    }
                    Text(d.streak.hint).font(.system(size: 12, weight: .bold, design: .rounded)).foregroundStyle(d.streak.safe ? Color.wGreen : Color.wFlame).lineLimit(1)
                    Spacer(minLength: 0)
                    HStack { Text(d.level.title).font(.system(size: 13, weight: .bold, design: .rounded)); Spacer(); Text(d.level.text).font(.system(size: 10, design: .rounded)).foregroundStyle(.secondary) }
                    ProgressView(value: d.level.progress).tint(Color.wGreen)
                }
            }
        }
        .widgetURL(WorfixShared.link("/app"))
    }
}

struct StreakWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WorfixStreak", provider: Provider()) { e in
            Group { if let d = e.data { StreakView(d: d) } else { SignedOut(kind: "streak") } }.widgetBackground(Color(.systemBackground))
        }
        .configurationDisplayName("WORFIX · 🔥")
        .description("Seriya va daraja · Серия и уровень · Streak and level")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

// MARK: - 3. Mission nearby

struct MissionView: View {
    @Environment(\.widgetFamily) var family
    let d: WData
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) { Image(systemName: "mappin.circle.fill").foregroundStyle(Color.wBerry); Label12(text: d.labels.mission) }
            if let m = d.mission {
                Label(m.categoryText, systemImage: categoryIcon(m.category))
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Color.wGreen.opacity(0.14), in: Capsule())
                Text(m.title).font(.system(size: family == .systemSmall ? 14 : 16, weight: .heavy, design: .rounded)).lineLimit(2)
                Spacer(minLength: 0)
                HStack {
                    Text([m.distance, m.when].compactMap { $0 }.joined(separator: " · ")).font(.system(size: 12, design: .rounded)).foregroundStyle(.secondary).lineLimit(2)
                    Spacer()
                    if family != .systemSmall {
                        Text(d.labels.join).font(.system(size: 13, weight: .bold, design: .rounded)).foregroundStyle(.white)
                            .padding(.horizontal, 14).padding(.vertical, 8).background(Color.wGreen, in: RoundedRectangle(cornerRadius: 12))
                    }
                }
            } else {
                Spacer()
                Text(d.labels.noMission).font(.system(size: 13, design: .rounded)).foregroundStyle(.secondary)
                Spacer()
            }
        }
        .widgetURL(WorfixShared.link(d.mission?.link ?? "/app/missions"))
    }
}

struct MissionWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WorfixMission", provider: Provider()) { e in
            Group { if let d = e.data { MissionView(d: d) } else { SignedOut(kind: "mission") } }.widgetBackground(Color(.systemBackground))
        }
        .configurationDisplayName("WORFIX · 📍")
        .description("Yaqindagi missiya · Миссия рядом · Mission nearby")
        .supportedFamilies([.systemMedium, .systemSmall])
    }
}

// MARK: - 4. My area

struct AreaShape: Shape {
    let rings: [[[Double]]]
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let size = min(rect.width, rect.height)
        let ox = rect.minX + (rect.width - size) / 2, oy = rect.minY + (rect.height - size) / 2
        for ring in rings where ring.count >= 3 {
            for (i, pt) in ring.enumerated() where pt.count >= 2 {
                let q = CGPoint(x: ox + pt[0] * size, y: oy + pt[1] * size)
                if i == 0 { p.move(to: q) } else { p.addLine(to: q) }
            }
            p.closeSubpath()
        }
        return p
    }
}

struct AreaView: View {
    @Environment(\.widgetFamily) var family
    let d: WData
    var body: some View {
        let color = Color(hex: d.color)
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: "map.fill").foregroundStyle(Color.wSky)
                Label12(text: d.labels.area)
                Spacer()
                if let a = d.area, !a.rankText.isEmpty {
                    Text(a.rankText).font(.system(size: 11, weight: .bold, design: .rounded)).padding(.horizontal, 8).padding(.vertical, 2).background(Color.wSky.opacity(0.16), in: Capsule())
                }
            }
            if let a = d.area {
                ZStack {
                    RoundedRectangle(cornerRadius: 14).fill(Color.secondary.opacity(0.08))
                    AreaShape(rings: a.rings).fill(color.opacity(0.35), style: FillStyle(eoFill: true)).padding(8)
                    AreaShape(rings: a.rings).stroke(color, style: StrokeStyle(lineWidth: 2.5, lineJoin: .round)).padding(8)
                }
                Text(a.text).font(.system(size: 18, weight: .heavy, design: .rounded))
            } else {
                Spacer()
                Text(d.labels.noArea).font(.system(size: 12, design: .rounded)).foregroundStyle(.secondary).multilineTextAlignment(.center).frame(maxWidth: .infinity)
                Link(destination: WorfixShared.link("/app/map?walk=1")) {
                    Label(d.labels.walk, systemImage: "figure.walk").font(.system(size: 13, weight: .bold, design: .rounded)).foregroundStyle(.white)
                        .padding(.horizontal, 12).padding(.vertical, 8).frame(maxWidth: .infinity).background(Color.wFlame, in: RoundedRectangle(cornerRadius: 12))
                }
                Spacer()
            }
        }
        .widgetURL(WorfixShared.link("/app/map"))
    }
}

struct AreaWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WorfixArea", provider: Provider()) { e in
            Group { if let d = e.data { AreaView(d: d) } else { SignedOut(kind: "area") } }.widgetBackground(Color(.systemBackground))
        }
        .configurationDisplayName("WORFIX · 🗺️")
        .description("Mening hududim · Моя территория · My area")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - 5. Community pulse

struct PulseView: View {
    let d: WData
    func stat(_ n: Int, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\(n)").font(.system(size: 26, weight: .heavy, design: .rounded)).foregroundStyle(.white).minimumScaleFactor(0.6).lineLimit(1)
            Text(label).font(.system(size: 11, design: .rounded)).foregroundStyle(.white.opacity(0.85)).lineLimit(2)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(d.labels.pulse, systemImage: "checkmark.seal.fill").font(.system(size: 12, weight: .bold, design: .rounded)).foregroundStyle(.white.opacity(0.9))
            HStack(alignment: .top) {
                stat(d.pulse.missions, d.pulse.missionsText)
                stat(d.pulse.people, d.pulse.peopleText)
                stat(d.pulse.hours, d.pulse.hoursText)
            }
        }
        .widgetURL(WorfixShared.link("/app"))
    }
}

struct PulseWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WorfixPulse", provider: Provider()) { e in
            Group { if let d = e.data { PulseView(d: d) } else { SignedOut(kind: "pulse") } }.widgetBackground(e.data == nil ? Color(.systemBackground) : Color.wGreen)
        }
        .configurationDisplayName("WORFIX · 💚")
        .description("Jamoa pulsi · Пульс сообщества · Community pulse")
        .supportedFamilies([.systemMedium])
    }
}

// MARK: - bundle

@main
struct WorfixWidgetBundle: WidgetBundle {
    var body: some Widget {
        TreeWidget()
        StreakWidget()
        MissionWidget()
        AreaWidget()
        PulseWidget()
        WalkLiveActivity()
    }
}
