import ActivityKit
import WidgetKit
import SwiftUI

/// The walk on the lock screen and in the Dynamic Island: distance, area so far, how far the start is.
struct WalkLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WalkAttributes.self) { ctx in
            LockScreenWalk(attrs: ctx.attributes, state: ctx.state)
                .activityBackgroundTint(Color(hex: "#13803a"))
                .activitySystemActionForegroundColor(.white)
                .widgetURL(WorfixShared.link("/app/map"))
        } dynamicIsland: { ctx in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(ctx.attributes.distanceLabel).font(.caption2).foregroundStyle(.secondary)
                        Text(ctx.state.distance).font(.system(size: 20, weight: .heavy, design: .rounded))
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(ctx.attributes.areaLabel).font(.caption2).foregroundStyle(.secondary)
                        Text(ctx.state.area).font(.system(size: 20, weight: .heavy, design: .rounded))
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(ctx.state.hint).font(.system(size: 13, weight: .semibold, design: .rounded))
                        .foregroundStyle(ctx.state.closed ? Color.wGreen : .primary).lineLimit(2)
                }
            } compactLeading: {
                Image(systemName: ctx.state.closed ? "checkmark.circle.fill" : "figure.walk").foregroundStyle(Color(hex: ctx.attributes.colorHex))
            } compactTrailing: {
                Text(ctx.state.distance).font(.system(size: 13, weight: .bold, design: .rounded))
            } minimal: {
                Image(systemName: "figure.walk").foregroundStyle(Color.wGreen)
            }
            .widgetURL(WorfixShared.link("/app/map"))
        }
    }
}

struct LockScreenWalk: View {
    let attrs: WalkAttributes
    let state: WalkAttributes.ContentState
    func tile(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.system(size: 11, weight: .bold, design: .rounded)).foregroundStyle(.white.opacity(0.8))
            Text(value).font(.system(size: 22, weight: .heavy, design: .rounded)).foregroundStyle(.white).minimumScaleFactor(0.7).lineLimit(1)
        }
        .padding(10).frame(maxWidth: .infinity, alignment: .leading)
        .background(.white.opacity(0.15), in: RoundedRectangle(cornerRadius: 14))
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: state.closed ? "checkmark.circle.fill" : "figure.walk").foregroundStyle(.white)
                Text(attrs.title).font(.system(size: 15, weight: .bold, design: .rounded)).foregroundStyle(.white)
                Spacer()
                Text(attrs.startedAt, style: .timer).font(.system(size: 13, weight: .semibold, design: .rounded).monospacedDigit()).foregroundStyle(.white.opacity(0.85))
                    .multilineTextAlignment(.trailing).frame(maxWidth: 70)
            }
            HStack(spacing: 10) {
                tile(attrs.distanceLabel, state.distance)
                tile(attrs.areaLabel, state.area)
            }
            Text(state.hint).font(.system(size: 13, weight: .semibold, design: .rounded)).foregroundStyle(.white).lineLimit(2)
        }
        .padding(16)
    }
}
