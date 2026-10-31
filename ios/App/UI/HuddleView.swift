import SwiftUI

/// The huddle: where you stand in a sentence, the live score when there is one, your game plan as ranked actions, and your odds.
/// The site's huddle, rebuilt for a phone held in one hand: big type up top, everything tappable, pull to refresh.
struct HuddleView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let snap = model.snapshot
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let team = snap?.team {
                    Text("\(team.league) · week \(team.week) · \(team.record)\(team.place.map { " · \(Ordinal.of($0)) of \(team.teams)" } ?? "")")
                        .font(.subheadline).foregroundStyle(Theme.ink2)
                }
                if let hero = snap?.hero { HeroCard(hero: hero, matchup: snap?.matchup) }
                if let a = snap?.activity, a.countdown != nil { CountdownCard(activity: a) }
                if let plan = snap?.plan { GamePlanCard(items: plan) }
                if let me = snap?.me { OddsCard(me: me, teams: snap?.standings.count ?? 0) }
                Stamp(date: snap?.asOfDate, fromDisk: model.fromDisk)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(Theme.paper)
        .refreshable { await model.refresh() }
        .navigationTitle(snap?.team?.name ?? "huddle")
    }
}

/// The sentence, in large serif type, with the odds in plain words; with a live matchup, the two scores and the meter under it.
private struct HeroCard: View {
    @Environment(AppModel.self) private var model
    var hero: Snapshot.Hero
    var matchup: LiveMatchup?

    var body: some View {
        Button { model.open("/gameday") } label: {
            Card {
                Text(hero.sentence)
                    .font(Theme.display(30))
                    .foregroundStyle(Theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let m = matchup, hero.kind == "live" || hero.kind == "pre" || hero.kind == "final" {
                    HStack(alignment: .firstTextBaseline) {
                        Text(Format.pts(m.a.score)).font(Theme.display(26)).monospacedDigit()
                        Spacer()
                        if !m.final { LiveDot() }
                        Spacer()
                        Text(Format.pts(m.b.score)).font(Theme.display(26)).monospacedDigit().foregroundStyle(Theme.ink2)
                    }
                    WinMeter(p: m.winA, pre: m.final ? nil : m.preWinA)
                }
                if let odds = hero.odds { Text(odds).font(.subheadline).foregroundStyle(Theme.ink2) }
            }
        }
        .buttonStyle(PressableStyle())
        .accessibilityHint("opens your live matchup")
    }
}

/// The next countdown (kickoff, waivers, the draft), ticking on its own.
private struct CountdownCard: View {
    @Environment(AppModel.self) private var model
    var activity: NativeActivity

    var body: some View {
        if let c = activity.countdown {
            let at = Date(timeIntervalSince1970: c.at / 1000)
            Button { model.open(activity.to) } label: {
                Card(dark: true) {
                    HStack(alignment: .center) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(activity.title).font(.footnote.weight(.semibold)).foregroundStyle(Theme.goldOnInverse)
                            Text(timerInterval: Date.now...max(at, .now), countsDown: true)
                                .font(Theme.display(34)).monospacedDigit().foregroundStyle(Theme.onInverse)
                            Text("to \(c.label) · \(at.formatted(date: .omitted, time: .shortened))").font(.caption).foregroundStyle(Theme.onInverse.opacity(0.7))
                        }
                        Spacer()
                        Image(systemName: "chevron.right").foregroundStyle(Theme.onInverse.opacity(0.5))
                    }
                    ForEach(activity.lines, id: \.self) { Text($0).font(.footnote).foregroundStyle(Theme.onInverse.opacity(0.85)) }
                }
            }
            .buttonStyle(PressableStyle())
        }
    }
}

/// The site's dark "game plan": the moments that matter right now, numbered, each opening its page.
private struct GamePlanCard: View {
    @Environment(AppModel.self) private var model
    var items: [Snapshot.PlanItem]
    @State private var all = false

    var body: some View {
        Card(dark: true) {
            HStack {
                Text("your game plan").font(Theme.display(22)).foregroundStyle(Theme.onInverse)
                Spacer()
            }
            if items.isEmpty {
                Text("nothing needs you right now. the plan fills in as the week moves.").font(.subheadline).foregroundStyle(Theme.onInverse.opacity(0.75))
            }
            ForEach(Array((all ? items : Array(items.prefix(3))).enumerated()), id: \.element.id) { i, item in
                Button { model.open(item.to) } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Text("\(i + 1)").font(Theme.display(22)).foregroundStyle(Theme.goldOnInverse).frame(width: 18)
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                if item.live { LiveDot() }
                                Text(item.title).font(.body.weight(.semibold)).foregroundStyle(Theme.onInverse).multilineTextAlignment(.leading)
                            }
                            Text(item.detail).font(.footnote).foregroundStyle(Theme.onInverse.opacity(0.7)).multilineTextAlignment(.leading).lineLimit(3)
                        }
                        Spacer(minLength: 4)
                        Image(systemName: "chevron.right").font(.footnote).foregroundStyle(Theme.onInverse.opacity(0.4)).padding(.top, 4)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint(item.action)
                if i < (all ? items.count : min(3, items.count)) - 1 { Divider().overlay(Theme.onInverse.opacity(0.12)) }
            }
            if items.count > 3 {
                Button(all ? "show less" : "see the whole plan (\(items.count))") { withAnimation(.snappy) { all.toggle() } }
                    .font(.footnote.weight(.semibold)).foregroundStyle(Theme.goldOnInverse)
            }
        }
    }
}

/// Playoff and title odds as rings, with the place and points for.
private struct OddsCard: View {
    @Environment(AppModel.self) private var model
    var me: Standing
    var teams: Int

    var body: some View {
        Button { model.open("/race") } label: {
            Card {
                SectionLabel(text: "the race", trailing: "\(Ordinal.of(me.place)) of \(teams)")
                HStack(spacing: 20) {
                    Ring(p: me.playoff, label: "playoffs", tint: Theme.green)
                    Ring(p: me.title, label: "title", tint: Theme.gold)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(me.record).font(Theme.display(28)).monospacedDigit()
                        Text("\(Format.pts(me.pf)) points for").font(.footnote).foregroundStyle(Theme.ink2)
                        if me.clinch { Label("clinched", systemImage: "checkmark.seal.fill").font(.footnote).foregroundStyle(Theme.green) }
                        if me.elim { Text("eliminated").font(.footnote).foregroundStyle(Theme.red) }
                    }
                    Spacer(minLength: 0)
                }
            }
        }
        .buttonStyle(PressableStyle())
        .accessibilityHint("opens the playoff picture")
    }
}

struct Ring: View {
    var p: Double
    var label: String
    var tint: Color

    var body: some View {
        VStack(spacing: 6) {
            Gauge(value: min(1, max(0, p))) {
                EmptyView()
            } currentValueLabel: {
                Text(Format.pct(p)).font(.system(.subheadline, design: .serif)).monospacedDigit()
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .tint(tint)
            .scaleEffect(1.1)
            Text(label).font(.caption).foregroundStyle(Theme.ink2)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label) chance")
        .accessibilityValue(Format.pct(p))
    }
}

/// A card button that sinks a little under the finger.
struct PressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.spring(duration: 0.25, bounce: 0.3), value: configuration.isPressed)
    }
}

enum Ordinal {
    static func of(_ n: Int) -> String {
        let tens = n % 100
        let suffix = (11...13).contains(tens) ? "th" : [1: "st", 2: "nd", 3: "rd"][n % 10] ?? "th"
        return "\(n)\(suffix)"
    }
}
