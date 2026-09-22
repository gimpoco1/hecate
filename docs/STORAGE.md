# Spatial storage model

Hecate separates the user's route history from the accumulated area they have discovered.

## Permanent data

### `walks`

One row represents one completed recording session. Its route is a PostGIS `LineString` retaining every accepted GPS sample, with start/end times, original point count, and traveled distance. The map's "new ground" distance is calculated from the ordered routes and can be smaller than traveled distance when the user revisits known ground.

### `discovery_cells`

One row represents one unique Web Mercator cell discovered by a user. The composite primary key is `(user_id, cell_z, cell_x, cell_y)`, making repeated visits idempotent and cross-device merging deterministic. The current zoom-20 grid is about 38 metres wide at the equator and about 29 metres wide around Barcelona.

### `discovered_cities`

Rows store the boundary used for the displayed city coverage percentage. London
boroughs resolve to Greater London, New York boroughs to New York City, and
municipalities in the Barcelona metropolitan area resolve to Barcelona, using bundled OpenStreetMap region
boundaries. On sign-in, old municipality rows inside these regions are replaced
with the matching region row; the replacement is saved before the old row is
removed. Other places retain the boundary returned by Nominatim and use that
boundary's own name.

`city_region_boundaries` holds three fixed polygons for the hosted database.
A trigger maps obsolete city IDs submitted by older app versions to those
regions, so those clients cannot recreate the incorrect rows before updating.

## Client lifecycle

1. Require an authenticated account, filter inaccurate positions, and journal each accepted point under that account on the device.
2. Add each accepted position's cell to the current account's in-memory discovered set.
3. Upsert only cells not already attempted during the current signed-in session.
4. On Finish walk, upload the journaled route through `save_walk`. Keep failed uploads in the journal and retry after a restart, reconnection, or return to the foreground. A recording interrupted by app termination is recovered through its last accepted point.

The sample Barcelona walk is display-only and is never persisted or synchronized.

## Tradeoffs

- On-device recovery depends on browser or WebView storage being available. A user clearing app data before an unsynced walk uploads can still lose that walk.
- Grid cells approximate the reveal boundary. At very high zoom, the underlying cell resolution can become perceptible unless the soft mist renderer hides it.
- Changing the grid resolution later requires regenerating cell keys from retained routes.
- The schema and migration logic are more complex than a flat point table.
- The app does not automatically resume GPS tracking after it is terminated; an interrupted walk ends at its last saved sample.
- Completed route history appears on another device after the walk is finalized; discovery cells can synchronize during the walk.
- Unique exploration still grows the database. Repeated visits are nearly free, but global-scale usage will eventually require viewport queries or vector tiles instead of loading every cell.
- PostGIS adds operational knowledge and makes a future move to a non-spatial database more involved.

## Next scale boundary

The current client paginates all discovery cells in 1,000-row batches. Before individual accounts approach roughly 50,000-100,000 unique cells, replace the full download with bounding-box queries for city zooms and coarser precomputed cells for globe zooms. Supabase Cron can build those aggregates in the background.
