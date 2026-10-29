import ActivityKit
import SwiftUI
import WidgetKit

@main
struct HecateWidgets: WidgetBundle {
    var body: some Widget {
        JourneyWidget()
        if #available(iOS 18.0, *) { JourneyControl() }
    }
}

@available(iOS 18.0, *)
struct JourneyControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.gimpoco.hecate.journey-control") {
            ControlWidgetButton(action: JourneyControlIntent()) {
                Label(JourneyLocalization.text("Hecate journey", language: nil), systemImage: "figure.walk")
            }
        }
        .displayName(LocalizedStringResource(stringLiteral: JourneyLocalization.text("Hecate journey", language: nil)))
        .description(LocalizedStringResource(stringLiteral: JourneyLocalization.text("Open Hecate to start or stop a journey.", language: nil)))
    }
}

struct JourneyWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: JourneyActivityAttributes.self) { context in
            JourneyPanel(context: context)
                // The panel draws its own opaque paper background; a system tint can show through during dismissal.
                .activityBackgroundTint(.clear)
                .widgetURL(journeyURL(context.attributes.walkId, action: "open"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        JourneyIslandMark()
                        Text(context.state.finishedAt == nil ? (context.isStale ? JourneyLocalization.text("Open Hecate to refresh", language: context.state.language) : JourneyLocalization.text("Exploring", language: context.state.language)) : JourneyLocalization.text("Journey complete", language: context.state.language))
                    }
                        .font(.caption.bold())
                        .foregroundStyle(JourneyPalette.lime)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if context.state.finishedAt == nil {
                        StopJourneyButton(walkId: context.attributes.walkId, language: context.state.language)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 8) {
                        if let turn = activeNavigation(context) { JourneyTurnRow(turn: turn, language: context.state.language) }
                        JourneyMetrics(context: context)
                    }
                        .foregroundStyle(.white)
                        .padding(.top, 4)
                }
            } compactLeading: {
                if let turn = activeNavigation(context) {
                    Image(systemName: turn.symbol.systemImage).foregroundStyle(JourneyPalette.lime)
                } else { JourneyIslandMark() }
            } compactTrailing: {
                Text(activeNavigation(context).map { distanceLabel($0.distanceMeters / 1000) } ?? distanceLabel(context.state.distanceKm))
                    .monospacedDigit()
                    .foregroundStyle(JourneyPalette.lime)
            } minimal: {
                if let turn = activeNavigation(context) {
                    Image(systemName: turn.symbol.systemImage).foregroundStyle(JourneyPalette.lime)
                } else { JourneyIslandMark() }
            }
            .widgetURL(journeyURL(context.attributes.walkId, action: "open"))
            .keylineTint(JourneyPalette.lime)
        }
    }
}

private enum JourneyPalette {
    static let forest = Color(red: 24 / 255, green: 60 / 255, blue: 47 / 255)
    static let paper = Color(red: 247 / 255, green: 244 / 255, blue: 237 / 255)
    static let moss = Color(red: 0.48, green: 0.58, blue: 0.23)
    static let lime = Color(red: 217 / 255, green: 242 / 255, blue: 106 / 255)
    static let stop = Color(red: 0.43, green: 0.22, blue: 0.16)

    static func foreground(_ scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(red: 230 / 255, green: 238 / 255, blue: 231 / 255) : forest
    }

    static func background(_ scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(red: 32 / 255, green: 41 / 255, blue: 46 / 255) : paper
    }

    static func accent(_ scheme: ColorScheme) -> Color {
        scheme == .dark ? lime : moss
    }
}

private func journeyColorScheme(_ appearance: JourneyAppearance?, theme: JourneyColorTheme?, system: ColorScheme) -> ColorScheme {
    switch appearance {
    case .light: return .light
    case .dark: return .dark
    case .system, .none:
        switch theme {
        case .dark: return .dark
        case .light: return .light
        case .none: return system
        }
    }
}

private func journeyURL(_ walkId: String, action: String) -> URL {
    var components = URLComponents()
    components.scheme = "hecate"
    components.host = "journey"
    components.path = "/" + action
    components.queryItems = [URLQueryItem(name: "walkId", value: walkId)]
    return components.url!
}

private func distanceLabel(_ distance: Double) -> String {
    distance < 1 ? "\(Int((distance * 1000).rounded())) m" : String(format: "%.2f km", distance)
}

private func activeNavigation(_ context: ActivityViewContext<JourneyActivityAttributes>) -> JourneyNavigation? {
    context.state.finishedAt == nil && !context.isStale ? context.state.navigation : nil
}

private struct JourneyTurnRow: View {
    let turn: JourneyNavigation
    let language: String?
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: turn.symbol.systemImage).font(.title2.bold()).frame(width: 30)
            VStack(alignment: .leading, spacing: 2) {
                Text(turn.distanceMeters <= 10 ? (turn.symbol == .arrive ? JourneyLocalization.text("Arrived", language: language) : JourneyLocalization.text("Now", language: language)) : JourneyLocalization.text("In {{value0}}", language: language).replacingOccurrences(of: "{{value0}}", with: distanceLabel(turn.distanceMeters / 1000)))
                    .font(.headline).monospacedDigit()
                Text(turn.instruction).font(.caption).lineLimit(2)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

private struct JourneyPanel: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var systemColorScheme
    let context: ActivityViewContext<JourneyActivityAttributes>

    private var scheme: ColorScheme { journeyColorScheme(context.state.appearance, theme: context.state.colorTheme, system: systemColorScheme) }

    var body: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 6) {
                    HecateJourneyMark().frame(width: 28, height: 28)
                        .background(JourneyPalette.paper, in: Circle())
                    Text(context.state.finishedAt == nil ? (context.isStale ? JourneyLocalization.text("Open Hecate to refresh", language: context.state.language).uppercased() : JourneyLocalization.text("Exploring…", language: context.state.language).uppercased()) : JourneyLocalization.text("Journey complete", language: context.state.language).uppercased())
                        .font(.caption.bold())
                        .foregroundStyle(JourneyPalette.foreground(scheme))
                }
                if let turn = activeNavigation(context) {
                    JourneyTurnRow(turn: turn, language: context.state.language).foregroundStyle(JourneyPalette.foreground(scheme))
                }
                JourneyMetrics(context: context)
                    .foregroundStyle(JourneyPalette.foreground(scheme))
            }
            if context.state.finishedAt == nil {
                StopJourneyButton(walkId: context.attributes.walkId, language: context.state.language)
            } else {
                Image(systemName: "checkmark.circle.fill")
                    .font(.title)
                    .foregroundStyle(JourneyPalette.accent(scheme))
            }
        }
        .padding(18)
        .background {
            JourneyPalette.background(scheme)
                .overlay {
                    JourneyTopographyBackground()
                        .padding(-4)
                        .offset(x: reduceMotion ? 0 : sin(context.state.distanceKm * 10) * 3,
                                y: reduceMotion ? 0 : (cos(context.state.distanceKm * 10) - 1) * 2)
                        .opacity(0.14)
                        .animation(reduceMotion ? nil : .easeInOut(duration: 1), value: context.state.distanceKm)
                }
                .clipped()
                .accessibilityHidden(true)
                .allowsHitTesting(false)
        }
        .environment(\.colorScheme, scheme)
        .activitySystemActionForegroundColor(JourneyPalette.foreground(scheme))
    }
}

private struct HecateJourneyMark: View {
    var body: some View {
        Image("HecateLogo")
            .resizable()
            .scaledToFit()
            .accessibilityHidden(true)
    }
}

/// Keep the artwork and badge at one size while the system changes the Island's presentation.
private struct JourneyIslandMark: View {
    var body: some View {
        HecateJourneyMark()
            .frame(width: 18, height: 18)
            .padding(2)
            .background(JourneyPalette.paper, in: Circle())
            .fixedSize()
            .compositingGroup()
            .contentTransition(.identity)
            .transition(.opacity)
    }
}

private struct StopJourneyButton: View {
    let walkId: String
    let language: String?

    var body: some View {
        if #available(iOS 17.0, *) {
            Button(intent: StopJourneyIntent(walkId: walkId)) { icon }
                .buttonStyle(.plain)
                .accessibilityLabel(JourneyLocalization.text("Stop journey", language: language))
        } else {
            Link(destination: journeyURL(walkId, action: "stop")) { icon }
                .accessibilityLabel(JourneyLocalization.text("Open Hecate to stop journey", language: language))
        }
    }

    private var icon: some View {
        Image(systemName: "stop.fill")
            .font(.body.bold())
            .foregroundStyle(.white)
            .frame(width: 44, height: 44)
            .background(JourneyPalette.stop, in: Circle())
    }
}

private struct JourneyMetrics: View {
    let context: ActivityViewContext<JourneyActivityAttributes>

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            metric(distanceLabel(context.state.distanceKm), label: context.state.finishedAt == nil ? JourneyLocalization.text("this walk", language: context.state.language) : JourneyLocalization.text("walked", language: context.state.language))
            Divider().frame(height: 36)
            metric(context.state.newGroundMeters.map { String(format: "+%.0f m", $0) } ?? "—", label: JourneyLocalization.text("new area", language: context.state.language))
            Divider().frame(height: 36)
            VStack(alignment: .leading, spacing: 2) {
                if let finishedAt = context.state.finishedAt {
                    Text(elapsedTimeLabel(finishedAt.timeIntervalSince(context.attributes.startedAt)))
                        .font(.headline).monospacedDigit()
                } else if context.isStale {
                    Text(elapsedTimeLabel(context.state.updatedAt.timeIntervalSince(context.attributes.startedAt)))
                        .font(.headline).monospacedDigit()
                } else {
                    Text(timerInterval: context.attributes.startedAt...Date.distantFuture, countsDown: false)
                        .font(.headline).monospacedDigit()
                }
                Text(JourneyLocalization.text("time", language: context.state.language)).font(.caption).opacity(0.65)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func metric(_ value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.headline).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
            Text(label).font(.caption).opacity(0.65)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private func elapsedTimeLabel(_ interval: TimeInterval) -> String {
    let seconds = max(0, Int(interval))
    if seconds >= 3600 {
        return String(format: "%d:%02d:%02d", seconds / 3600, seconds / 60 % 60, seconds % 60)
    }
    return String(format: "%d:%02d", seconds / 60, seconds % 60)
}
