import SwiftUI

/// The playoff picture on a phone: the standings with each team's playoff and title odds from the engine's 20,000 simulated seasons,
/// clinch marks, and the playoff line. Tools that need room (the playoff machine, brackets, seeding odds) open the site's page.
struct LeagueView: View {
    @Environment(AppModel.self) private var model
    @State private var sort: Sort = .standings

    enum Sort: String, CaseIterable { case standings, odds }

    var body: some View {
        let rows = model.snapshot?.standings ?? []
        let ordered = sort == .standings ? rows : rows.sorted { $0.playoff > $1.playoff || ($0.playoff == $1.playoff && $0.place < $1.place) }
        List {
            Section {
                Picker("sort", selection: $sort) {
                    ForEach(Sort.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }
            Section {
                ForEach(ordered) { StandingRow(row: $0, rank: sort == .standings ? $0.place : (ordered.firstIndex(of: $0) ?? 0) + 1) }
            } footer: {
                Text("odds from 20,000 simulated seasons · x clinched a playoff spot · e eliminated").font(.caption)
            }
            .listRowBackground(Theme.sheet)
            Section {
                Button { model.open("/race") } label: { Label("playoff machine and brackets", systemImage: "trophy") }
                Button { model.open("/league") } label: { Label("around the league", systemImage: "list.number") }
            }
            .tint(Theme.green)
            .listRowBackground(Theme.sheet)
        }
        .scrollContentBackground(.hidden)
        .background(Theme.paper)
        .animation(.snappy, value: sort)
        .refreshable { await model.refresh() }
        .navigationTitle("playoff picture")
    }
}

private struct StandingRow: View {
    var row: Standing
    var rank: Int

    var body: some View {
        HStack(spacing: 10) {
            Text("\(rank)").font(.system(.subheadline, design: .serif)).monospacedDigit().foregroundStyle(Theme.ink3).frame(width: 22, alignment: .trailing)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(row.team.lowercased()).font(.body.weight(row.isMe ? .bold : .regular)).lineLimit(1)
                    if !row.mark.isEmpty { Text(row.mark).font(.caption.weight(.bold)).foregroundStyle(row.elim ? Theme.red : Theme.green) }
                }
                Text("\(row.record) · \(Format.pts(row.pf)) pf").font(.caption).monospacedDigit().foregroundStyle(Theme.ink3)
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 4) {
                Text(Format.pct(row.playoff)).font(.body.weight(.semibold)).monospacedDigit().foregroundStyle(color)
                Capsule().fill(Theme.rule.opacity(0.6)).frame(width: 64, height: 4)
                    .overlay(alignment: .leading) { Capsule().fill(color).frame(width: 64 * row.playoff, height: 4) }
            }
        }
        .padding(.vertical, 2)
        .listRowBackground(row.isMe ? Theme.goldSoft : Theme.sheet)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(rank). \(row.team)\(row.isMe ? ", your team" : ""), \(row.record), \(Format.pct(row.playoff)) to make the playoffs, \(Format.pct(row.title)) to win the title")
    }

    private var color: Color { row.clinch ? Theme.green : row.elim ? Theme.red : row.playoff >= 0.5 ? Theme.green : row.playoff >= 0.2 ? Theme.gold : Theme.red }
}
