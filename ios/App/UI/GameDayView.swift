import SwiftUI

/// Game day: my matchup as a broadcast scoreboard (scores, projected finals, the win meter against the pre-game chance), "now playing",
/// the starters head to head slot by slot, then every other matchup in the league. Refreshes with the engine's live poller; pull to poll now.
struct GameDayView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let snap = model.snapshot
        ScrollView {
            VStack(spacing: 16) {
                if let m = snap?.matchup {
                    Scoreboard(m: m, activity: snap?.activity, live: snap?.live ?? false, flash: model.bigMoment)
                    HeadToHead(m: m)
                    if let rest = snap?.scoreboard, !rest.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            SectionLabel(text: "around the league")
                            ForEach(rest) { MatchupRow(m: $0) }
                        }
                    }
                    Button("open the full game day") { model.open("/gameday?week=\(snap?.team?.week ?? 0)") }
                        .font(.footnote.weight(.semibold)).tint(Theme.green).padding(.top, 4)
                } else {
                    EmptyNote(title: "no matchup this week", detail: "game day fills in once your league's week is set.", symbol: "sportscourt")
                        .padding(.top, 80)
                }
                Stamp(date: snap?.asOfDate, fromDisk: model.fromDisk)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(Theme.paper)
        .refreshable { await model.refresh() }
        .navigationTitle(snap?.team.map { "week \($0.week)" } ?? "game day")
    }
}

/// The dark scoreboard card.
private struct Scoreboard: View {
    var m: LiveMatchup
    var activity: NativeActivity?
    var live: Bool
    var flash: String?

    var body: some View {
        Card(dark: true) {
            HStack {
                if live && !m.final { LiveDot(); Text("live").font(.caption.weight(.semibold)).foregroundStyle(Theme.redOnInverse) }
                if m.final { Text("final").font(.caption.weight(.semibold)).foregroundStyle(Theme.goldOnInverse) }
                Spacer()
                if let flash {
                    Text(flash).font(.caption.weight(.bold)).foregroundStyle(Theme.paper)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Theme.greenOnInverse, in: Capsule())
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .animation(.spring(duration: 0.4, bounce: 0.4), value: flash)
            HStack(alignment: .top) {
                side(m.a, alignment: .leading)
                Spacer()
                side(m.b, alignment: .trailing)
            }
            WinMeter(p: m.winA, pre: m.final ? nil : m.preWinA, height: 10, onDark: true)
            HStack {
                Text("\(Format.pct(m.winA)) to win").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.onInverse)
                Spacer()
                if !m.final { Text("pre-game \(Format.pct(m.preWinA))").font(.caption).foregroundStyle(Theme.onInverse.opacity(0.6)) }
            }
            if let now = activity?.matchup?.nowPlaying, !now.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("now playing").font(.caption.weight(.semibold)).foregroundStyle(Theme.goldOnInverse)
                    ForEach(now, id: \.self) { Text($0).font(.footnote).foregroundStyle(Theme.onInverse.opacity(0.85)).lineLimit(1) }
                }
            }
            if let last = activity?.matchup?.lastPlay {
                Text("last score: \(last)").font(.footnote).foregroundStyle(Theme.greenOnInverse)
            }
        }
        .sensoryFeedback(.increase, trigger: m.a.score)
    }

    private func side(_ t: TeamLive, alignment: HorizontalAlignment) -> some View {
        VStack(alignment: alignment, spacing: 2) {
            Text(t.name.lowercased()).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.onInverse).lineLimit(1)
            Text(Format.pts(t.score))
                .font(Theme.display(44)).monospacedDigit().foregroundStyle(Theme.onInverse)
                .contentTransition(.numericText(value: t.score))
                .animation(.snappy, value: t.score)
            Text("proj \(Format.pts(t.projected))").font(.caption).monospacedDigit().foregroundStyle(Theme.onInverse.opacity(0.6))
        }
        .accessibilityElement(children: .combine)
    }
}

/// Starters side by side, slot by slot: who is scoring, who is on now, who is still to play.
private struct HeadToHead: View {
    var m: LiveMatchup

    var body: some View {
        Card {
            SectionLabel(text: "head to head", trailing: "\(m.a.starters.filter { $0.state == .pre }.count) left to play")
            ForEach(Array(zip(m.a.starters.indices, m.a.starters)), id: \.1.id) { i, mine in
                let theirs = i < m.b.starters.count ? m.b.starters[i] : nil
                HStack(spacing: 8) {
                    PlayerCell(p: mine, alignment: .leading)
                    Text(mine.slot.lowercased()).font(.caption2.weight(.semibold)).foregroundStyle(Theme.ink3).frame(width: 34)
                    if let theirs { PlayerCell(p: theirs, alignment: .trailing) } else { Spacer() }
                }
                if i < m.a.starters.count - 1 { Divider().overlay(Theme.rule.opacity(0.6)) }
            }
            HStack {
                Text(Format.pts(m.a.score)).font(.headline).monospacedDigit()
                Spacer()
                Text("total").font(.caption).foregroundStyle(Theme.ink3)
                Spacer()
                Text(Format.pts(m.b.score)).font(.headline).monospacedDigit()
            }
        }
    }
}

private struct PlayerCell: View {
    var p: Starter
    var alignment: HorizontalAlignment

    var body: some View {
        HStack(spacing: 8) {
            if alignment == .leading {
                Headshot(player: p, size: 32)
                info
                Spacer(minLength: 0)
                points
            } else {
                points
                Spacer(minLength: 0)
                info
                Headshot(player: p, size: 32)
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(p.name), \(Format.pts(p.points)) points, \(status)")
    }

    private var info: some View {
        VStack(alignment: alignment, spacing: 1) {
            Text(Names.short(p.name, pos: p.pos)).font(.subheadline.weight(.medium)).lineLimit(1)
            HStack(spacing: 4) {
                if p.state == .live { Circle().fill(Color.red).frame(width: 5, height: 5) }
                Text(status).font(.caption2).foregroundStyle(Theme.ink3).lineLimit(1)
            }
        }
    }

    private var points: some View {
        Text(Format.pts(p.points))
            .font(.subheadline.weight(p.state == .pre ? .regular : .semibold)).monospacedDigit()
            .foregroundStyle(p.state == .pre ? Theme.ink3 : Theme.ink)
            .contentTransition(.numericText(value: p.points))
    }

    private var status: String {
        switch p.state {
        case .pre: return "proj \(Format.pts(p.projected))"
        case .live: return "live · proj \(Format.pts(p.projected))"
        case .final: return "final"
        case .idle: return "bye"
        }
    }
}

/// One of the league's other matchups, a line each side.
private struct MatchupRow: View {
    var m: LiveMatchup

    var body: some View {
        Card {
            VStack(spacing: 8) {
                line(m.a, p: m.winA)
                line(m.b, p: 1 - m.winA)
                WinMeter(p: m.winA, height: 4)
                if !m.tags.isEmpty {
                    Text(m.tags.joined(separator: " · ")).font(.caption.weight(.semibold)).foregroundStyle(Theme.gold).frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func line(_ t: TeamLive, p: Double) -> some View {
        HStack {
            Text(t.name.lowercased()).font(.subheadline.weight(p >= 0.5 ? .semibold : .regular)).lineLimit(1)
            Spacer()
            Text(Format.pct(p)).font(.caption).monospacedDigit().foregroundStyle(Theme.ink3)
            Text(Format.pts(t.score)).font(.body.weight(.semibold)).monospacedDigit().frame(minWidth: 52, alignment: .trailing)
        }
    }
}
