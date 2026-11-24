import Foundation
import UIKit
import Capacitor
import CoreLocation
import WidgetKit

/// WorfixNative: what the website needs from the phone. Same methods as Android
/// (mobile/android/.../WorfixNativePlugin.java); the page side is web/src/lib/native/index.ts.
@objc(WorfixNativePlugin)
public class WorfixNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WorfixNativePlugin"
    public let jsName = "WorfixNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "info", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "refreshWidgets", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startWalk", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "walkPoints", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopWalk", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "verifyBiometric", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveLogin", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadLogin", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearLogin", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeShared", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
    ]

    private var saveDone: ((Bool) -> Void)?

    override public func load() {
        // Photos left by the share extension: tell the page when the app comes to the front.
        NotificationCenter.default.addObserver(self, selector: #selector(becameActive), name: UIApplication.didBecomeActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(wentBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
    }

    @objc private func becameActive() {
        if !sharedFiles().isEmpty { notifyListeners("shared", data: [:]) }
    }

    @objc private func wentBackground() {
        // Widgets show the freshest numbers once the user leaves the app.
        if WorfixShared.widgetToken != nil { WidgetCenter.shared.reloadAllTimelines() }
    }

    // MARK: info

    @objc func info(_ call: CAPPluginCall) {
        let b = Bundle.main
        var push = false
        #if canImport(FirebaseMessaging)
        push = b.path(forResource: "GoogleService-Info", ofType: "plist") != nil
        #endif
        call.resolve([
            "version": b.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0",
            "build": b.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1",
            "biometric": Biometrics.kind(),
            "hasLogin": Biometrics.hasLogin,
            "hasSession": WorfixShared.widgetToken != nil,
            "sessionUser": WorfixShared.widgetUser.map { $0 as Any } ?? NSNull(),
            "push": push,
        ])
    }

    // MARK: widgets

    @objc func setSession(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), let user = call.getString("userId") else { return call.reject("token and userId are required") }
        WorfixShared.widgetToken = token
        WorfixShared.widgetUser = user
        WorfixShared.widgetJSON = nil
        rememberLocation()
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    @objc func clearSession(_ call: CAPPluginCall) {
        let token = WorfixShared.widgetToken
        WorfixShared.widgetToken = nil
        WorfixShared.widgetUser = nil
        WorfixShared.widgetJSON = nil
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve(["token": token.map { $0 as Any } ?? NSNull()])
    }

    @objc func refreshWidgets(_ call: CAPPluginCall) {
        rememberLocation()
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    private func rememberLocation() {
        let m = CLLocationManager()
        if let l = m.location { WorfixShared.saveLocation(lat: l.coordinate.latitude, lng: l.coordinate.longitude) }
    }

    // MARK: the walk

    @objc func startWalk(_ call: CAPPluginCall) {
        let labels = (call.getObject("labels") ?? [:]).compactMapValues { $0 as? String }
        let color = call.getString("color") ?? "#1fa84a"
        let resume = call.getBool("resume") ?? false
        DispatchQueue.main.async {
            WalkTracker.shared.start(color: color, labels: labels, resume: resume) { ok in
                ok ? call.resolve() : call.reject("location permission denied")
            }
        }
    }

    @objc func walkPoints(_ call: CAPPluginCall) {
        let from = call.getInt("from") ?? 0
        DispatchQueue.main.async {
            let t = WalkTracker.shared
            let list = t.since(from).map { ["lat": $0.lat, "lng": $0.lng, "t": $0.t, "acc": $0.acc] as [String: Any] }
            call.resolve(["points": list, "total": t.points.count, "running": t.running])
        }
    }

    @objc func stopWalk(_ call: CAPPluginCall) {
        let clear = call.getBool("clear") ?? false
        DispatchQueue.main.async {
            WalkTracker.shared.stop(clear: clear)
            call.resolve()
        }
    }

    // MARK: biometrics

    @objc func verifyBiometric(_ call: CAPPluginCall) {
        Biometrics.verify(reason: call.getString("reason") ?? "", cancel: call.getString("cancel") ?? "Cancel") { ok in call.resolve(["ok": ok]) }
    }

    @objc func saveLogin(_ call: CAPPluginCall) {
        guard let email = call.getString("email"), let password = call.getString("password") else { return call.reject("email and password are required") }
        Biometrics.saveLogin(email: email, password: password, reason: call.getString("reason") ?? "", cancel: call.getString("cancel") ?? "Cancel") { ok in
            ok ? call.resolve(["ok": true]) : call.reject("failed")
        }
    }

    @objc func loadLogin(_ call: CAPPluginCall) {
        Biometrics.loadLogin(reason: call.getString("reason") ?? "", cancel: call.getString("cancel") ?? "Cancel") { login in
            guard let login = login, let email = login["email"], let password = login["password"] else { return call.reject("failed") }
            call.resolve(["email": email, "password": password])
        }
    }

    @objc func clearLogin(_ call: CAPPluginCall) {
        Biometrics.clearLogin()
        call.resolve()
    }

    // MARK: Share → WORFIX (files left by the share extension)

    private func sharedFiles() -> [URL] {
        guard let dir = WorfixShared.sharedFolder,
              let list = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.creationDateKey]) else { return [] }
        return list.filter { !$0.lastPathComponent.hasPrefix(".") }.sorted { $0.lastPathComponent < $1.lastPathComponent }
    }

    @objc func takeShared(_ call: CAPPluginCall) {
        var files: [[String: String]] = []
        for url in sharedFiles().prefix(6) {
            guard let data = try? Data(contentsOf: url) else { continue }
            let ext = url.pathExtension.lowercased()
            let type = ext == "png" ? "image/png" : ext == "heic" ? "image/heic" : ext == "webp" ? "image/webp" : "image/jpeg"
            files.append(["name": url.lastPathComponent, "type": type, "data": data.base64EncodedString()])
        }
        for url in sharedFiles() { try? FileManager.default.removeItem(at: url) }
        call.resolve(["files": files])
    }

    // MARK: images out

    private func decode(_ dataUrl: String) -> Data? {
        let b64 = dataUrl.components(separatedBy: ",").last ?? dataUrl
        return Data(base64Encoded: b64, options: .ignoreUnknownCharacters)
    }

    @objc func shareImage(_ call: CAPPluginCall) {
        guard let dataUrl = call.getString("dataUrl"), let data = decode(dataUrl), let image = UIImage(data: data) else { return call.reject("dataUrl is required") }
        let text = call.getString("text") ?? ""
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController else { return call.reject("no view") }
            let sheet = UIActivityViewController(activityItems: text.isEmpty ? [image] : [image, text], applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = vc.view
            sheet.popoverPresentationController?.sourceRect = CGRect(x: vc.view.bounds.midX, y: vc.view.bounds.maxY - 80, width: 1, height: 1)
            vc.present(sheet, animated: true)
            call.resolve()
        }
    }

    @objc func saveImage(_ call: CAPPluginCall) {
        guard let dataUrl = call.getString("dataUrl"), let data = decode(dataUrl), let image = UIImage(data: data) else { return call.reject("dataUrl is required") }
        DispatchQueue.main.async {
            self.saveDone = { ok in ok ? call.resolve(["ok": true]) : call.reject("not saved") }
            UIImageWriteToSavedPhotosAlbum(image, self, #selector(self.saved(_:didFinishSavingWithError:contextInfo:)), nil)
        }
    }

    @objc private func saved(_ image: UIImage, didFinishSavingWithError error: Error?, contextInfo: UnsafeRawPointer) {
        saveDone?(error == nil)
        saveDone = nil
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            call.resolve()
        }
    }
}
