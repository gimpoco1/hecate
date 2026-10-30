#!/bin/zsh

set -euo pipefail

project_root="${0:A:h:h}"
workspace="$project_root/ios/App/App.xcworkspace"

developer_directory="${DEVELOPER_DIR:-$(xcode-select --print-path)}"
if [[ "$developer_directory" == *.app ]]; then
  developer_directory="$developer_directory/Contents/Developer"
fi
xcode_application="${developer_directory:A:h:h}"
if [[ ! -x "$xcode_application/Contents/MacOS/Xcode" ]]; then
  print -u2 "The selected developer directory is not a full Xcode installation: $developer_directory. Select Xcode with sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer. During a temporary override, set DEVELOPER_DIR to the Xcode app or its Contents/Developer directory."
  exit 1
fi
export DEVELOPER_DIR="$developer_directory"

cd "$project_root"
npm run ios:sync

if [[ ! -d "$workspace" ]]; then
  print -u2 "Xcode workspace not found: $workspace"
  exit 1
fi

open -a "$xcode_application" "$workspace"

osascript - "$xcode_application" <<'APPLESCRIPT'
on run arguments
set xcodeApplication to item 1 of arguments
tell application xcodeApplication to activate

tell application "System Events"
  if UI elements enabled is false then
    error "Allow your terminal app to control Xcode in System Settings > Privacy & Security > Accessibility, then run the command again."
  end if

  tell (first application process whose application file is (POSIX file xcodeApplication as alias))
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
end run
APPLESCRIPT
