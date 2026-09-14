# Hecate on TestFlight and the App Store

## What is already configured

- Capacitor 7 packages the production web build from `dist/` inside the iOS app.
- Bundle identifier: `com.gimpoco.hecate`
- App version: `1.0.1`; local build number: `5`
- Background location is enabled only while the user has started a walk.
- Both foreground and always-location purpose strings are in `Info.plist`.
- The Hecate torch logo is installed as the 1024 x 1024 App Store icon.

## Finish the native setup

1. Install and launch Xcode once, accepting any license or component prompts.
2. If command-line tools still point elsewhere, run:

   ```bash
   sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
   ```

3. From the project root, run `npm run ios:open`.
4. In Xcode, select the **App** target, then **Signing & Capabilities**.
5. Choose your Apple Developer team and confirm the bundle identifier.
6. Confirm **Background Modes** includes **Location updates**.
7. Test on a physical iPhone: start a walk, lock the display, walk far enough to create several points, reopen Hecate, and verify the route continued.

## Xcode Cloud: build and upload on every `main` change

The repository contains `ci_scripts/ci_post_clone.sh`. Xcode Cloud runs it after
cloning the project; it installs the exact JavaScript dependencies, rebuilds the
web app, and syncs the generated bundle into Capacitor before Xcode archives the
native app.

Set up the workflow once in Xcode (use `ios/App/App.xcworkspace`, not the
`.xcodeproj`):

1. Open **Product > Xcode Cloud > Create Workflow** and select the **App**
   product and your Apple Developer team. Connect the repository when prompted.
2. If needed, create or select the **Hecate** App Store Connect record with
   bundle ID `com.gimpoco.hecate`.
3. Name the workflow `Main → TestFlight`. Set its start condition to **Branch
   Changes** for exactly `main`; remove the suggested pull-request condition.
   Leave **Auto-cancel builds** enabled so only the newest push is built.
4. Add an **Archive** action for the shared `App` scheme and use the current
   released Xcode version.
5. Add the post-action **TestFlight > Distribute to TestFlight**, select the
   internal testing group(s), and save. This uploads each successful `main`
   archive to App Store Connect and makes it available to those testers.
6. Start one build manually and confirm the resulting build appears in App Store
   Connect > Hecate > TestFlight.

Xcode Cloud assigns and increments its own integer build number for every cloud
build. Do **not** change `CURRENT_PROJECT_VERSION` for this workflow. The
version that testers see comes from `MARKETING_VERSION` in the project.

### The release routine

Before merging a change to `main`, bump the App Store version once and commit the
result:

```bash
npm run ios:version -- patch
```

Use `minor` or `major` instead of `patch`, or supply an exact version:

```bash
npm run ios:version -- 1.1.0
```

This updates the shared Debug and Release `MARKETING_VERSION` values together.
After that commit reaches `main`, Xcode Cloud creates an archive and uploads it
to TestFlight automatically. A public App Store release still requires the
normal App Store Connect version metadata and App Review submission; TestFlight
distribution does not publish directly to the App Store.

## Manual Upload to TestFlight

1. In App Store Connect, create an app named **Hecate** with the same bundle identifier.
2. In Xcode, select **Any iOS Device (arm64)**, then **Product > Archive**.
3. In Organizer, choose **Distribute App > App Store Connect > Upload**.
4. Wait for processing, then assign the build to an internal TestFlight group.
5. External TestFlight users require Apple's beta review.

For a manual archive, increment `CURRENT_PROJECT_VERSION` for every upload. For
the Xcode Cloud workflow above, bump `MARKETING_VERSION` with `npm run
ios:version -- patch` instead; Xcode Cloud manages the cloud build number.

## URLs and listing information

The binary does not need a hosted web-app URL: Capacitor embeds the built site in the app. TestFlight also does not require the web app itself to be public.

For a public App Store release, prepare:

- a public **Privacy Policy URL** explaining location collection, authenticated Supabase storage, retention, deletion, and contact details;
- a public **Support URL** with a way for users to contact you;
- App Privacy answers matching the app's actual production configuration;
- screenshots, description, category, age rating, and review notes.

A marketing website is optional. A small GitHub Pages, Squarespace, or similar site can host the required privacy and support pages; it does not need to host the app itself.

## Suggested App Review note

Hecate reveals portions of a map along a walk selected and started by the user. Location updates must continue while the display is locked so the route remains complete. A prominent Finish walk control stops tracking. Background location is not used when a walk is inactive.
