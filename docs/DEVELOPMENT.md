# Hecate development guide

## Run locally

```bash
npm install
npm run dev
```

In production, every browser redirects from `/` to the public leaderboard at `/leaderboard`. During `npm run dev`, `/` intentionally renders the private app experience in the browser so its map, tracking, journey drawer, and achievements can be tested locally; `/leaderboard` remains available for the public experience. The installed Capacitor app always opens the private app. The native map uses MapLibre GL JS with OpenFreeMap's OpenStreetMap-derived vector tiles; no map API key is required.

The development tools panel contains notification and achievement tests. It can be hidden with its close button, and that preference is stored locally under `hecate:dev-tools-visible`. The small **Dev tools** control restores the panel. Neither control is rendered in production.

## Cross-device sync

1. Create a Supabase project, bootstrap it with `supabase.sql`, and apply the tracked migrations in order. Existing projects must migrate any rows still in `discovery_points` before rerunning the bootstrap script; it removes that legacy table once empty. Follow the [security deployment requirements](../SECURITY.md#deployment-and-release-requirements) for the current grants and server functions.
2. Copy `.env.example` to `.env.local` and add the project URL and anonymous key.
3. Enable Email authentication in Supabase. Keep password sign-in, new-user signup, and email OTP enabled. With **Confirm email** enabled, new password accounts receive a confirmation link before their first session starts.
4. Configure authentication redirects, the trusted publisher, and native domain associations using the [security deployment requirements](../SECURITY.md#deployment-and-release-requirements). That document owns the current callback paths and release requirements.

Supabase configuration and a signed-in account are required to record discoveries. Walk points are journaled in account-scoped device storage while recording, then uploaded to Supabase. An interrupted walk can be recovered through its last accepted GPS sample.

The account dialog uses the authenticated `delete_account` function. See [Security](../SECURITY.md#issues-addressed-and-current-controls) for public-snapshot cleanup and [retention boundaries](../SECURITY.md#remaining-boundaries) for feedback and support email.

The sharing panel controls the public name and selected cities. Joining is explicit; after joining, the app refreshes the selected published snapshot following a completed journey. The web client subscribes to Supabase Realtime and polls every 20 seconds as a fallback. [Security](../SECURITY.md#data-and-trust-boundaries) documents the public/private boundary and server publishing authority.

Public names are reserved case-insensitively, with one rename per account even across unpublishing. Use the current migration sequence rather than historical leaderboard installers when setting up or upgrading an environment.

Named city milestones use the same canonical discovered-city distance: First Footprint and one star at 5 km, Pathfinder and two stars at 25 km, and City Cartographer and three stars at 100 km. Private progress stays in the installed app. The public explorer profile derives earned milestones only from city totals the user explicitly published, so an unshared city cannot reveal a milestone or progress. Artwork is mapped to `public/achievements/first-footprint.png`, `pathfinder.png`, and `city-cartographer.png`.

Personal achievements are recomputed from synchronized route history with the same new-ground algorithm used by the map. Publishing includes the computed earned achievement IDs; city selection does not individually select achievements. See [Security](../SECURITY.md#data-and-trust-boundaries) for the sharing boundary. Artwork lives in `public/achievements/<achievement-id>.png`; a Hecate fallback is rendered until a PNG is supplied.

The achievement catalog deliberately mixes approachable and long-term goals. Current thresholds are: 8 km of new ground in one walk; a 5 km walk that is at least 80% new; a 5 km loop with 2 km new ground; 500 m on three consecutive days; 500 m on seven days within two weeks; 500 m in one city on ten days; 2 km in five cities; and an 8 km walk with 3 km new ground that remains at least 50% familiar.

The first complete history load establishes an achievement baseline. Later unlocks and acknowledgement timestamps are synchronized through the private `user_achievement_unlocks` table installed by `scripts/install-private-achievement-unlocks.sql`. For private app celebrations, local achievement evaluation determines which achievements are earned; local storage and Supabase coordinate pending celebrations and acknowledgement across devices. Native local notifications are emitted only for genuinely new unlocks.

Completed walks retain every accepted route sample in PostGIS lines. Discovered territory is stored as unique zoom-20 cells, so walking through the same place again does not create more discovery rows. See [STORAGE.md](STORAGE.md) for the model and tradeoffs.

## iOS and background tracking

Browsers can run the discovery experience while the page remains active, but they cannot provide reliable locked-screen tracking. Uninterrupted tracking uses the Capacitor package in `ios/`.

The native build uses `@capacitor-community/background-geolocation` while a walk is active. Its iOS target includes the required location usage descriptions and `location` background mode. With no walk active, a foreground watcher keeps the position marker current; the locate control only centers the map. The optional Discovery reminders switch replaces that watcher with a background-capable one. Its samples are held in memory, never added to discovery history. A local notification suggests starting a recording after five minutes and at least 150 m of movement through unmapped areas; returning to mapped ground resets the candidate. Background reminders work while the app process is running; a force quit or system termination ends the in-memory candidate. Check all three cases on an iPhone: idle with reminders off stops location on backgrounding, idle with reminders on continues monitoring and can notify, and an explicitly started walk continues recording after lock.

To test on a development iPhone build, select Xcode as the developer directory and run `VITE_ENABLE_DEV_TOOLS=1 npm run ios:sync`, then launch the app from Xcode. Sign in, enable Discovery reminders in Account & sync, and leave the play button off. The development panel shows whether the current position is in an unmapped area and the live five-minute/150 m progress. Walk in an unmapped area to test the real GPS path. Real reminders have a two-hour cooldown, shown in the panel. Its **Simulate 5-min discovery** button feeds synthetic points through the same detector without changing your map or reminder cooldown; on iPhone it schedules an actual local notification five seconds later, so you can lock the phone to check delivery. The panel is omitted from normal builds without `VITE_ENABLE_DEV_TOOLS=1`.

The same panel's **Test achievement unlock** button opens the production achievement celebration and schedules its local notification on a native build. Repeated presses cycle through the badge catalog. It is preview-only and does not add achievements to the account or its persisted celebration queue.

```bash
# Rebuild the web app and synchronize it into Xcode
npm run ios:sync

# Synchronize and open the Xcode workspace
npm run ios:open
```

The bundle identifier is currently `com.gimpoco.hecate`. See [APP_STORE.md](APP_STORE.md) for signing, TestFlight, and App Store submission steps.

## Production notes

OpenFreeMap's public tiles are free and require attribution, which MapLibre displays automatically. It does not offer an SLA; a larger production deployment should budget for hosted vector tiles or self-hosting while keeping the same MapLibre UI.
