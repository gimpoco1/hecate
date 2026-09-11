# Hecate

An iOS-friendly discovery map inspired by Hecate, torch-bearing goddess of crossroads and thresholds. It reveals the world along the paths you walk.

## Run locally

```bash
npm install
npm run dev
```

The app uses MapLibre GL JS and OpenFreeMap's OpenStreetMap-derived vector tiles. No map API key is required.

## Cross-device sync

1. Create a Supabase project and run `supabase.sql` in its SQL editor. Existing projects can safely run the updated script to migrate their old point rows.
2. Copy `.env.example` to `.env.local` and add the project URL and anonymous key.
3. Enable email OTP authentication in Supabase.

Without Supabase configuration, discoveries remain functional and are stored locally on the device.

Completed walks are stored as simplified PostGIS lines. Discovered territory is stored as unique zoom-20 cells, so walking through the same place again does not create more discovery rows. The legacy `discovery_points` table is retained after migration for verification and can be removed in a later release. See `docs/STORAGE.md` for the model and tradeoffs.

## iOS and background tracking

The web version is installable from Safari with **Share → Add to Home Screen**. iOS can suspend Safari and installed web apps after the screen locks, so uninterrupted tracking requires the native Capacitor package in `ios/`.

The native build uses `@capacitor-community/background-geolocation` while a walk is active. Its iOS target includes the required location usage descriptions and `location` background mode.

```bash
# Rebuild the web app and synchronize it into Xcode
npm run ios:sync

# Synchronize and open the Xcode workspace
npm run ios:open
```

The bundle identifier is currently `com.gimpoco.hecate`. See `docs/APP_STORE.md` for signing, TestFlight, and App Store submission steps.

## Production notes

OpenFreeMap's public tiles are free and require attribution, which MapLibre displays automatically. It does not offer an SLA; a larger production deployment should budget for hosted vector tiles or self-hosting while keeping the same MapLibre UI.
