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

            guard self.mapView == nil else {
                call.reject("The 3D Apple map is already open.", "MAP_ALREADY_OPEN")
                return
            }
            guard let latitude = call.getDouble("latitude"), latitude.isFinite, (-85.05112878...85.05112878).contains(latitude),
                  let longitude = call.getDouble("longitude"), longitude.isFinite, (-180.0...180.0).contains(longitude),
                  let zoom = call.getDouble("zoom"), zoom.isFinite, (0.0...22.0).contains(zoom),
                  let bearing = call.getDouble("bearing"), bearing.isFinite,
                  let pitch = call.getDouble("pitch"), pitch.isFinite, (0.0...60.0).contains(pitch),
                  let closeLabel = call.getString("closeLabel"), !closeLabel.isEmpty else {
                call.reject("Apple Maps requires valid latitude, longitude, zoom, bearing, pitch and a close label.", "INVALID_MAP_CAMERA")
                return
            }
            let map = self.makeMapView()
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
                self.addDismissButton(to: hostView, label: closeLabel)
            }

            hostView.layoutIfNeeded()
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
            self?.hideMap()
            call.resolve()
        }
    }

    private func makeMapView() -> MKMapView {
        let map = MKMapView(frame: .zero)
        map.mapType = .standard
        map.showsBuildings = true
        map.showsTraffic = false
        map.isPitchEnabled = true
        map.isRotateEnabled = true
        map.showsCompass = true
        map.showsScale = true
        map.showsUserLocation = true
        map.pointOfInterestFilter = .includingAll
        return map
    }

    private func addDismissButton(to hostView: UIView, label: String) {
        var configuration = UIButton.Configuration.filled()
        configuration.title = "2D"
        configuration.baseForegroundColor = UIColor(red: 0.10, green: 0.24, blue: 0.18, alpha: 1)
        configuration.baseBackgroundColor = UIColor(red: 0.97, green: 0.97, blue: 0.94, alpha: 0.96)
        configuration.cornerStyle = .capsule
        let button = UIButton(configuration: configuration)
        button.accessibilityLabel = label
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
        hideMap()
        notifyListeners("dismissed", data: [:])
    }

    private func hideMap() {
        dismissButton?.removeFromSuperview()
        dismissButton = nil
        mapView?.removeFromSuperview()
        mapView?.showsUserLocation = false
        mapView = nil
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
