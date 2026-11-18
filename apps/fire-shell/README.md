# Fire shell (roadmap 5.9)

The Fire Max 11 has no Google push, so web notifications never reached it (D10). This folder wraps the web app as an
Android app (Capacitor 6) that you **sideload** (D14). It differs from the website in three ways:

1. **Reminders are scheduled on the tablet itself** (`@capacitor/local-notifications`): one grouped expiry reminder per
   day at the hour you picked, for the next 30 days, rebuilt whenever the app syncs, comes to the front or you change a
   setting. They keep firing with the app closed and after a reboot. A low-stock alert shows at once on the tablet where
   a use crossed the line. The server never pushes to this tablet (it registers as a `local` device).
2. **Live updates**: on launch the app reads `/version.json` from the live site and, when a newer web build is listed,
   downloads it (`@capgo/capacitor-updater`, manual mode) and switches to it. Only native changes need a new APK.
3. **Settings → Reminders & alerts** shows "This device: notifications on ✓" and **Send test** shows a notification on
   the tablet in a moment.

## Before the app can talk to your API (a production setting: do it yourself or ask)

Inside the tablet the app runs from the origin `https://localhost`. The API only answers listed origins, so add
`https://localhost` to **`API_ALLOWED_ORIGINS`** in the Vercel project (Production), then redeploy. Nothing in this
repository changes that setting. Without it every request from the shell is blocked and the app cannot sign in.

## One-time setup (inside this repository only)

The build tools are installed into `.toolchain/` at the repo root (git-ignored): Temurin JDK 17, the Android SDK
(platform 34 and 35, build-tools 34) and the Gradle cache. `apps/fire-shell/scripts/toolchain-env.sh` points the tools at that folder, so
nothing is installed anywhere else. If `.toolchain/` is missing, recreate it:

```bash
mkdir -p .toolchain/downloads && cd .toolchain/downloads
curl -fsSL -o jdk17.tar.gz "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"
curl -fsSL -o cmdline-tools.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
cd .. && mkdir -p jdk android-sdk/cmdline-tools android-home gradle
tar -xzf downloads/jdk17.tar.gz -C jdk --strip-components=1
python3 -c "import zipfile; zipfile.ZipFile('downloads/cmdline-tools.zip').extractall('android-sdk/cmdline-tools')"
mv android-sdk/cmdline-tools/cmdline-tools android-sdk/cmdline-tools/latest
source ../apps/fire-shell/scripts/toolchain-env.sh
yes | sdkmanager --licenses            # accepting Google's Android SDK license
sdkmanager "platform-tools" "platforms;android-34" "platforms;android-35" "build-tools;34.0.0"
```

`toolchain-env.sh` sets `JAVA_HOME`, `ANDROID_HOME`, `ANDROID_USER_HOME`, `GRADLE_USER_HOME` to folders under `.toolchain/` and puts
`java`, `sdkmanager` and `adb` on the PATH.

## Build the APK

```bash
FIRE_SUPABASE_URL=https://<your-project>.supabase.co \
FIRE_SUPABASE_ANON_KEY=<the public anon key> \
FIRE_LIVE_SITE_URL=https://chatchiu-zeta.vercel.app \
apps/fire-shell/scripts/build-apk.sh
```

The three values are public (every web build carries them); no secret is read. The result is
`apps/fire-shell/chatchiu-fire.apk` (a debug-signed APK, the signing key lives in `.toolchain/android-home/`; keep that
folder, or a later APK cannot be installed over this one and must replace it after uninstalling).

## Sideload on the Fire Max 11

1. On the tablet: Settings → Security & Privacy → **Apps from Unknown Sources** → allow for the app you will open the
   file with (Silk or Files).
2. Get the APK onto the tablet (USB cable and Files, or a download link you control) and open it → Install.
3. Open **Chắt Chiu**, sign in. When Android asks, **allow notifications**.
4. Settings → **Reminders & alerts** → _Turn on for this device_ → the status reads "notifications on ✓".
5. **Send test notification**: a notification appears within a couple of seconds.

## What to check on the tablet (roadmap 5.9 acceptance)

- Add an item that expires tomorrow with the reminder on, set the reminder hour a few minutes ahead, **close the app**:
  the reminder "Item expiring soon" arrives at that time. Tap it: the stock list opens filtered to expiring.
- **Restart the tablet** and wait for the next reminder time: it still arrives (the schedule survives a reboot).
- Lower an item's amount below its low-stock line on this tablet: "<name> is running low (n%)" shows once.
- Sign out: the tablet stops getting reminders (its schedule is cancelled and it leaves the server's list).
- Battery saver can delay exact alarms: if a reminder is late, exclude Chắt Chiu from battery optimisation.

## Live updates (signed)

Every web build also writes `dist/version.json` and `dist/live/<version>.zip` (`apps/web/scripts/live-update-plugin.mjs`).
A bundle is code that runs with your login, so the tablet only takes one whose list is **signed**:

- `version.json` carries `version`, `url`, the zip's `sha256` and a `sig` (ECDSA P-256 over those three).
- The app checks `sig` with the **public key it was built with**, refuses another origin or a version dated more than a
  day ahead, and the updater checks the download against `sha256`. No key in the build means the app takes no updates.

One-time setup:

1. `node apps/fire-shell/scripts/make-update-key.mjs` writes the private key to `.toolchain/live-update-signing-key.pem`
   (git-ignored; **keep a backup**, never commit it) and prints the public key.
2. Build the APK with that public key: add `FIRE_UPDATE_PUBLIC_KEY=<printed key>` to the build command above.
3. For the live site to publish signed bundles, add the private key to the Vercel project as `LIVE_UPDATE_SIGNING_KEY`
   (a production secret: this repository never sets it; do it yourself or ask first). Without it the site writes an unsigned
   list and the tablet ignores it.

Check from a computer: `curl https://<live site>/version.json` (it should show `sig`).

## Not done here

- No background refresh while the app stays closed for weeks (the schedule covers 30 days ahead, rebuilt each time the
  app opens). `@capacitor/background-runner` would need a stored login token to fetch data, and refreshing it there could
  log the app out of its own session: see roadmap row 7.0.34.
- The launcher icon is Capacitor's default; the status-bar icon is a plain jar shape.
- If you remove this tablet's reminders from another device, or clear the app's data, the server and the tablet can disagree
  about whether it is registered (there is no list-devices call yet): turn reminders off and on again in Settings.
