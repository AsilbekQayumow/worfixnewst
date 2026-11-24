import Foundation
import LocalAuthentication
import Security

/// Face ID / Touch ID: the app lock and "sign in with Face ID". The saved sign-in lives in the Keychain behind
/// the current biometric set (adding a finger or a face deletes it on purpose). Nothing leaves the phone.
enum Biometrics {
    private static let service = "site.worfix.app.login"
    private static let account = "default"

    static func kind() -> String {
        let ctx = LAContext()
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err) else { return "none" }
        switch ctx.biometryType {
        case .faceID: return "face"
        case .touchID: return "fingerprint"
        default: return "any"
        }
    }

    static func verify(reason: String, cancel: String, done: @escaping (Bool) -> Void) {
        let ctx = LAContext()
        ctx.localizedCancelTitle = cancel
        ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason.isEmpty ? "WORFIX" : reason) { ok, _ in
            DispatchQueue.main.async { done(ok) }
        }
    }

    static var hasLogin: Bool {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account,
                                kSecUseAuthenticationUI as String: kSecUseAuthenticationUIFail]
        let status = SecItemCopyMatching(q as CFDictionary, nil)
        return status == errSecSuccess || status == errSecInteractionNotAllowed
    }

    static func clearLogin() {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        SecItemDelete(q as CFDictionary)
    }

    /// Confirms with Face ID first, then stores the sign-in behind the biometric set.
    static func saveLogin(email: String, password: String, reason: String, cancel: String, done: @escaping (Bool) -> Void) {
        verify(reason: reason, cancel: cancel) { ok in
            guard ok, let data = try? JSONSerialization.data(withJSONObject: ["email": email, "password": password]) else { return done(false) }
            clearLogin()
            guard let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, .biometryCurrentSet, nil) else { return done(false) }
            let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account,
                                    kSecAttrAccessControl as String: access, kSecValueData as String: data]
            done(SecItemAdd(q as CFDictionary, nil) == errSecSuccess)
        }
    }

    static func loadLogin(reason: String, cancel: String, done: @escaping ([String: String]?) -> Void) {
        let ctx = LAContext()
        ctx.localizedReason = reason.isEmpty ? "WORFIX" : reason
        ctx.localizedCancelTitle = cancel
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account,
                                kSecReturnData as String: true, kSecUseAuthenticationContext as String: ctx]
        DispatchQueue.global(qos: .userInitiated).async {
            var out: AnyObject?
            let status = SecItemCopyMatching(q as CFDictionary, &out)
            var result: [String: String]?
            if status == errSecSuccess, let data = out as? Data, let obj = try? JSONSerialization.jsonObject(with: data) as? [String: String] { result = obj }
            if status == errSecItemNotFound { clearLogin() }
            DispatchQueue.main.async { done(result) }
        }
    }
}
