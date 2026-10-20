import Capacitor

@objc(JourneyBridgeViewController)
class JourneyBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(JourneyActivityPlugin())
    }
}
