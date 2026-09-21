# Hecate development guide

## Run locally

```bash
npm install
npm run dev
```

The app uses Apple MapKit JS through Apple's official loader. Before running it, create a Maps identifier and private key in the Apple Developer portal, then either:

- generate a Maps token and set `VITE_MAPKIT_TOKEN` in `.env.local`; or
- configure the server-side token endpoint with `APPLE_MAPS_TEAM_ID`, `APPLE_MAPS_KEY_ID`, and `APPLE_MAPS_PRIVATE_KEY`.

The private `.p8` key must never use a `VITE_` prefix or be committed. In `.env.local`, keep it in one quoted value with literal `\\n` separators, for example `APPLE_MAPS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----"`. `npm run dev` serves `/api/mapkit-token` with the same server-side handler as production, so it needs `APPLE_MAPS_TEAM_ID`, `APPLE_MAPS_KEY_ID`, and that correctly formatted key. Every browser token is signed with its exact page origin and the `mapkit_js` scope. Set `APPLE_MAPS_ALLOWED_ORIGINS` to a comma-separated allowlist for every production web origin and `capacitor://localhost`; add `http://localhost:5173` for local Vite development. Set `APPLE_MAPS_ORIGIN` only as the fallback for non-browser token requests. The native Capacitor build fetches its token from `https://hecate-eta.vercel.app/api/mapkit-token` by default; override that URL with `VITE_MAPKIT_TOKEN_ENDPOINT` if the production host changes.

## Cross-device sync

1. Create a Supabase project and run `supabase.sql` in its SQL editor. Existing projects can safely run the updated script to migrate their old point rows.
2. Copy `.env.example` to `.env.local` and add the project URL and anonymous key.
3. Enable Email authentication in Supabase. Keep password sign-in, new-user signup, and email OTP enabled. With **Confirm email** enabled, new password accounts receive a confirmation link before their first session starts.
4. In **Authentication → URL Configuration**, set the Site URL to `https://hecate-eta.vercel.app/` and add both redirect URLs:
   - `https://hecate-eta.vercel.app/`
   - `hecate://auth/callback`

Magic links opened from the website return to the deployed browser app. Links requested inside the Capacitor app use the `hecate://` URL scheme to reopen Hecate and complete the Supabase session.

Supabase configuration and a signed-in account are required to record discoveries. Walk points and discovery cells live in memory while recording and are written only to the authenticated user's Supabase rows; they are not persisted in browser storage. An unfinished walk cannot be recovered after a force-quit or page reload.

The same SQL script installs the authenticated `delete_account` function used by the account dialog. It deletes the current user from Supabase Auth; foreign-key cascades then remove that user's walks, discovery cells, and legacy discovery points. Rerun `supabase.sql` on an existing project whenever this function is added or updated.

Completed walks are stored as simplified PostGIS lines. Discovered territory is stored as unique zoom-20 cells, so walking through the same place again does not create more discovery rows. The legacy `discovery_points` table is retained after migration for verification and can be removed in a later release. See [STORAGE.md](STORAGE.md) for the model and tradeoffs.

## iOS and background tracking

The web version is installable from Safari with **Share → Add to Home Screen**. iOS can suspend Safari and installed web apps after the screen locks, so uninterrupted tracking requires the native Capacitor package in `ios/`.

The native build uses `@capacitor-community/background-geolocation` while a walk is active. Its iOS target includes the required location usage descriptions and `location` background mode.

```bash
# Rebuild the web app and synchronize it into Xcode
npm run ios:sync

# Synchronize and open the Xcode workspace
npm run ios:open
```

The bundle identifier is currently `com.gimpoco.hecate`. See [APP_STORE.md](APP_STORE.md) for signing, TestFlight, and App Store submission steps.

## Production notes

MapKit JS displays Apple's required attribution and logo itself. Apple currently includes 250,000 map views and 25,000 service calls per day with an Apple Developer Program membership; use the MapKit JS dashboard to monitor usage.
