import ActivityKit
import SwiftUI
import WidgetKit

/// The Live Activity's look, after the web pill (src/components/live-activity/views.tsx): the inverse surface, serif scores, the field-style
/// win meter. Countdowns use `Text(timerInterval:)`, so iOS ticks them with no updates from the app.
struct CommishLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CommishActivityAttributes.self) { context in
            LockScreen(state: context.state, attributes: context.attributes, stale: context.isStale)
                .activityBackgroundTint(Theme.inverse)
                .activitySystemActionForegroundColor(Theme.onInverse)
                .widgetURL(context.state.url)
        } dynamicIsland: { context in
            let s = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    if let m = s.matchup { SideScore(side: m.me, alignment: .leading, mine: true) } else { KindIcon(kind: s.kind).font(.title2).padding(.leading, 4) }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if let m = s.matchup { SideScore(side: m.opp, alignment: .trailing, mine: false) } else if s.isCountdown, let at = s.countdownAt { Countdown(at: at).font(.title3).padding(.trailing, 4) }
                }
                DynamicIslandExpandedRegion(.center) {
                    HStack(spacing: 5) {
                        if s.live && !(s.matchup?.final ?? false) { Circle().fill(.red).frame(width: 6, height: 6) }
                        Text(s.title).font(.caption.weight(.semibold)).foregroundStyle(Theme.goldOnInverse)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ExpandedBottom(state: s)
                }
            } compactLeading: {
                if let m = s.matchup {
                    Text(Format.pts(m.me.score)).font(.system(.callout, design: .serif).weight(.semibold)).monospacedDigit()
                        .foregroundStyle(m.winP >= 0.5 ? Theme.greenOnInverse : Theme.onInverse)
                } else {
                    KindIcon(kind: s.kind).foregroundStyle(s.urgency == "urgent" ? Theme.redOnInverse : Theme.goldOnInverse)
                }
            } compactTrailing: {
                if let m = s.matchup {
                    Text(Format.pts(m.opp.score)).font(.system(.callout, design: .serif)).monospacedDigit().foregroundStyle(Theme.onInverse.opacity(0.8))
                } else if s.isCountdown, let at = s.countdownAt {
                    Countdown(at: at).frame(maxWidth: 64)
                } else {
                    Text(s.headline).font(.caption2.weight(.semibold)).lineLimit(1).frame(maxWidth: 80)
                }
            } minimal: {
                if let m = s.matchup {
                    Gauge(value: m.winP) { EmptyView() } currentValueLabel: { Text("\(Int((m.winP * 100).rounded()))").font(.system(size: 10, weight: .bold)) }
                        .gaugeStyle(.accessoryCircularCapacity)
                        .tint(m.winP >= 0.5 ? Theme.greenOnInverse : Theme.redOnInverse)
                } else {
                    KindIcon(kind: s.kind).foregroundStyle(Theme.goldOnInverse)
                }
            }
            .widgetURL(s.url)
            .keylineTint(Theme.goldOnInverse)
        }
    }
}

// MARK: - lock screen

private struct LockScreen: View {
    var state: CommishActivityAttributes.ContentState
    var attributes: CommishActivityAttributes
    var stale: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                KindIcon(kind: state.kind).font(.caption).foregroundStyle(Theme.goldOnInverse)
                Text(state.title).font(.caption.weight(.semibold)).foregroundStyle(Theme.goldOnInverse)
                if state.live && !(state.matchup?.final ?? false) { Circle().fill(.red).frame(width: 6, height: 6) }
                Spacer()
                Text(attributes.leagueName.lowercased()).font(.caption2).foregroundStyle(Theme.onInverse.opacity(0.55)).lineLimit(1)
            }
            if let m = state.matchup {
                MatchupBody(m: m)
            } else if state.isCountdown, let at = state.countdownAt {
                VStack(alignment: .leading, spacing: 2) {
                    Countdown(at: at).font(.system(size: 40, design: .serif)).foregroundStyle(Theme.onInverse)
                    Text("to \(state.countdownLabel ?? "go") · \(at.formatted(date: .omitted, time: .shortened))").font(.caption).foregroundStyle(Theme.onInverse.opacity(0.7))
                }
            } else {
                Text(state.headline).font(.system(size: 30, design: .serif)).foregroundStyle(Theme.onInverse).lineLimit(2).minimumScaleFactor(0.7)
            }
            if state.matchup == nil {
                ForEach(state.lines.prefix(2), id: \.self) { Text($0).font(.footnote).foregroundStyle(Theme.onInverse.opacity(0.85)).lineLimit(1) }
            }
            Footer(state: state, stale: stale)
        }
        .padding(16)
    }
}

private struct MatchupBody: View {
    var m: CommishActivityAttributes.Matchup

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .lastTextBaseline) {
                SideScore(side: m.me, alignment: .leading, mine: true, big: true)
                Spacer()
                SideScore(side: m.opp, alignment: .trailing, mine: false, big: true)
            }
            Meter(p: m.winP)
            HStack {
                Text(m.final ? (m.me.score > m.opp.score ? "won" : m.me.score < m.opp.score ? "lost" : "tied") : "\(Format.pct(m.winP)) to win")
                    .font(.caption.weight(.semibold)).foregroundStyle(Theme.onInverse)
                Spacer()
                if let now = m.nowPlaying.first { Text(now).font(.caption).foregroundStyle(Theme.onInverse.opacity(0.75)).lineLimit(1) }
                else if let last = m.lastPlay { Text(last).font(.caption).foregroundStyle(Theme.greenOnInverse) }
            }
        }
    }
}

private struct Footer: View {
    var state: CommishActivityAttributes.ContentState
    var stale: Bool

    var body: some View {
        if stale || state.background {
            Text(stale ? "not updated since \(state.updatedAt.formatted(date: .omitted, time: .shortened)) · open the app" : "updated \(state.updatedAt.formatted(date: .omitted, time: .shortened)) · win % estimated")
                .font(.caption2).foregroundStyle(Theme.onInverse.opacity(0.5))
        }
    }
}

// MARK: - pieces

private struct ExpandedBottom: View {
    var state: CommishActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let m = state.matchup {
                Meter(p: m.winP)
                HStack {
                    Text("\(Format.pct(m.winP)) to win").font(.caption.weight(.semibold))
                    Spacer()
                    Text("proj \(Format.pts(m.me.projected))–\(Format.pts(m.opp.projected))").font(.caption2).monospacedDigit().foregroundStyle(Theme.onInverse.opacity(0.65))
                }
                ForEach(m.nowPlaying.prefix(2), id: \.self) { Text($0).font(.caption2).foregroundStyle(Theme.onInverse.opacity(0.8)).lineLimit(1) }
            } else {
                if !state.isCountdown { Text(state.headline).font(.system(.title3, design: .serif)).lineLimit(1) }
                ForEach(state.lines.prefix(2), id: \.self) { Text($0).font(.caption).foregroundStyle(Theme.onInverse.opacity(0.85)).lineLimit(1) }
            }
            Link(destination: state.url) {
                Text("\(state.action) →").font(.caption.weight(.semibold)).foregroundStyle(Theme.goldOnInverse)
            }
        }
        .foregroundStyle(Theme.onInverse)
    }
}

private struct SideScore: View {
    var side: CommishActivityAttributes.Side
    var alignment: HorizontalAlignment
    var mine: Bool
    var big = false

    var body: some View {
        VStack(alignment: alignment, spacing: 0) {
            Text(side.name.lowercased()).font(.caption.weight(mine ? .semibold : .regular)).foregroundStyle(Theme.onInverse.opacity(mine ? 1 : 0.8)).lineLimit(1)
            Text(Format.pts(side.score))
                .font(.system(size: big ? 36 : 26, design: .serif)).monospacedDigit()
                .foregroundStyle(Theme.onInverse)
                .contentTransition(.numericText(value: side.score))
        }
    }
}

private struct Meter: View {
    var p: Double
    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.redOnInverse.opacity(0.85))
                Capsule().fill(Theme.greenOnInverse).frame(width: max(6, g.size.width * p))
            }
        }
        .frame(height: 6)
    }
}

private struct Countdown: View {
    var at: Date
    var body: some View {
        Text(timerInterval: Date.now...max(at, .now), countsDown: true, showsHours: true)
            .monospacedDigit()
            .multilineTextAlignment(.trailing)
    }
}

private struct KindIcon: View {
    var kind: String
    var body: some View {
        Image(systemName: {
            switch kind {
            case "matchup": return "sportscourt.fill"
            case "kickoff": return "clock.fill"
            case "waivers": return "arrow.triangle.2.circlepath"
            case "draft": return "list.number"
            case "recap": return "flag.checkered"
            default: return "bell.fill"
            }
        }())
    }
}

// MARK: - previews

#Preview("matchup", as: .content, using: CommishActivityAttributes(teamName: "icemen", leagueName: "fantasy")) {
    CommishLiveActivity()
} contentStates: {
    CommishActivityAttributes.ContentState(
        kind: "matchup", title: "live matchup", compact: "icemen 135.8 · 118.1 · 56%", urgency: "calm", live: true, to: "/gameday", action: "open game day",
        countdownLabel: nil, countdownAt: nil,
        matchup: .init(week: 7, me: .init(name: "icemen", score: 135.8, projected: 153.4), opp: .init(name: "Sussybakamogus", score: 118.1, projected: 151.1),
                       winP: 0.56, progress: 0.8, final: false, nowPlaying: ["flowers · on offense · 3rd & 8 at cin 18 · q3 0:10"], lastPlay: "+6.4 · flowers"),
        headline: "icemen 135.8 · 118.1 · 56%", lines: [], updatedAt: .now)
    CommishActivityAttributes.ContentState(
        kind: "kickoff", title: "kickoff", compact: "kickoff 1:42:10", urgency: "calm", live: false, to: "/team", action: "check lineup",
        countdownLabel: "kickoff", countdownAt: .now.addingTimeInterval(6130), matchup: nil,
        headline: "kickoff 1:42:10", lines: ["first up: nyj at buf", "caleb williams: questionable"], updatedAt: .now)
}
