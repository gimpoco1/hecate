import Capacitor
import MapKit
import UIKit

@objc(NativeMapPlugin)
final class NativeMapPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "NativeMapPlugin"
    let jsName = "NativeMap"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "present", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "dismiss", returnType: CAPPluginReturnPromise)
    ]

    private var mapView: MKMapView?
    private var dismissButton: UIButton?

    @objc func present(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self, let hostView = self.bridge?.viewController?.view else {
                call.reject("Apple Maps is unavailable")
                return
            }

            let map = self.mapView ?? self.makeMapView()
            self.mapView = map
            if map.superview == nil {
                map.translatesAutoresizingMaskIntoConstraints = false
                hostView.addSubview(map)
                NSLayoutConstraint.activate([
                    map.leadingAnchor.constraint(equalTo: hostView.leadingAnchor),
                    map.trailingAnchor.constraint(equalTo: hostView.trailingAnchor),
                    map.topAnchor.constraint(equalTo: hostView.topAnchor),
                    map.bottomAnchor.constraint(equalTo: hostView.bottomAnchor)
                ])
                self.addDismissButton(to: hostView)
            }

            let latitude = call.getDouble("latitude") ?? 41.3874
            let longitude = call.getDouble("longitude") ?? 2.1686
            let zoom = call.getDouble("zoom") ?? 15
            let bearing = call.getDouble("bearing") ?? -24
            let pitch = call.getDouble("pitch") ?? 55
            self.setCamera(
                center: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
                zoom: zoom,
                heading: bearing,
                pitch: pitch,
                animated: true
            )
            call.resolve()
        }
    }

    @objc func dismiss(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.hideMap(notifyWeb: false)
            call.resolve()
        }
    }

    private func makeMapView() -> MKMapView {
        let map = MKMapView(frame: .zero)
        let configuration = MKStandardMapConfiguration(elevationStyle: .realistic)
        configuration.showsTraffic = false
        map.preferredConfiguration = configuration
        map.isPitchEnabled = true
        map.isRotateEnabled = true
        map.showsCompass = true
        map.showsScale = true
        map.showsUserLocation = true
        map.pointOfInterestFilter = .includingAll
        return map
    }

    private func addDismissButton(to hostView: UIView) {
        var configuration = UIButton.Configuration.filled()
        configuration.title = "2D"
        configuration.baseForegroundColor = UIColor(red: 0.10, green: 0.24, blue: 0.18, alpha: 1)
        configuration.baseBackgroundColor = UIColor(red: 0.97, green: 0.97, blue: 0.94, alpha: 0.96)
        configuration.cornerStyle = .capsule
        let button = UIButton(configuration: configuration)
        button.accessibilityLabel = "Exit 3D Apple Maps"
        button.addTarget(self, action: #selector(close3DMap), for: .touchUpInside)
        button.translatesAutoresizingMaskIntoConstraints = false
        hostView.addSubview(button)
        NSLayoutConstraint.activate([
            button.trailingAnchor.constraint(equalTo: hostView.safeAreaLayoutGuide.trailingAnchor, constant: -18),
            button.topAnchor.constraint(equalTo: hostView.safeAreaLayoutGuide.topAnchor, constant: 14),
            button.heightAnchor.constraint(equalToConstant: 46),
            button.widthAnchor.constraint(greaterThanOrEqualToConstant: 58)
        ])
        dismissButton = button
    }

    @objc private func close3DMap() {
        hideMap(notifyWeb: true)
    }

    private func hideMap(notifyWeb: Bool) {
        dismissButton?.removeFromSuperview()
        dismissButton = nil
        mapView?.removeFromSuperview()
        if notifyWeb {
            notifyListeners("dismissed", data: nil)
        }
    }

    private func setCamera(
        center: CLLocationCoordinate2D,
        zoom: Double,
        heading: CLLocationDirection,
        pitch: CGFloat,
        animated: Bool
    ) {
        guard let map = mapView else { return }
        let latitudeRadians = center.latitude * .pi / 180
        let metersPerPixel = 156_543.03392 * cos(latitudeRadians) / pow(2, zoom)
        let viewport = max(map.bounds.width, map.bounds.height, 320)
        let distance = max(180, Double(viewport) * metersPerPixel * 1.35)

        let camera = MKMapCamera()
        camera.centerCoordinate = center
        camera.centerCoordinateDistance = distance
        camera.heading = heading
        camera.pitch = min(max(pitch, 0), 60)
        map.setCamera(camera, animated: animated)
    }
}
