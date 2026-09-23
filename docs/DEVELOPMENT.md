# Hecate development guide

## Run locally

```bash
npm install
npm run dev
```

In production, every browser redirects from `/` to the public leaderboard at `/leaderboard`. During `npm run dev`, `/` intentionally renders the private app experience in the browser so its map, tracking, journey drawer, and achievements can be tested locally; `/leaderboard` remains available for the public experience. The installed Capacitor app always opens the private app. The native map uses MapLibre GL JS with OpenFreeMap's OpenStreetMap-derived vector tiles; no map API key is required.

The development test-routes panel can be hidden with its close button. That preference is stored locally under `hecate:dev-tools-visible`; the small **Dev tools** control restores the panel. Neither control is rendered in production.

## Cross-device sync

1. Create a Supabase project and run `supabase.sql` in its SQL editor. Existing projects must migrate any rows still in `discovery_points` before rerunning the script; it removes that legacy table once empty.
   The Hecate hosted project was cleaned with `scripts/cleanup-hosted-discovery.sql` and `scripts/install-city-region-compatibility.sql` on 2026-09-21. Those scripts are one-time records, not setup steps for a fresh project.
2. Copy `.env.example` to `.env.local` and add the project URL and anonymous key.
3. Enable Email authentication in Supabase. Keep password sign-in, new-user signup, and email OTP enabled. With **Confirm email** enabled, new password accounts receive a confirmation link before their first session starts.
4. In **Authentication → URL Configuration**, set the Site URL to `https://hecate-eta.vercel.app/` and add these redirect URLs:
   - `https://hecate-eta.vercel.app/`
   - `https://hecate-eta.vercel.app/leaderboard`
   - `hecate://auth/callback`

Magic links opened from the website return to the deployed browser app. Links requested inside the Capacitor app use the `hecate://` URL scheme to reopen Hecate and complete the Supabase session.

Supabase configuration and a signed-in account are required to record discoveries. Walk points are journaled in account-scoped device storage while recording, then uploaded to Supabase. An interrupted walk can be recovered through its last accepted GPS sample.

The same SQL script installs the authenticated `delete_account` function used by the account dialog. It deletes the current user from Supabase Auth; foreign-key cascades then remove that user's walks, discovery cells, and discovered cities. Rerun `supabase.sql` on an existing project whenever this function is added or updated.

It also installs the public leaderboard tables and the `publish_leaderboard_snapshot`, `unpublish_leaderboard_snapshot`, and `get_my_leaderboard_entry_id` functions. The public tables contain an opaque entry ID and aggregate totals only. Account ownership is kept in a separate RLS-protected table, and private routes, cells, coordinates, and city boundaries are never copied into a leaderboard snapshot. The web client subscribes to Supabase Realtime and polls every 20 seconds as a fallback. Users must explicitly publish or update a snapshot; private discovery sync does not update the leaderboard automatically.

Existing hosted projects must also run `scripts/install-leaderboard-sharing-controls.sql`. It reserves public names case-insensitively in a private profile table, allows one rename per account even across unpublishing, and installs the profile RPC used by the sharing panel. Users choose which city aggregates to include; unselected cities and their distance are omitted from the public snapshot.

City passport badges are deterministic milestones based on the same canonical discovered-city distance: First Footprint at 1 km, Pathfinder at 5 km, and City Cartographer at 20 km. Private progress stays in the installed app. The public explorer profile derives earned badges only from city totals the user explicitly published, so an unshared city cannot reveal a badge or progress.

Personal achievements are recomputed from synchronized route history with the same new-ground algorithm used by the map. `scripts/install-leaderboard-achievements.sql` adds the public achievement-ID table and updates the publishing RPC. The public snapshot contains only achievement IDs selected by the user—never the qualifying route, date, activity history, or location. Artwork lives in `public/achievements/<achievement-id>.png`; a Hecate fallback is rendered until a PNG is supplied.

Completed walks retain every accepted route sample in PostGIS lines. Discovered territory is stored as unique zoom-20 cells, so walking through the same place again does not create more discovery rows. See [STORAGE.md](STORAGE.md) for the model and tradeoffs.

## iOS and background tracking

Browsers can run the discovery experience while the page remains active, but they cannot provide reliable locked-screen tracking. Uninterrupted tracking uses the Capacitor package in `ios/`.

The native build uses `@capacitor-community/background-geolocation` while a walk is active. Its iOS target includes the required location usage descriptions and `location` background mode. With no walk active, a foreground watcher keeps the position marker current; the locate control only centers the map. The optional Discovery reminders switch replaces that watcher with a background-capable one. Its samples are held in memory, never added to discovery history. A local notification suggests starting a recording after five minutes and at least 150 m of movement through unmapped areas; returning to mapped ground resets the candidate. Background reminders work while the app process is running; a force quit or system termination ends the in-memory candidate. Check all three cases on an iPhone: idle with reminders off stops location on backgrounding, idle with reminders on continues monitoring and can notify, and an explicitly started walk continues recording after lock.

To test on a development iPhone build, select Xcode as the developer directory and run `VITE_ENABLE_DEV_TOOLS=1 npm run ios:sync`, then launch the app from Xcode. Sign in, enable Discovery reminders in Account & sync, and leave the play button off. The development panel shows whether the current position is in an unmapped area and the live five-minute/150 m progress. Walk in an unmapped area to test the real GPS path. Real reminders have a two-hour cooldown, shown in the panel. Its **Simulate 5-min discovery** button feeds synthetic points through the same detector without changing your map or reminder cooldown; on iPhone it schedules an actual local notification five seconds later, so you can lock the phone to check delivery. The panel is omitted from normal builds without `VITE_ENABLE_DEV_TOOLS=1`.

```bash
# Rebuild the web app and synchronize it into Xcode
npm run ios:sync

# Synchronize and open the Xcode workspace
npm run ios:open
```

The bundle identifier is currently `com.gimpoco.hecate`. See [APP_STORE.md](APP_STORE.md) for signing, TestFlight, and App Store submission steps.

## Production notes

OpenFreeMap's public tiles are free and require attribution, which MapLibre displays automatically. It does not offer an SLA; a larger production deployment should budget for hosted vector tiles or self-hosting while keeping the same MapLibre UI.
