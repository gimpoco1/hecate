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

osascript - "$xcode_application" "$workspace" <<'APPLESCRIPT'
on run arguments
  using terms from application "Xcode"
    set xcodeApplication to item 1 of arguments
    set workspacePath to item 2 of arguments
    tell application xcodeApplication
      open (POSIX file workspacePath)
      activate
      set targetWorkspace to missing value
      repeat 120 times
        set matchingWorkspaces to workspace documents whose path is workspacePath
        if (count of matchingWorkspaces) > 0 then
          set candidate to item 1 of matchingWorkspaces
          if loaded of candidate then
            set targetWorkspace to candidate
            exit repeat
          end if
        end if
        delay 0.5
      end repeat
      if targetWorkspace is missing value then
        error "Xcode did not finish loading workspace: " & workspacePath
      end if

      set schemeName to name of active scheme of targetWorkspace
      set runResult to run targetWorkspace
      repeat 120 times
        set runStatus to status of runResult
        if runStatus is running or runStatus is succeeded then
          return "Xcode started Run for scheme " & schemeName & " in " & workspacePath
        end if
        if runStatus is failed or runStatus is error occurred or runStatus is cancelled then
          set failureMessage to error message of runResult
          if failureMessage is missing value then set failureMessage to runStatus as text
          error "Xcode could not run scheme " & schemeName & ": " & failureMessage & return & (build log of runResult)
        end if
        delay 0.5
      end repeat
      error "Xcode has not started Run for scheme " & schemeName & ". Check Xcode for an open dialog or an unavailable run destination."
    end tell
  end using terms from
end run
APPLESCRIPT
