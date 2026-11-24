# WORFIX app (Android and iOS)

A Capacitor 8 shell that opens the live site (`https://worfix.site/app`) and adds native features.
**Website changes reach the app on the next launch, with no store release.** A new store release is needed
only when something in this folder changes (native code, widgets, permissions, icons).

## What the app adds

| Feature | Android | iOS |
|---|---|---|
| Push notifications (FCM): area taken, mission approved, chat, streak ends today | ✓ (needs `google-services.json`) | ✓ (needs `GoogleService-Info.plist` + APNs key) |
| Walk recorded with the screen off + live panel | foreground service + lock-screen notification | background location + Live Activity / Dynamic Island |
| 5 home-screen widgets: tree, streak & level, nearest mission, my area, community pulse | ✓ | ✓ (+ streak on the lock screen) |
| Native camera for mission photos | ✓ | ✓ |
| worfix.site links open in the app | App Links (`/.well-known/assetlinks.json`) | Universal Links (needs `APPLE_TEAM_ID`) |
| Icon shortcuts: Walk a loop, Missions, Map | ✓ | ✓ |
| Share → WORFIX (photos into a mission report) | ✓ | share extension |
| Haptics | ✓ | ✓ |
| Fingerprint / Face ID sign-in and app lock | ✓ | ✓ |
| Branded offline page | ✓ | ✓ |

The page side lives in `web/src/lib/native/index.ts` (bridge), `web/src/components/native-bridge.tsx`
(links, push, widgets, share inbox, app lock) and `web/src/components/app-settings.tsx`. The server side is
`web/src/lib/server/push.ts` and `web/src/lib/server/widget.ts` (functions `push-register`, `push-unregister`,
`push-send`, `widget-token`, `widget`, and the 13:00 UTC streak-reminder cron).

### WorfixNative plugin (same methods on both platforms)

`info`, `setSession`, `clearSession`, `refreshWidgets`, `startWalk`, `walkPoints`, `stopWalk`,
`verifyBiometric`, `saveLogin`, `loadLogin`, `clearLogin`, `takeShared` (+ `shared` event), `shareImage`,
`saveImage`, `openSettings`. Android: `android/app/src/main/java/site/worfix/app/`; iOS: `ios/App/App/Native/`.

## Build

```bash
cd mobile
npm install
npx cap sync
```

### Android

Needs JDK 21 and the Android SDK (platform 36).

```bash
cd android
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk  (install on a phone to test)
./gradlew bundleRelease        # app/build/outputs/bundle/release/app-release.aab  (Google Play)
```

Release signing reads `android/keystore.properties` (never committed):

```
storeFile=/absolute/path/worfix-upload.jks
storePassword=...
keyAlias=worfix
keyPassword=...
```

Keep the upload keystore and its password safe (a password manager and one offline copy). With Play App
Signing a lost upload key can be reset through Play support, but it takes days.

**Push on Android:** Firebase console → project `worfix3` → Add app → Android, package `site.worfix.app` →
download `google-services.json` → put it in `android/app/` → rebuild. Without it the app works, just without push.

**App Links:** after the first upload to Play, copy the *App signing key* SHA-256 from Play Console →
Setup → App integrity and add it to the Worker: `npx wrangler secret put ANDROID_CERT_SHA256` (comma
separated if more than one). The upload key is already in `web/worker.ts`.

### iOS (needs a Mac with Xcode 16+ and an Apple Developer account)

```bash
cd mobile
npx cap sync ios
ruby scripts/setup-ios.rb      # only after a fresh `npx cap add ios`; the project is already wired
npx cap open ios
```

In Xcode:

1. Select the **App**, **WorfixWidgets** and **WorfixShare** targets → Signing & Capabilities → choose your Team
   (automatic signing). Xcode registers the App Group `group.site.worfix.app`, Push Notifications and
   Associated Domains from the entitlements files.
2. **Push:** Firebase console → Add app → iOS, bundle `site.worfix.app` → download `GoogleService-Info.plist`
   → drag it into `App/App` (target App). Apple Developer → Keys → create an APNs key → upload it in
   Firebase console → Project settings → Cloud Messaging. The FirebaseMessaging package is already added.
3. **Universal Links:** set the Worker secret `APPLE_TEAM_ID` (your 10-character Team ID):
   `npx wrangler secret put APPLE_TEAM_ID` — `/.well-known/apple-app-site-association` starts answering.
4. Product → Archive → Distribute to App Store Connect / TestFlight.

The iOS sources were written and syntax-checked on Linux but compile only on a Mac; build once in Xcode
before the first TestFlight upload.

## Icons and splash

`assets/` holds the sources; regenerate with
`npx capacitor-assets generate --android --ios --iconBackgroundColor '#eef7ea' --iconBackgroundColorDark '#0e1915' --splashBackgroundColor '#f4f8f1' --splashBackgroundColorDark '#0e1915'`.
Widget and shortcut icons come from the site's icon set: `python3 scripts/gen-android-icons.py`.
