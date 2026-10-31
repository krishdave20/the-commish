import SwiftUI

/// A headshot from Sleeper's CDN on a circle in the player's team colours, as on the site (docs/WEB_APP_NOTES.md "Team colours on headshots").
/// A team defense, or any image that fails or is offline, gets a monogram. Decorative next to the name, so hidden from VoiceOver.
struct Headshot: View {
    var player: PlayerLike
    var size: CGFloat = 36

    private var primary: Color { player.colors?.first.flatMap(Color.init(css:)) ?? Theme.rule }
    private var ring: Color { player.colors?.dropFirst().first.flatMap(Color.init(css:)) ?? Theme.ink3 }
    private var monogram: String { player.pos == "DEF" ? (player.team ?? player.pid) : Names.initials(player.name) }

    var body: some View {
        ZStack {
            Circle().fill(primary)
            if player.pos == "DEF" {
                letters
            } else {
                AsyncImage(url: URL(string: "https://sleepercdn.com/content/nfl/players/thumb/\(player.pid).jpg"), transaction: Transaction(animation: .easeOut(duration: 0.2))) { phase in
                    switch phase {
                    case .success(let image): image.resizable().scaledToFill().offset(y: size * 0.06)
                    case .failure: letters
                    default: Color.clear
                    }
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(ring, lineWidth: max(1, size / 22)))
        .accessibilityHidden(true)
    }

    private var letters: some View {
        Text(monogram)
            .font(.system(size: size * 0.36, weight: .semibold, design: .rounded))
            .foregroundStyle(.white)
            .minimumScaleFactor(0.5)
    }
}

/// The field-style win meter: my share in green from the left, theirs in red, a tick at the pre-game chance.
struct WinMeter: View {
    var p: Double
    var pre: Double?
    var height: CGFloat = 8
    var onDark = false

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(onDark ? Theme.redOnInverse.opacity(0.85) : Theme.red.opacity(0.75))
                Capsule().fill(onDark ? Theme.greenOnInverse : Theme.green).frame(width: max(height, geo.size.width * p))
                if let pre {
                    Rectangle().fill(onDark ? Theme.onInverse : Theme.ink).frame(width: 2, height: height + 6).offset(x: geo.size.width * pre - 1)
                }
            }
        }
        .frame(height: height)
        .animation(.spring(duration: 0.6, bounce: 0.15), value: p)
        .accessibilityElement()
        .accessibilityLabel("win chance")
        .accessibilityValue(Format.pct(p))
    }
}

/// A card on the parchment: the sheet surface, 14 pt corners.
struct Card<Content: View>: View {
    var dark = false
    @ViewBuilder var content: Content

    var body: some View {
        let card = VStack(alignment: .leading, spacing: 12) { content }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(dark ? Theme.inverse : Theme.sheet, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(dark ? .clear : Theme.rule.opacity(0.7), lineWidth: 0.5))
        // the dark card reads as dark in either appearance (its text uses the dark palette)
        if dark { card.environment(\.colorScheme, .dark) } else { card }
    }
}

/// A small caps-free section label, the site's micro-label.
struct SectionLabel: View {
    var text: String
    var trailing: String? = nil
    var body: some View {
        HStack {
            Text(text).font(.footnote.weight(.semibold)).foregroundStyle(Theme.ink2)
            Spacer()
            if let trailing { Text(trailing).font(.footnote).foregroundStyle(Theme.ink3) }
        }
    }
}

/// The pulsing red dot of "live".
struct LiveDot: View {
    @State private var on = false
    @Environment(\.accessibilityReduceMotion) private var reduce
    var body: some View {
        Circle().fill(Color.red).frame(width: 7, height: 7)
            .opacity(on || reduce ? 1 : 0.35)
            .onAppear { withAnimation(.easeInOut(duration: 0.9).repeatForever()) { on = true } }
            .accessibilityHidden(true)
    }
}

/// "updated 2 min ago" under a screen, from the snapshot's stamp.
struct Stamp: View {
    var date: Date?
    var fromDisk = false
    var body: some View {
        if let date {
            Text(fromDisk ? "saved data · \(date.formatted(.relative(presentation: .named)))" : "data as of \(date.formatted(date: .omitted, time: .shortened))")
                .font(.caption).foregroundStyle(Theme.ink3)
                .frame(maxWidth: .infinity)
                .padding(.top, 8)
        }
    }
}

/// A position chip ("rb") in the site's soft position colours.
struct PosChip: View {
    var pos: String
    var body: some View {
        Text(pos.lowercased())
            .font(.caption2.weight(.semibold).monospaced())
            .foregroundStyle(Theme.ink2)
            .padding(.horizontal, 5).padding(.vertical, 2)
            .background(Theme.rule.opacity(0.5), in: RoundedRectangle(cornerRadius: 4))
    }
}

/// The message for a state with nothing to draw yet.
struct EmptyNote: View {
    var title: String
    var detail: String?
    var symbol = "football"
    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: symbol)
        } description: {
            if let detail { Text(detail) }
        }
        .foregroundStyle(Theme.ink2)
    }
}
