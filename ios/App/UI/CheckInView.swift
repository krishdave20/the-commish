import SwiftUI

/// Check in, natively: a Sleeper username, then the leagues to follow. No password (Sleeper offers none to other apps, and the commish only
/// reads public league data). The lookup and the saving run in the engine page (`commishFeed.lookup` / `link`), the same code as the site.
struct CheckInView: View {
    @Environment(AppModel.self) private var model
    @State private var username = ""
    @State private var step: Step = .idle
    @State private var picked: Set<String> = []
    @FocusState private var focused: Bool

    enum Step: Equatable {
        case idle, busy(String), error(String)
        case pick(name: String, leagues: [Lookup.League])
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 8) {
                        Image(systemName: "football.fill").font(.system(size: 34)).foregroundStyle(Theme.green)
                        Text("check in").font(Theme.display(44))
                        Text("enter a sleeper username to follow your leagues. there is no password: the commish only reads public league data.")
                            .font(.subheadline).foregroundStyle(Theme.ink2)
                    }
                    .padding(.top, 24)

                    if case .pick(let name, let leagues) = step {
                        picker(name: name, leagues: leagues)
                    } else {
                        form
                    }
                }
                .padding(.horizontal, 20)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Theme.paper)
            .toolbar {
                if case .pick = step {
                    ToolbarItem(placement: .topBarLeading) { Button("back") { step = .idle } }
                }
            }
        }
        .onAppear { focused = true }
        .sensoryFeedback(.error, trigger: step) { _, new in if case .error = new { return true } else { return false } }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 14) {
            TextField("sleeper username", text: $username)
                .textContentType(.username)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.go)
                .focused($focused)
                .onSubmit(find)
                .padding(14)
                .background(Theme.sheet, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.rule))
            Button(action: find) {
                HStack {
                    if case .busy = step { ProgressView().tint(.white) }
                    Text(busyText ?? "find my leagues").fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity, minHeight: 50)
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.green)
            .disabled(username.trimmingCharacters(in: .whitespaces).isEmpty || busyText != nil)
            if case .error(let text) = step {
                Text(text).font(.footnote).foregroundStyle(Theme.red)
            }
        }
    }

    private func picker(name: String, leagues: [Lookup.League]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("leagues for @\(name)").font(.headline)
            if leagues.isEmpty {
                Text("no leagues for this season yet.").font(.subheadline).foregroundStyle(Theme.ink2)
            }
            ForEach(leagues) { l in
                Button {
                    if picked.contains(l.id) { picked.remove(l.id) } else { picked.insert(l.id) }
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: picked.contains(l.id) ? "checkmark.circle.fill" : "circle")
                            .font(.title3).foregroundStyle(picked.contains(l.id) ? Theme.green : Theme.ink3)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(l.name.lowercased()).font(.body.weight(.semibold)).foregroundStyle(Theme.ink)
                            Text("\(l.season) · \(l.detail)").font(.caption).foregroundStyle(Theme.ink2)
                        }
                        Spacer()
                    }
                    .padding(14)
                    .background(Theme.sheet, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
                .sensoryFeedback(.selection, trigger: picked.contains(l.id))
                .accessibilityAddTraits(picked.contains(l.id) ? .isSelected : [])
            }
            Button {
                Task {
                    step = .busy("saving…")
                    if await model.link(name, leagues: Array(picked)) {
                        Haptics.play("success")
                    } else {
                        step = .error("could not save. try again.")
                    }
                }
            } label: {
                Text(picked.count == 1 ? "follow 1 league" : "follow \(picked.count) leagues").fontWeight(.semibold).frame(maxWidth: .infinity, minHeight: 50)
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.green)
            .disabled(picked.isEmpty)
            .padding(.top, 8)
        }
    }

    private var busyText: String? { if case .busy(let t) = step { return t } else { return nil } }

    private func find() {
        let name = username.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty, busyText == nil else { return }
        focused = false
        step = .busy("looking up your account…")
        Task {
            do {
                let found = try await model.lookup(name)
                guard found.found, let leagues = found.leagues else { step = .error("no sleeper account named “\(name)”."); return }
                picked = Set(leagues.filter(\.picked).map(\.id))
                step = .pick(name: found.username ?? name, leagues: leagues)
            } catch {
                step = .error("could not reach sleeper. check your connection and try again.")
            }
        }
    }
}
