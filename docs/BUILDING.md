# Building and releasing

All three targets share one React codebase. Fill in `.env` first (see
[`.env.example`](../.env.example)) — its values are baked into every build.

## Web

```bash
npm install
npm run dev      # http://localhost:3000, with dev proxies for every provider
npm run build    # production bundle in dist/
```

### Deploying to Vercel

`vercel.json` already contains the API rewrites the web build needs (JioSaavn,
YouTube Music, SoundCloud, LRCLIB, Spotify, Last.fm, …) plus a small
serverless proxy in `api/proxy.js`. Import the repo in Vercel, add the `VITE_*`
variables under Project → Settings → Environment Variables, and deploy.

## Windows desktop (Tauri v2)

Requirements: [Rust](https://rustup.rs) (stable, MSVC toolchain), and the
WebView2 runtime (preinstalled on Windows 10/11).

```bash
npm run tauri dev     # hot-reloading desktop app
npm run tauri build   # installers
```

Output:

```
src-tauri/target/release/bundle/nsis/Nuctify_<version>_x64-setup.exe
src-tauri/target/release/bundle/msi/Nuctify_<version>_x64_en-US.msi
```

Discord Rich Presence is compiled in only when `VITE_DISCORD_CLIENT_ID` is set
in `.env` (read by `src-tauri/build.rs`).

## Android (Capacitor 8)

Requirements: Android SDK (via Android Studio) and **JDK 21 or newer** —
Capacitor 8 fails with `invalid source release: 21` on JDK 17. Android Studio's
bundled JBR works; otherwise point `JAVA_HOME` at a JDK 21+.

```bash
npm run build
npx cap sync android
cd android
./gradlew assembleDebug     # app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease   # app/build/outputs/apk/release/app-release-unsigned.apk
```

### Signing a release APK

Android only lets an update install over an existing app if it is signed with
the **same key**. Keep your keystore safe and out of git (`*.jks` and
`*.keystore` are ignored).

Create a keystore once:

```bash
keytool -genkeypair -v -keystore nuctify-release.jks -alias nuctify \
  -keyalg RSA -keysize 2048 -validity 10000
```

Sign each release (build-tools live in `<Android SDK>/build-tools/<version>/`):

```bash
zipalign -f -p 4 app-release-unsigned.apk app-release-aligned.apk
apksigner sign --ks nuctify-release.jks --ks-key-alias nuctify \
  --out Nuctify-<version>-android.apk app-release-aligned.apk
apksigner verify --print-certs Nuctify-<version>-android.apk
```

Or in Android Studio: **Build → Generate Signed App Bundle / APK → APK**.

Bump `versionCode` (and `versionName`) in `android/app/build.gradle` for every
release you publish, or Android will refuse to install it as an update.

## Publishing a GitHub release

1. Bump the version in `package.json`, `src-tauri/tauri.conf.json` and
   `android/app/build.gradle`.
2. Build the installers and the signed APK as above.
3. On GitHub: **Releases → Draft a new release**, tag `v<version>`, and attach:
   - `Nuctify_<version>_x64-setup.exe`
   - `Nuctify_<version>_x64_en-US.msi` (optional)
   - `Nuctify-<version>-android.apk`

   With the GitHub CLI:

   ```bash
   gh release create v0.1.0 \
     Nuctify_0.1.0_x64-setup.exe Nuctify_0.1.0_x64_en-US.msi Nuctify-0.1.0-android.apk \
     --title "Nuctify v0.1.0" --notes "First public release"
   ```

The README's download badges point at `releases/latest`, so they pick up the
newest release automatically.
