# Hecate

An iOS-friendly discovery map inspired by Hecate, torch-bearing goddess of crossroads and thresholds. It reveals the world along the paths you walk.

## Run locally

```bash
npm install
npm run dev
```

The app uses MapLibre GL JS and OpenFreeMap's OpenStreetMap-derived vector tiles. No map API key is required.

## Cross-device sync

1. Create a Supabase project and run `supabase.sql` in its SQL editor.
2. Copy `.env.example` to `.env.local` and add the project URL and anonymous key.
3. Enable email OTP authentication in Supabase.

Without Supabase configuration, discoveries remain functional and are stored locally on the device.

## iOS and background tracking

The web version is installable from Safari with **Share → Add to Home Screen**. iOS can suspend Safari and installed web apps after the screen locks, so uninterrupted background tracking is intentionally isolated behind `LocationTracker` in `src/location.ts`.

For the App Store version, package the same app with Capacitor and replace `WebLocationTracker` with a native iOS background-location implementation. The native project will also need the appropriate location usage descriptions, Background Modes → Location updates, and an App Review explanation of the user benefit.

## Production notes

OpenFreeMap's public tiles are free and require attribution, which MapLibre displays automatically. It does not offer an SLA; a larger production deployment should budget for hosted vector tiles or self-hosting while keeping the same MapLibre UI.
