# Hecate development guide

## Run locally

```bash
npm install
npm run dev
```

The app uses MapLibre GL JS and OpenFreeMap's OpenStreetMap-derived vector tiles. No map API key is required.

## Cross-device sync

1. Create a Supabase project and run `supabase.sql` in its SQL editor. Existing projects must migrate any rows still in `discovery_points` before rerunning the script; it removes that legacy table once empty.
   The Hecate hosted project was cleaned with `scripts/cleanup-hosted-discovery.sql` and `scripts/install-city-region-compatibility.sql` on 2026-09-21. Those scripts are one-time records, not setup steps for a fresh project.
2. Copy `.env.example` to `.env.local` and add the project URL and anonymous key.
3. Enable Email authentication in Supabase. Keep password sign-in, new-user signup, and email OTP enabled. With **Confirm email** enabled, new password accounts receive a confirmation link before their first session starts.
4. In **Authentication → URL Configuration**, set the Site URL to `https://hecate-eta.vercel.app/` and add both redirect URLs:
   - `https://hecate-eta.vercel.app/`
   - `hecate://auth/callback`

Magic links opened from the website return to the deployed browser app. Links requested inside the Capacitor app use the `hecate://` URL scheme to reopen Hecate and complete the Supabase session.

Supabase configuration and a signed-in account are required to record discoveries. Walk points are journaled in account-scoped device storage while recording, then uploaded to Supabase. An interrupted walk can be recovered through its last accepted GPS sample.

The same SQL script installs the authenticated `delete_account` function used by the account dialog. It deletes the current user from Supabase Auth; foreign-key cascades then remove that user's walks, discovery cells, and discovered cities. Rerun `supabase.sql` on an existing project whenever this function is added or updated.

Completed walks retain every accepted route sample in PostGIS lines. Discovered territory is stored as unique zoom-20 cells, so walking through the same place again does not create more discovery rows. See [STORAGE.md](STORAGE.md) for the model and tradeoffs.

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

OpenFreeMap's public tiles are free and require attribution, which MapLibre displays automatically. It does not offer an SLA; a larger production deployment should budget for hosted vector tiles or self-hosting while keeping the same MapLibre UI.
