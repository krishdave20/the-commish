import SwiftUI
import UIKit

/// The commish's palette (src/styles/tokens.css: parchment, ink, green, warm red, gold), with the dark appearance's values, for the app and the
/// widget extension. Display type is the system serif (New York), standing in for the site's Instrument Serif; body text is San Francisco, as on
/// the site. Everything the app writes is lowercase, like the site.
enum Theme {
    static let paper = dynamic(light: 0xF4F1EB, dark: 0x171512)
    static let sheet = dynamic(light: 0xFAF8F3, dark: 0x2A2622)
    static let ink = dynamic(light: 0x1F1D19, dark: 0xECE6D9)
    static let ink2 = dynamic(light: 0x5D5850, dark: 0xB7B0A1)
    static let ink3 = dynamic(light: 0x6F6A60, dark: 0x9A9487)
    static let rule = dynamic(light: 0xDCD5C6, dark: 0x3D3830)
    static let green = dynamic(light: 0x2D5A27, dark: 0x82B878)
    static let greenSoft = dynamic(light: 0xDFE7D9, dark: 0x233220)
    static let red = dynamic(light: 0x8B3A1A, dark: 0xE8906F)
    static let redSoft = dynamic(light: 0xF1E0D6, dark: 0x3B2318)
    static let gold = dynamic(light: 0xC4922A, dark: 0xD9A63E)
    static let goldSoft = dynamic(light: 0xF3E8CF, dark: 0x372C16)
    /// the dark "game plan" and live activity surface
    static let inverse = dynamic(light: 0x1F1D19, dark: 0x35312B)
    static let onInverse = Color(hex: 0xF4F1EB)
    static let greenOnInverse = Color(hex: 0x9CC791)
    static let goldOnInverse = Color(hex: 0xE0B45C)
    static let redOnInverse = Color(hex: 0xEB9B7B)

    static func display(_ size: CGFloat, relativeTo style: Font.TextStyle = .title) -> Font {
        .system(size: size, weight: .regular, design: .serif).leading(.tight)
    }

    private static func dynamic(light: UInt32, dark: UInt32) -> Color {
        Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light) })
    }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }
}

extension Color {
    init(hex: UInt32) { self.init(uiColor: UIColor(hex: hex)) }

    /// "#c83803" → the colour; nil for anything else.
    init?(css: String) {
        let s = css.trimmingCharacters(in: .whitespaces)
        guard s.hasPrefix("#"), s.count == 7, let v = UInt32(s.dropFirst(), radix: 16) else { return nil }
        self.init(hex: v)
    }
}

enum Format {
    /// "135.8": one decimal, like the site.
    static func pts(_ x: Double) -> String { String(format: "%.1f", x) }
    /// "56%" from 0.5636; "<1%" and ">99%" at the edges, so a live chance never reads as certain before it is.
    static func pct(_ p: Double) -> String {
        let v = p * 100
        if v > 0 && v < 1 { return "<1%" }
        if v > 99 && v < 100 { return ">99%" }
        return "\(Int(v.rounded()))%"
    }
}

/// The live win chance (src/engine/live/winprob.ts): a normal model of the score difference, each team's SD shrinking with the share of
/// starter-minutes left. `sd` is the league's weekly team SD.
enum WinModel {
    static func winProb(_ a: Double, _ b: Double, sd: Double) -> Double {
        guard sd > 0 else { return a > b ? 1 : a < b ? 0 : 0.5 }
        let z = (a - b) / (2.0.squareRoot() * sd)
        return 0.5 * (1 + erf(z / 2.0.squareRoot()))
    }

    static func live(projA: Double, projB: Double, sd: Double, remA: Double, remB: Double) -> Double {
        if remA + remB <= 0 { return projA > projB ? 1 : projA < projB ? 0 : 0.5 }
        return winProb(projA, projB, sd: sd * max(0, (remA + remB) / 2).squareRoot())
    }
}
