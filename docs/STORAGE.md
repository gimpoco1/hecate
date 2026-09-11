# Spatial storage model

Hecate separates the user's route history from the accumulated area they have discovered.

## Permanent data

### `walks`

One row represents one completed recording session. Its route is a PostGIS `LineString` simplified to roughly two-metre precision, with start/end times, original point count, and distance. The client keeps an interrupted or offline walk in a local outbox until the `save_walk` database function accepts it.

### `discovery_cells`

One row represents one unique Web Mercator cell discovered by a user. The composite primary key is `(user_id, cell_z, cell_x, cell_y)`, making repeated visits idempotent and cross-device merging deterministic. The current zoom-20 grid is about 38 metres wide at the equator and about 29 metres wide around Barcelona.

### `discovery_points`

This is the legacy table. `supabase.sql` converts its contents into cells and inferred walks without deleting the source rows. Keep it until the migrated map has been verified, then remove it in a later migration to reclaim storage.

## Client lifecycle

1. Filter inaccurate positions and record an active walk locally.
2. Add each accepted position's cell to the local discovered set.
3. Upsert only cells not already attempted during the current signed-in session.
4. On Finish walk, queue the route locally and upload it through `save_walk`.
5. If the app closes or has no connection, recover the queued walk on the next launch.

The sample Barcelona walk is display-only and is never persisted or synchronized.

## Tradeoffs

- Route simplification intentionally discards small GPS variations. The rendered path remains faithful, but the database no longer contains every original sample.
- Grid cells approximate the reveal boundary. At very high zoom, the underlying cell resolution can become perceptible unless the soft mist renderer hides it.
- Changing the grid resolution later requires regenerating cell keys from retained routes.
- The schema, migration, and retry logic are more complex than a flat point table.
- Completed route history appears on another device after the walk is finalized; discovery cells can synchronize during the walk.
- Unique exploration still grows the database. Repeated visits are nearly free, but global-scale usage will eventually require viewport queries or vector tiles instead of loading every cell.
- PostGIS adds operational knowledge and makes a future move to a non-spatial database more involved.

## Next scale boundary

The current client paginates all discovery cells in 1,000-row batches. Before individual accounts approach roughly 50,000-100,000 unique cells, replace the full download with bounding-box queries for city zooms and coarser precomputed cells for globe zooms. Supabase Cron can build those aggregates in the background.
