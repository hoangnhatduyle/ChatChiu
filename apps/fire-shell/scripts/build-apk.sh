#!/usr/bin/env bash
# Builds the sideloadable debug APK of the Fire shell (roadmap 5.9). Everything it needs lives inside this repo:
# the JDK and Android SDK in .toolchain/ (see README.md), nothing is installed elsewhere.
#
#   FIRE_SUPABASE_URL=https://<project>.supabase.co \
#   FIRE_SUPABASE_ANON_KEY=<the public anon key> \
#   FIRE_LIVE_SITE_URL=https://chatchiu-zeta.vercel.app \
#   apps/fire-shell/scripts/build-apk.sh
#
# These three are public values (they ship in every web build); no secret is read or written.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

: "${FIRE_SUPABASE_URL:?Set FIRE_SUPABASE_URL (the production Supabase project URL)}"
: "${FIRE_SUPABASE_ANON_KEY:?Set FIRE_SUPABASE_ANON_KEY (the public anon key)}"
: "${FIRE_LIVE_SITE_URL:?Set FIRE_LIVE_SITE_URL (the live site the app talks to and updates from)}"
# Optional: without it the app takes no live updates (see README.md, "Live updates").
FIRE_UPDATE_PUBLIC_KEY="${FIRE_UPDATE_PUBLIC_KEY:-}"

if [ ! -x .toolchain/jdk/bin/java ]; then
  echo "The local toolchain is missing: see apps/fire-shell/README.md, section 'One-time setup'." >&2
  exit 1
fi
# shellcheck disable=SC1091
source apps/fire-shell/scripts/toolchain-env.sh

echo "1/3 Building the web app for the tablet…"
VITE_SUPABASE_URL="$FIRE_SUPABASE_URL" \
VITE_SUPABASE_ANON_KEY="$FIRE_SUPABASE_ANON_KEY" \
VITE_API_BASE_URL="$FIRE_LIVE_SITE_URL" \
VITE_LIVE_SITE_URL="$FIRE_LIVE_SITE_URL" \
VITE_LIVE_UPDATE_PUBLIC_KEY="$FIRE_UPDATE_PUBLIC_KEY" \
  npm run build -w @chatchiu/web

# The live-update zip and list are for the website to publish, not for the APK to carry.
rm -rf apps/web/dist/live apps/web/dist/version.json

echo "2/3 Copying it into the Android project…"
(cd apps/fire-shell && npx cap sync android)

echo "3/3 Building the APK…"
(cd apps/fire-shell/android && ./gradlew assembleDebug --no-daemon -q)

cp apps/fire-shell/android/app/build/outputs/apk/debug/app-debug.apk apps/fire-shell/chatchiu-fire.apk
echo "Done: apps/fire-shell/chatchiu-fire.apk"
