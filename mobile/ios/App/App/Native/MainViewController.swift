import UIKit
import Capacitor

/// The Capacitor web view with our own plugin registered.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WorfixNativePlugin())
    }
}
