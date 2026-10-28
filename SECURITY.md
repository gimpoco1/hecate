# Security

Reviewed and verified on **28 October 2026**. This document describes the implemented controls, the risks they address, and the limits of the verification. It is not an independent penetration-test report or a security certification.

## Answering questions about Hecate's security

> Hecate uses Supabase authentication and account-scoped database policies to protect private discovery history. Public sharing is opt-in and publishes selected city aggregates and earned achievement IDs, rather than routes or exact coordinates. Leaderboard scores are computed on the server from saved history, and clients cannot write public scores directly. The project also enforces input limits and abuse quotas, restricts browser script execution, and avoids recording coordinates or account details in application error diagnostics. These controls have automated and live integration coverage, but they do not prove GPS authenticity or make the application immune to every attack. Native authentication changes require an updated app release.

## Data and trust boundaries

- **Private account data:** walks, discovery cells, discovered-city boundaries, favorite places, and achievement delivery state use Supabase Row Level Security (RLS). Public leaderboard ownership and name-change history are inaccessible to app clients as tables; authenticated profile functions expose only the caller's own profile.
- **Public data:** an opted-in leaderboard entry exposes an opaque entry ID, public name, selected city names and totals, achievement IDs, and update metadata. The total includes only the selected cities. Achievement IDs can imply activity patterns even though qualifying routes and timestamps are not published.
- **Authentication:** the client uses Supabase's public anon key, not a service-role key. Callback handling accepts authorization codes on exact HTTPS paths and requires the PKCE verifier held by the app or browser that started authentication. It rejects supplied access/refresh tokens and removes callback credentials from browser history.
- **Trusted publishing:** the Edge Function verifies the caller with Supabase Auth and reads history with that caller's JWT and RLS. A separate server-only service client stores the computed snapshot for the verified user. Requests supply a name, city selections, and a time zone; supplied score or achievement claims are not used.
- **Feedback:** submissions require authentication and are not readable by app clients. The database webhook uses a separate secret and fails closed when that secret is missing. Alerts go to the fixed support mailbox as plain text; an optional reply address does not change the alert recipient.

The implementation lives in [the database schema](supabase.sql), [tracked migrations](supabase/migrations), [authentication](src/auth.ts), and [the trusted publisher](supabase/functions/publish-leaderboard/index.ts). The spatial data model is documented separately in [STORAGE.md](docs/STORAGE.md).

## Issues addressed and current controls

| Risk identified | Implemented control | Source of truth |
| --- | --- | --- |
| Crafted callbacks could install an attacker-supplied session; custom-scheme authentication links could be intercepted by another app. | PKCE code exchange replaces direct token acceptance. Callback paths are exact. Native configuration uses HTTPS App Links/Universal Links with public Android and Apple association files. Native rollout is required for installed apps to gain these protections. | [Auth](src/auth.ts), [client configuration](src/storage.ts), [domain associations](public/.well-known), [Android manifest](android/app/src/main/AndroidManifest.xml), [iOS entitlement](ios/App/App/Hecate.entitlements) |
| Account deletion could remove the private owner link while leaving the public snapshot behind. | An Auth-user deletion trigger removes the associated public entry before ownership is lost. City aggregates cascade from that entry. The trigger also covers administrator-driven account deletion. | [Security migration](supabase/migrations/20261028120000_harden_api_boundaries.sql), `private.delete_user_public_data` |
| Repeated feedback submissions could create unlimited alerts from one account. | Atomic database quotas limit submissions per user and across the project. Retrying an existing submission ID for the same user does not insert another row or send another alert. | [Security migration](supabase/migrations/20261028120000_harden_api_boundaries.sql), `submit_app_feedback` |
| Clients could submit invented public distances, coverage percentages, and achievement IDs. | Authenticated clients cannot execute the old publishing functions or trusted storage function. The Edge Function calculates values using the shared discovery and achievement formulas. Expiring publishing tickets prevent an in-flight request from restoring a snapshot after unpublishing. | [Publisher](supabase/functions/publish-leaderboard/index.ts), [shared calculation](src/leaderboardSnapshot.ts), [security migration](supabase/migrations/20261028120000_harden_api_boundaries.sql) |
| Direct writes could bypass walk validation; some fields and geometry had insufficient bounds. | Direct authenticated walk inserts/updates are revoked. The save function derives ownership from authentication. Database constraints and triggers validate coordinates, point counts, timestamps, geometry, finite distances, and text sizes. RPC writes cannot bypass the triggers. | [Security migration](supabase/migrations/20261028120000_harden_api_boundaries.sql), [history response validation](src/discoveryStorage.ts) |
| Leaderboard reads downloaded every participant's city details, and realtime events amplified full reloads. | Public queries return bounded city summaries and explorer pages. Full explorer profiles load on demand, and realtime refreshes are coalesced. Private history uses bounded pages while still loading the complete account history. | [Leaderboard queries](src/leaderboard.ts), [UI](src/components/WebLeaderboard.tsx), [history loading](src/discoveryStorage.ts), [security migration](supabase/migrations/20261028120000_harden_api_boundaries.sql) |
| The website lacked browser security headers. | CSP restricts scripts to the same origin and explicitly lists required resource hosts. Framing is denied; `nosniff`, a no-referrer policy, and HTTPS upgrading are configured. Inline styles remain permitted for the existing UI. These HTTP headers protect the hosted website; they do not establish an equivalent CSP for the bundled native WebView. | [Vercel configuration](vercel.json) |
| Dependency advisories affected development tools and, in a separate audit, the feedback function's SMTP library. | Patched versions and lockfiles cover both the npm project and Deno functions. A scoped Xcode-parser override avoids downgrading Capacitor. Development and preview servers bind to loopback by default. | [Package configuration](package.json), [npm lockfile](package-lock.json), [function dependencies](supabase/functions), [Vite configuration](vite.config.ts) |
| Error diagnostics could contain precise coordinates, account identifiers, or location-bearing URLs. | Application error logging uses restricted name/code/status diagnostics. Location-bearing fields and request details were removed from the affected logs. This does not control infrastructure-provider logs or erase existing logs. | [Diagnostic serializer](src/diagnostics.ts), [routing](src/explorationRouting.ts), [destination search](src/destinationSearch.ts) |

## Enforced limits

These are application controls, not a claim that every service endpoint has a custom rate limiter. Supabase Auth has separately configured platform rate limits.

| Operation or payload | Limit |
| --- | --- |
| New feedback submissions | One per user per 60-second window; five per user per 24-hour window; 100 project-wide per one-hour window |
| Publishing attempts | Six per user per 60-second window; 100 per user per 24-hour window |
| Walk saves | 60 per user per 60-second window |
| Walk geometry | 2–20,000 numeric geographic coordinate pairs with a matching point count |
| Recorded-walk distance | Must not exceed a 15 m/s average over the stored duration; imported routes are excluded from this recorded-walk check |
| City boundary | At most 4 MiB of JSON text and 100,000 points; valid Polygon/MultiPolygon with geographic bounds |
| Publisher request body | 100,000 bytes, counted while streaming before JSON decoding |
| Feedback webhook body | 16,384 bytes, counted while streaming before JSON decoding |
| Public city/explorer pages | At most 50 results per request; city summaries include at most five leaders |
| Private walk-history pages | At most 20 walks per request |

The migration's `NOT VALID` constraints do not scan or rewrite historical rows when installed. They still enforce constraints on new or updated rows. Validation does not retrospectively certify historical discoveries.

## Checklist applicability

The review used a generic app-security checklist, but several examples did not describe Hecate:

- A permissive CORS response alone does not let another origin impersonate a user. The API must still validate a bearer token and enforce authorization. The publisher has an explicit origin allowlist; other Supabase services have their own CORS behavior. CORS is not the account-security boundary.
- No user-image upload/hosting pipeline or user-controlled profile-picture URL feature was found in the reviewed implementation. GPX is parsed as XML rather than inserted as HTML. The reviewed SVG insertion paths use bundled icon artwork. This is not a blanket guarantee against future XSS defects.
- JWT signing is managed by Supabase, rather than an app-defined signing secret with an insecure default. Browser-visible anon/publishable keys are expected; service keys and webhook/SMTP secrets must remain server-side.
- Group administration, brute-forceable invitation codes, an Express JSON body parser, and a public push-sending endpoint were not present. The limits above must not be represented as an Express-wide or gateway-wide request-body limit.

## Deployment and release requirements

Rollout status verified on **28 October 2026**:

- The security migration and both Edge Functions are deployed to the hosted Supabase project.
- The website, security headers, and association files are deployed at [hecate-eta.vercel.app](https://hecate-eta.vercel.app/leaderboard).
- The hosted authentication Site URL was corrected and the minimum password length set to eight characters. Existing Auth rate limits were verified as enabled.
- Native source/configuration is implemented and builds pass, but a new signed native release and physical-device authentication verification remain required. Already-installed versions do not acquire the callback fixes through a backend deployment. The retired publishing endpoint is blocked, so older clients need updating to publish; ordinary recording and private sync remain available.

For another environment or a future rollout:

1. Bootstrap the database if needed, then apply the tracked migrations, including `20261028120000_harden_api_boundaries.sql`. Treat historical install scripts as migration history, not a replacement for the current security migration. Do not restore client execute grants on the legacy publisher or direct walk insert/update privileges.
2. Deploy `publish-leaderboard` and `notify-feedback` using their checked-in configuration and dependencies. Keep the publisher's JWT verification enabled. The feedback webhook intentionally disables the gateway JWT check and instead requires `FEEDBACK_WEBHOOK_SECRET`; its database Vault secret must match. SMTP credentials belong only in function secrets.
3. Configure the canonical hosted origin and exact redirects: `/auth/callback` for native sign-in and `/auth/web-callback` for browser sign-in. Update the origin references in auth code, the publisher, and hosting configuration together when changing domains.
4. Serve both `.well-known` association files publicly over HTTPS, without redirects. Match Android's **Play App Signing** certificate, not merely the upload certificate. Match Apple's application identifier and enable the associated-domain capability in the signed app's provisioning configuration.
5. Release the native apps, then test email confirmation/sign-in on installed builds. PKCE links must return to the installation or browser that requested them. Do not claim native rollout complete solely from a successful web deployment or unsigned build.

## Verification and maintenance

The 28 October 2026 verification included:

- 300 passing application tests, with 11 skipped tests; production build and diff checks; server-function type checks and streamed-body tests.
- Database integration checks for account isolation, denied direct writes, feedback quotas/idempotence, page limits, and account-deletion cleanup. Synthetic database fixtures were run inside transactions that rolled back.
- A live authenticated publisher test using a temporary synthetic account: the legacy API was denied, supplied scores/achievements were ignored, and a short saved route produced a server-calculated result. The account and its private/public data were removed afterward.
- Live browser checks for city rankings and on-demand explorer profiles, zero observed CSP violations, rejected session-token injection, and removal of callback credentials from the URL.
- Successful unsigned iOS simulator and Android debug builds. No physical-device sign-in claim is made.
- Zero known vulnerabilities reported by the npm audit and both Deno lockfile audits. The patched SMTP library generated a message through an in-memory transport without sending mail; the deployed webhook booted and rejected unauthenticated requests with HTTP 401. End-to-end Gmail delivery was not exercised by that check.

Those results are dated evidence, not a permanent assertion that dependencies or deployed settings remain unchanged. Re-run the relevant checks before making a current security claim:

```sh
npm test
npm run build
npm run check:functions
npm audit
npx deno audit --lock supabase/functions/publish-leaderboard/deno.lock
npx deno audit --lock supabase/functions/notify-feedback/deno.lock
git --no-pager diff --check
```

[Database security integration checks](supabase/tests/api_security.sql) require the migrated schema and privileged access to a controlled test database. Run the entire file in one transaction ending in `ROLLBACK`; do not execute its fixture statements individually. A fresh deployment also needs live permission, callback, header, and association-file checks: repository code alone does not prove hosted configuration.

## Remaining boundaries

- Server computation prevents direct public score injection. Users still supply location history, city data, and time-zone selections. Coordinate validation and speed checks cannot prove that a route was physically walked or eliminate GPS spoofing. There is no claim of device attestation or fraud-proof rankings.
- Sessions and recovery data use browser/WebView storage. They are not described as hardware-backed secrets or encrypted local storage. A compromised device, malicious extension, or successful script/dependency compromise remains a threat.
- Mapping, geocoding, and routing services receive requests needed to provide those features, which can include location or destination information. Private leaderboard sharing does not mean location data never leaves the device. See the [privacy policy](public/privacy-policy.html) for the product's privacy disclosures.
- Deleting an account removes its linked public snapshot and cascaded private account records. Feedback is retained with its account link cleared; message text, an optional reply email, and already delivered support emails are not erased by that trigger.
- Application quotas and pagination reduce abuse and resource amplification. They are not comprehensive DDoS protection, a storage quota for every table, or a formal availability guarantee.

## Reporting a suspected vulnerability

Contact **supporthecate@gmail.com** privately with the affected platform/build, expected versus observed behavior, and the smallest reproducible example. Avoid posting session tokens, credentials, private routes, precise locations, or other users' data in public issues. Use synthetic accounts and locations when possible.
