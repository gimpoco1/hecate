#!/bin/sh

# Xcode Cloud runs this after cloning the repository and before xcodebuild.
# Capacitor embeds the web bundle in the native app, so build and sync it here.
set -eu

cd "$CI_PRIMARY_REPOSITORY_PATH"
npm ci
npm run ios:sync
