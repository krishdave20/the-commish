import SwiftUI

/// The locker room on a phone: this week's lineup as the engine sets it, starters then bench, each with expected points and the
/// floor-to-ceiling range drawn as a bar; injuries flagged; a banner when the lineup set leaves points on the bench. A player opens his
/// scouting report; "edit in the lab" opens the site's locker room for pins, benches and what-ifs.
struct LineupView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let lineup = model.snapshot?.lineup
        List {
            if let lineup {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(Format.pts(lineup.total)).font(Theme.display(40)).monospacedDigit()
                            Text("expected").font(.subheadline).foregroundStyle(Theme.ink2)
                        }
                        Text("floor \(Format.pts(lineup.floor)) · ceiling \(Format.pts(lineup.ceiling))").font(.footnote).foregroundStyle(Theme.ink2)
                        if lineup.best > lineup.total + 0.05 {
                            Label("the best lineup scores \(Format.pts(lineup.best - lineup.total)) more", systemImage: "exclamationmark.triangle.fill")
                                .font(.footnote.weight(.semibold)).foregroundStyle(Theme.red)
                        } else {
                            Label("best possible lineup", systemImage: "checkmark.circle.fill").font(.footnote).foregroundStyle(Theme.green)
                        }
                    }
                    .listRowBackground(Theme.sheet)
                }
                let maxHi = max(1, lineup.rows.map(\.ceiling).max() ?? 1)
                Section("starters") {
                    ForEach(lineup.rows.filter(\.starting)) { row in LineupRowView(row: row, maxHi: maxHi) }
                }
                .listRowBackground(Theme.sheet)
                let bench = lineup.rows.filter { !$0.starting }
                if !bench.isEmpty {
                    Section("bench") {
                        ForEach(bench) { row in LineupRowView(row: row, maxHi: maxHi) }
                    }
                    .listRowBackground(Theme.sheet)
                }
                Section {
                    Button { model.open("/team") } label: { Label("edit in the lab", systemImage: "slider.horizontal.3") }
                        .tint(Theme.green)
                } footer: {
                    Text("pin a player to always start him, bench one to never start him, or try a what-if.")
                }
                .listRowBackground(Theme.sheet)
            } else {
                EmptyNote(title: "no lineup yet", detail: "the lineup shows once the model has your roster.", symbol: "person.3")
                    .listRowBackground(Color.clear)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.paper)
        .refreshable { await model.refresh() }
        .navigationTitle(lineup.map { "week \($0.week) lineup" } ?? "lineup")
    }
}

private struct LineupRowView: View {
    @Environment(AppModel.self) private var model
    var row: LineupRow
    var maxHi: Double

    var body: some View {
        Button { model.open("/players/\(row.pid)") } label: {
            HStack(spacing: 12) {
                Text(row.slot.lowercased()).font(.caption.weight(.semibold).monospaced()).foregroundStyle(Theme.ink3).frame(width: 38, alignment: .leading)
                Headshot(player: row, size: 38)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(row.name.lowercased()).font(.body.weight(.medium)).foregroundStyle(row.starting ? Theme.ink : Theme.ink2).lineLimit(1)
                        if !row.injury.isEmpty { InjuryTag(text: row.injury) }
                    }
                    HStack(spacing: 6) {
                        PosChip(pos: row.pos)
                        Text((row.team ?? "fa").lowercased()).font(.caption).foregroundStyle(Theme.ink3)
                        if !row.played { RangeBar(lo: row.floor, mu: row.exp, hi: row.ceiling, maxHi: maxHi).frame(width: 70) }
                    }
                }
                Spacer(minLength: 4)
                VStack(alignment: .trailing, spacing: 2) {
                    Text(Format.pts(row.points ?? row.exp)).font(.body.weight(.semibold)).monospacedDigit().foregroundStyle(row.starting ? Theme.ink : Theme.ink3)
                    Text(row.played ? "scored" : "exp").font(.caption2).foregroundStyle(Theme.ink3)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(row.slot), \(row.name), \(row.pos)\(row.injury.isEmpty ? "" : ", \(row.injury)"), \(row.played ? "scored" : "expected") \(Format.pts(row.points ?? row.exp))")
        .accessibilityHint("opens his scouting report")
    }
}

private struct InjuryTag: View {
    var text: String
    var body: some View {
        Text(abbrev).font(.caption2.weight(.bold)).foregroundStyle(Theme.red)
            .padding(.horizontal, 4).padding(.vertical, 1)
            .background(Theme.redSoft, in: RoundedRectangle(cornerRadius: 3))
    }
    private var abbrev: String {
        switch text {
        case "questionable": return "q"
        case "doubtful": return "d"
        case "out": return "out"
        case "ir": return "ir"
        default: return text
        }
    }
}

/// Floor to ceiling, with a tick at the expected points.
private struct RangeBar: View {
    var lo: Double, mu: Double, hi: Double, maxHi: Double
    var body: some View {
        GeometryReader { g in
            let w = g.size.width
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.rule.opacity(0.6)).frame(height: 3)
                Capsule().fill(Theme.green.opacity(0.45)).frame(width: max(2, w * (hi - lo) / maxHi), height: 5).offset(x: w * lo / maxHi)
                Rectangle().fill(Theme.ink).frame(width: 2, height: 8).offset(x: w * mu / maxHi - 1)
            }
            .frame(maxHeight: .infinity)
        }
        .frame(height: 10)
        .accessibilityHidden(true)
    }
}
