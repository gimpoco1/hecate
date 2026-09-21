import Capacitor

final class HecateBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginType(NativeMapPlugin.self)
    }
}
