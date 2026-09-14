#!/bin/sh

# Xcode Cloud runs this after cloning the repository and before xcodebuild.
# Capacitor embeds the web bundle in the native app, so build and copy it here.
set -eu

cd "$CI_PRIMARY_REPOSITORY_PATH"
npm ci
npm run build

# Copy the built web app without running Capacitor's iOS dependency updater.
# The updater runs pod install internally; invoking CocoaPods directly below is
# more reliable in Xcode Cloud and guarantees the workspace support files exist.
npx cap copy ios

# Pods are intentionally ignored by Git, so install from the checked-in lockfile
# to generate the Pods-App.*.xcconfig files the workspace references.
(
  cd ios/App
  pod install --deployment
)
