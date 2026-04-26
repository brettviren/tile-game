#!/usr/bin/env bash
# build-apk.sh — Build an Android APK for ExponenTile
#
# REQUIRED TOOLS (must already be installed and on PATH):
#   deno        — runs the Next.js build
#   node        — runs `cap sync` (the Capacitor CLI is a Node script)
#   java 17+    — Gradle requires it (Java 21 confirmed present on this machine)
#
# REQUIRED ENVIRONMENT:
#   ANDROID_HOME — path to your Android SDK installation.
#                  Must contain at least:
#                    platforms/android-34
#                    build-tools/34.x.x   (any 34.x.x)
#                  Install via Android Studio or:
#                    sdkmanager "platforms;android-34" "build-tools;34.0.0"
#
# FIRST-TIME SETUP:
#   If node_modules are not yet installed:
#     pnpm install
#
# OUTPUT:
#   android/app/build/outputs/apk/debug/app-debug.apk

set -euo pipefail

# ── Preflight checks ──────────────────────────────────────────────────────────

if [[ -z "${ANDROID_HOME:-}" ]]; then
    echo "ERROR: ANDROID_HOME is not set."
    echo "Set it to your Android SDK directory, e.g.:"
    echo "  export ANDROID_HOME=\$HOME/Android/Sdk"
    exit 1
fi

if [[ ! -d "$ANDROID_HOME/platforms/android-34" ]]; then
    echo "ERROR: Android platform API 34 not found under \$ANDROID_HOME."
    echo "Install it with:"
    echo "  \$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager \"platforms;android-34\""
    exit 1
fi

if ! command -v deno &>/dev/null; then
    echo "ERROR: deno not found on PATH."
    exit 1
fi

if ! command -v node &>/dev/null; then
    echo "ERROR: node not found on PATH (needed to run the Capacitor CLI)."
    exit 1
fi

# ── 1. Build web assets (empty base path so Android webview finds routes at /) ─
#
# Run only `next build`, not the full `deno task build`.  The latter also runs
# scripts/build.ts which overwrites out/index.html with the GitHub Pages landing
# page.  For Android we want app/page.tsx (the game) at the root so Capacitor
# loads the game directly at https://localhost/ with no redirect needed.

echo "==> Building web assets (no base path)..."
NEXT_PUBLIC_BASE_PATH="" deno run -A npm:next build

# ── 2. Sync web assets into the Android project ──────────────────────────────
#
# `cap sync android` does three things:
#   a) Copies out/ → android/app/src/main/assets/public/
#   b) Writes capacitor.config.json and capacitor.plugins.json into assets
#   c) Updates android/capacitor.settings.gradle with plugin project paths

echo "==> Syncing to Android via Capacitor..."
./node_modules/.bin/cap sync android

# ── 3. Write local.properties (Gradle needs the SDK path) ────────────────────

LOCAL_PROPS="android/local.properties"
if [[ ! -f "$LOCAL_PROPS" ]]; then
    echo "sdk.dir=${ANDROID_HOME}" > "$LOCAL_PROPS"
    echo "==> Created $LOCAL_PROPS"
else
    # Update sdk.dir in case ANDROID_HOME changed since last run
    if ! grep -q "sdk.dir=" "$LOCAL_PROPS"; then
        echo "sdk.dir=${ANDROID_HOME}" >> "$LOCAL_PROPS"
    fi
fi

# ── 4. Build the APK with Gradle ─────────────────────────────────────────────

echo "==> Building debug APK..."
(cd android && ./gradlew assembleDebug)

APK="android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "Done.  APK: $APK"
