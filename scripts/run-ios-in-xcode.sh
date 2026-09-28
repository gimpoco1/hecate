#!/bin/zsh

set -euo pipefail

project_root="${0:A:h:h}"
workspace="$project_root/ios/App/App.xcworkspace"

cd "$project_root"
npm run ios:sync

if [[ ! -d "$workspace" ]]; then
  print -u2 "Xcode workspace not found: $workspace"
  exit 1
fi

open -a Xcode "$workspace"

osascript <<'APPLESCRIPT'
tell application "Xcode" to activate

tell application "System Events"
  if UI elements enabled is false then
    error "Allow your terminal app to control Xcode in System Settings > Privacy & Security > Accessibility, then run the command again."
  end if

  tell process "Xcode"
    repeat 40 times
      if exists menu item "Run" of menu "Product" of menu bar 1 then
        if enabled of menu item "Run" of menu "Product" of menu bar 1 then
          click menu item "Run" of menu "Product" of menu bar 1
          return
        end if
      end if
      delay 0.5
    end repeat
  end tell
end tell

error "Xcode did not become ready to run the selected destination."
APPLESCRIPT
