import Capacitor
import UIKit

@objc(JourneyBridgeViewController)
class JourneyBridgeViewController: CAPBridgeViewController {
    private let journeyActivity = JourneyActivityPlugin()
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(journeyActivity)
        bridge?.registerPluginInstance(AppIconPlugin())
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        if traitCollection.hasDifferentColorAppearance(comparedTo: previousTraitCollection) {
            journeyActivity.updateSystemAppearance(traitCollection.userInterfaceStyle)
        }
    }
}
