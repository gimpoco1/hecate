# Hecate on TestFlight and the App Store

## What is already configured

- Capacitor 7 packages the production web build from `dist/` inside the iOS app.
- Bundle identifier: `com.gimpoco.hecate`
- App version: `1.0`; build number: `1`
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

## Upload to TestFlight

1. In App Store Connect, create an app named **Hecate** with the same bundle identifier.
2. In Xcode, select **Any iOS Device (arm64)**, then **Product > Archive**.
3. In Organizer, choose **Distribute App > App Store Connect > Upload**.
4. Wait for processing, then assign the build to an internal TestFlight group.
5. External TestFlight users require Apple's beta review.

Increment `CURRENT_PROJECT_VERSION` for every upload. Keep `MARKETING_VERSION` at `1.0` until the public version changes.

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
