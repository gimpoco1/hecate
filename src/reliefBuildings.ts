import { VectorTile, classifyRings } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { intersectReliefPolygons, type MultiPolygon } from "./reliefPolygons";
import type { StyleSpecification } from "maplibre-gl";
import { t } from "./i18n";
import type { ReliefBuilding, ReliefFootprint } from "./cityRelief";

/** Uses the existing map's building source, including its supplied render heights. */
export function reliefBuildingSource(style: StyleSpecification): string {
  const layer = style.layers.find(layer => "source-layer" in layer && layer["source-layer"] === "building");
  if (!layer || !("source" in layer)) throw new Error(t("The map’s building source is unavailable. Wait for the map to load and try again."));
  const source = style.sources[layer.source];
  if (!source || source.type !== "vector" || !source.url) throw new Error(t("The map’s building source is unavailable. Wait for the map to load and try again."));
  return source.url;
}

function assertActive(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("Building data request was cancelled.", "AbortError");
}

async function requestBuildingData(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    assertActive(signal);
    const controller = new AbortController();
    const cancel = (): void => controller.abort();
    signal.addEventListener("abort", cancel, { once: true });
    const timeout = globalThis.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Building data request failed: HTTP ${response.status}; URL ${url}; response ${await response.text()}`);
      return await response.arrayBuffer();
    } catch (failure) {
      const error = controller.signal.aborted && !signal.aborted
        ? new Error(`Building data request timed out after 20 seconds: ${url}`) : failure;
      if (signal.aborted || attempt === 3) throw error;
      console.warn("Building data request failed; retrying", { url, attempt, failure: error });
    } finally {
      globalThis.clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
    }
  }
  throw new Error("Building data request exhausted its attempts.");
}

/** Reads and clips tile buffers, retaining courtyards and excluding adjacent undiscovered streets. */
export function decodeReliefBuildings(
  buffer: ArrayBuffer,
  tileX: number,
  tileY: number,
  gridScale: number,
): ReliefBuilding[] {
  const tile = new VectorTile(new PbfReader(buffer));
  const layer = tile.layers.building;
  // Empty countryside/water tiles legitimately have no building layer.
  if (!layer) return [];
  const tileSize = gridScale / 2 ** 14;
  const tileBoundary: MultiPolygon = [[[[tileX * tileSize, tileY * tileSize], [(tileX + 1) * tileSize, tileY * tileSize],
    [(tileX + 1) * tileSize, (tileY + 1) * tileSize], [tileX * tileSize, (tileY + 1) * tileSize], [tileX * tileSize, tileY * tileSize]]]];
  const buildings: ReliefBuilding[] = [];
  for (let index = 0; index < layer.length; index += 1) {
    const feature = layer.feature(index);
    if (feature.type !== 3 || "hide_3d" in feature.properties) continue;
    const height = feature.properties.render_height;
    const minHeight = feature.properties.render_min_height;
    if (typeof height !== "number" || !Number.isFinite(height) ||
        typeof minHeight !== "number" || !Number.isFinite(minHeight)) {
      throw new Error(`Invalid building height in tile 14/${tileX}/${tileY}; feature ${feature.id}; render_height=${height}; render_min_height=${minHeight}`);
    }
    if (height < minHeight) console.warn("Building source elevations are reversed", { tile: `14/${tileX}/${tileY}`, featureId: feature.id, height, minHeight });
    if (height === minHeight) continue;
    const polygons: MultiPolygon = classifyRings(feature.loadGeometry()).map(polygon => polygon.map(ring => ring.map(point => [
      (tileX + point.x / feature.extent) * tileSize,
      (tileY + point.y / feature.extent) * tileSize,
    ])));
    // Tiles include a render buffer; remove it to avoid duplicated buildings at tile seams.
    const clipped = intersectReliefPolygons(polygons, tileBoundary);
    if (clipped.length) buildings.push({ polygons: clipped, height, minHeight });
  }
  return buildings;
}

/** Loads at most four tiles concurrently and cancels all work when the viewer closes or a request fails. */
export async function loadReliefBuildings(
  footprint: ReliefFootprint,
  sourceUrl: string,
  signal: AbortSignal,
): Promise<ReliefBuilding[]> {
  if (footprint.sourceTiles.length > 1024) throw new Error(t("This discovery is too large to create artwork on this device. Try a city with a smaller discovered area."));
  const controller = new AbortController();
  const cancel = (): void => controller.abort(signal.reason);
  assertActive(signal);
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const metadataBuffer = await requestBuildingData(sourceUrl, controller.signal);
    const metadata = JSON.parse(new TextDecoder().decode(metadataBuffer)) as { tiles?: string[]; maxzoom?: number } | null;
    if (!metadata || !Array.isArray(metadata.tiles) || !metadata.tiles.length ||
        !metadata.tiles.every(tile => typeof tile === "string" && tile.includes("{z}") && tile.includes("{x}") && tile.includes("{y}")) ||
        typeof metadata.maxzoom !== "number" || metadata.maxzoom < 14) {
      throw new Error(`Invalid building tile metadata from ${sourceUrl}: ${JSON.stringify(metadata)}`);
    }
    const template = metadata.tiles[0];
    const results: ReliefBuilding[][] = new Array(footprint.sourceTiles.length);
    let nextTile = 0;
    let bytes = 0;
    const loadNextTile = async (): Promise<void> => {
      while (nextTile < footprint.sourceTiles.length) {
        assertActive(controller.signal);
        const index = nextTile++;
        const { x, y } = footprint.sourceTiles[index];
        const url = template.replace("{z}", "14").replace("{x}", String(x)).replace("{y}", String(y));
        const buffer = await requestBuildingData(url, controller.signal);
        assertActive(controller.signal);
        bytes += buffer.byteLength;
        if (bytes > 50 * 1024 * 1024) throw new Error(t("This discovery is too large to create artwork on this device. Try a city with a smaller discovered area."));
        results[index] = decodeReliefBuildings(buffer, x, y, footprint.gridScale);
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, footprint.sourceTiles.length) }, () => loadNextTile()));
    return results.flat();
  } catch (failure) {
    controller.abort();
    throw failure;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
