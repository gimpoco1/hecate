import type {
  CustomLayerInterface,
  CustomLayerProjectionData,
  CustomRenderMethodInput,
  Map as MapLibreMap,
} from "maplibre-gl";
import { MercatorCoordinate } from "maplibre-gl";
import { DISCOVERY_RADIUS_M, distanceKm, metersToPixels } from "./geo";
import type { Coordinate, MapMode } from "./types";

export type FogGeometry = {
  routeSegments: Coordinate[][];
  cellCenters: [number, number][];
};

type MaskProgram = {
  program: WebGLProgram;
  fallbackMatrix: WebGLUniformLocation | null;
  projectionMatrix: WebGLUniformLocation | null;
  tileMercatorCoordinates: WebGLUniformLocation | null;
  clippingPlane: WebGLUniformLocation | null;
  projectionTransition: WebGLUniformLocation | null;
  viewport: WebGLUniformLocation | null;
  radiusPixels: WebGLUniformLocation | null;
  liquidHead: WebGLUniformLocation | null;
  liquidProgress: WebGLUniformLocation | null;
  liquidActive: WebGLUniformLocation | null;
};

type CompositeProgram = {
  program: WebGLProgram;
  mask: WebGLUniformLocation | null;
  fogOpacity: WebGLUniformLocation | null;
};

const FOG_LAYER_ID = "hecate-discovery-fog";
const FOG_TRANSITION_MS = 450;
const LIQUID_SETTLE_MS = 1_800;
const MAX_FOG_RADIUS_SCALE = 3;
const FOG_BUCKET_ZOOM = 12;
const FOG_BUCKET_COUNT = 2 ** FOG_BUCKET_ZOOM;
const FOG_BUCKET_MARGIN = 2;

type FogBucket = {
  x: number;
  y: number;
  centers: number[];
};

type VisibleBucketRange = {
  west: number;
  east: number;
  north: number;
  south: number;
  wraps: boolean;
};

function normalizeLongitude(longitude: number): number {
  if (longitude > -180 && longitude <= 180) return longitude;
  const normalized = ((longitude + 180) % 360 + 360) % 360 - 180;
  return normalized === -180 ? 180 : normalized;
}

function longitudeDelta(from: number, to: number): number {
  const delta = to - from;
  if (delta > 180) return delta - 360;
  if (delta < -180) return delta + 360;
  return delta;
}

export function fogRevealCoordinates(geometry: FogGeometry): [number, number][] {
  const coordinates: [number, number][] = [];
  const seen = new Set<string>();
  const append = (lng: number, lat: number): void => {
    const normalizedLng = normalizeLongitude(lng);
    const key = `${normalizedLng.toFixed(6)}:${lat.toFixed(6)}`;
    if (seen.has(key)) return;
    seen.add(key);
    coordinates.push([normalizedLng, lat]);
  };

  geometry.routeSegments.forEach((segment) => {
    segment.forEach((point, index) => {
      const previous = segment[index - 1];
      if (previous) {
        const steps = Math.ceil(
          (distanceKm(previous, point) * 1_000) / DISCOVERY_RADIUS_M,
        );
        const deltaLng = longitudeDelta(previous.lng, point.lng);
        for (let step = 1; step < steps; step += 1) {
          const progress = step / steps;
          append(
            previous.lng + deltaLng * progress,
            previous.lat + (point.lat - previous.lat) * progress,
          );
        }
      }
      append(point.lng, point.lat);
    });
  });
  geometry.cellCenters.forEach(([lng, lat]) => append(lng, lat));
  return coordinates;
}

function latestRouteCoordinate(geometry: FogGeometry): Coordinate | null {
  for (let index = geometry.routeSegments.length - 1; index >= 0; index -= 1) {
    const point = geometry.routeSegments[index].at(-1);
    if (point) return point;
  }
  return null;
}

function coordinatesMatch(
  first: Coordinate | null,
  second: Coordinate | null,
): boolean {
  if (!first || !second) return first === second;
  return first.lng === second.lng && first.lat === second.lat;
}

function cellGeometryIsPrefix(
  previous: [number, number][],
  next: [number, number][],
): boolean {
  if (previous.length > next.length) return false;
  return previous.every(
    ([lng, lat], index) =>
      next[index]?.[0] === lng && next[index]?.[1] === lat,
  );
}

export function appendedFogRouteCoordinates(
  previous: Coordinate[][],
  next: Coordinate[][],
): [number, number][] | null {
  if (previous.length > next.length) return null;
  const appended: [number, number][] = [];
  for (let index = 0; index < previous.length; index += 1) {
    const previousSegment = previous[index];
    const nextSegment = next[index];
    if (!nextSegment || previousSegment.length > nextSegment.length) return null;
    const canExtend = index === previous.length - 1;
    if (!canExtend && previousSegment.length !== nextSegment.length) return null;
    if (
      !coordinatesMatch(previousSegment[0] ?? null, nextSegment[0] ?? null) ||
      !coordinatesMatch(
        previousSegment.at(-1) ?? null,
        nextSegment[previousSegment.length - 1] ?? null,
      )
    )
      return null;
    if (canExtend && nextSegment.length > previousSegment.length) {
      appended.push(
        ...revealCoordinatesBetween(
          previousSegment.at(-1) ?? null,
          nextSegment.slice(previousSegment.length),
        ),
      );
    }
  }
  next.slice(previous.length).forEach((segment) => {
    appended.push(...revealCoordinatesBetween(null, segment));
  });
  return appended;
}

function revealCoordinatesBetween(
  previous: Coordinate | null,
  points: Coordinate[],
): [number, number][] {
  const coordinates: [number, number][] = [];
  let last = previous;
  points.forEach((point) => {
    if (last) {
      const steps = Math.ceil(
        (distanceKm(last, point) * 1_000) / DISCOVERY_RADIUS_M,
      );
      const deltaLng = longitudeDelta(last.lng, point.lng);
      for (let step = 1; step < steps; step += 1) {
        const progress = step / steps;
        coordinates.push([
          normalizeLongitude(last.lng + deltaLng * progress),
          last.lat + (point.lat - last.lat) * progress,
        ]);
      }
    }
    coordinates.push([normalizeLongitude(point.lng), point.lat]);
    last = point;
  });
  return coordinates;
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  label: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error(`Could not create the ${label} shader.`);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  const log = gl.getShaderInfoLog(shader) ?? "No compiler log was returned.";
  gl.deleteShader(shader);
  throw new Error(`Could not compile the ${label} shader: ${log}`);
}

function linkProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  label: string,
): WebGLProgram {
  const vertexShader = compileShader(
    gl,
    gl.VERTEX_SHADER,
    vertexSource,
    `${label} vertex`,
  );
  const fragmentShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    fragmentSource,
    `${label} fragment`,
  );
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error(`Could not create the ${label} WebGL program.`);
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
  const log = gl.getProgramInfoLog(program) ?? "No linker log was returned.";
  gl.deleteProgram(program);
  throw new Error(`Could not link the ${label} WebGL program: ${log}`);
}

function applyProjectionUniforms(
  gl: WebGL2RenderingContext,
  program: MaskProgram,
  projection: CustomLayerProjectionData,
): void {
  gl.uniformMatrix4fv(program.fallbackMatrix, false, projection.fallbackMatrix);
  gl.uniformMatrix4fv(program.projectionMatrix, false, projection.mainMatrix);
  gl.uniform4f(
    program.tileMercatorCoordinates,
    projection.tileMercatorCoords[0],
    projection.tileMercatorCoords[1],
    projection.tileMercatorCoords[2],
    projection.tileMercatorCoords[3],
  );
  gl.uniform4f(
    program.clippingPlane,
    projection.clippingPlane[0],
    projection.clippingPlane[1],
    projection.clippingPlane[2],
    projection.clippingPlane[3],
  );
  gl.uniform1f(program.projectionTransition, projection.projectionTransition);
}

function maskProgramForProjection(
  gl: WebGL2RenderingContext,
  input: CustomRenderMethodInput,
): MaskProgram {
  const vertexSource = `#version 300 es
${input.shaderData.vertexShaderPrelude}
${input.shaderData.define}
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec2 a_center;
uniform vec2 u_viewport;
uniform float u_radius_pixels;
uniform vec2 u_liquid_head;
uniform float u_liquid_progress;
uniform float u_liquid_active;
out vec2 v_corner;
flat out float v_is_liquid_head;
out float v_liquid_progress;
void main() {
  vec4 projected = projectTile(a_center);
  float isLiquidHead =
    (1.0 - step(0.0000001, distance(a_center, u_liquid_head))) *
    u_liquid_active;
  float settled = smoothstep(0.0, 1.0, u_liquid_progress);
  float viscousOvershoot = sin(settled * 3.14159265) * 0.12;
  float liquidScale = mix(0.24, 1.0, settled) + viscousOvershoot;
  float radiusScale = mix(1.0, liquidScale, isLiquidHead);
  vec2 offset =
    a_corner * u_radius_pixels * radiusScale * 2.0 /
    u_viewport * projected.w;
  gl_Position = projected + vec4(offset, 0.0, 0.0);
  v_corner = a_corner;
  v_is_liquid_head = isLiquidHead;
  v_liquid_progress = settled;
}`;
  const fragmentSource = `#version 300 es
precision highp float;
in vec2 v_corner;
flat in float v_is_liquid_head;
in float v_liquid_progress;
out vec4 fragColor;
void main() {
  float angle = atan(v_corner.y, v_corner.x);
  float surfaceRipple =
    sin(angle * 5.0 - v_liquid_progress * 9.0) *
    0.075 * (1.0 - v_liquid_progress) * v_is_liquid_head;
  float secondaryRipple =
    sin(angle * 9.0 + v_liquid_progress * 5.0) *
    0.025 * (1.0 - v_liquid_progress) * v_is_liquid_head;
  float distanceFromCenter =
    length(v_corner) * (1.0 + surfaceRipple + secondaryRipple);
  if (distanceFromCenter > 1.0) discard;
  fragColor = vec4(1.0 - distanceFromCenter, 0.0, 0.0, 1.0);
}`;
  const program = linkProgram(gl, vertexSource, fragmentSource, "fog mask");
  return {
    program,
    fallbackMatrix: gl.getUniformLocation(
      program,
      "u_projection_fallback_matrix",
    ),
    projectionMatrix: gl.getUniformLocation(program, "u_projection_matrix"),
    tileMercatorCoordinates: gl.getUniformLocation(
      program,
      "u_projection_tile_mercator_coords",
    ),
    clippingPlane: gl.getUniformLocation(
      program,
      "u_projection_clipping_plane",
    ),
    projectionTransition: gl.getUniformLocation(
      program,
      "u_projection_transition",
    ),
    viewport: gl.getUniformLocation(program, "u_viewport"),
    radiusPixels: gl.getUniformLocation(program, "u_radius_pixels"),
    liquidHead: gl.getUniformLocation(program, "u_liquid_head"),
    liquidProgress: gl.getUniformLocation(program, "u_liquid_progress"),
    liquidActive: gl.getUniformLocation(program, "u_liquid_active"),
  };
}

function createCompositeProgram(gl: WebGL2RenderingContext): CompositeProgram {
  const vertexSource = `#version 300 es
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_uv = a_position * 0.5 + 0.5;
}`;
  const fragmentSource = `#version 300 es
precision highp float;
uniform sampler2D u_mask;
uniform float u_fog_opacity;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  float proximity = texture(u_mask, v_uv).r;
  float distanceInRadii = (1.0 - proximity) * 3.0;
  float revealed = 1.0 - smoothstep(1.0, 1.87, distanceInRadii);
  float fogAlpha = 0.9 * u_fog_opacity * (1.0 - revealed);

  float contourRange = step(1.08, distanceInRadii) * step(distanceInRadii, 2.99);
  float contourPhase = fract((distanceInRadii - 1.08) / 0.16);
  float contourDistance = min(contourPhase, 1.0 - contourPhase);
  float contourWidth = max(fwidth(contourPhase) * 1.35, 0.04);
  float contourLine = 1.0 - smoothstep(0.0, contourWidth, contourDistance);
  float contourStrength = mix(
    0.14,
    0.07,
    smoothstep(1.08, 2.99, distanceInRadii)
  );
  float contourAlpha =
    contourLine * contourRange * contourStrength * u_fog_opacity;
  float edgeHazeAlpha =
    (1.0 - smoothstep(0.0, 0.62, abs(distanceInRadii - 1.28))) *
    0.08 * u_fog_opacity;
  float glowAlpha =
    (1.0 - smoothstep(0.0, 0.24, abs(distanceInRadii - 0.98))) *
    0.16 * u_fog_opacity;

  vec3 fogColor = vec3(0.855, 0.878, 0.855);
  vec3 edgeHazeColor = vec3(0.490, 0.541, 0.510);
  vec3 contourColor = vec3(0.259, 0.318, 0.290);
  vec3 glowColor = vec3(0.745, 0.878, 0.290);
  vec3 color = fogColor * fogAlpha;
  float alpha = fogAlpha;
  color = edgeHazeColor * edgeHazeAlpha + color * (1.0 - edgeHazeAlpha);
  alpha = edgeHazeAlpha + alpha * (1.0 - edgeHazeAlpha);
  color = contourColor * contourAlpha + color * (1.0 - contourAlpha);
  alpha = contourAlpha + alpha * (1.0 - contourAlpha);
  color = glowColor * glowAlpha + color * (1.0 - glowAlpha);
  alpha = glowAlpha + alpha * (1.0 - glowAlpha);
  fragColor = vec4(color, alpha);
}`;
  const program = linkProgram(
    gl,
    vertexSource,
    fragmentSource,
    "fog composite",
  );
  return {
    program,
    mask: gl.getUniformLocation(program, "u_mask"),
    fogOpacity: gl.getUniformLocation(program, "u_fog_opacity"),
  };
}

export class DiscoveryFogLayer implements CustomLayerInterface {
  readonly id = FOG_LAYER_ID;
  readonly type = "custom" as const;
  readonly renderingMode = "2d" as const;

  private map: MapLibreMap | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private geometry: FogGeometry;
  private revealBuckets = new Map<string, FogBucket>();
  private revealCoordinateKeys = new Set<string>();
  private visibleBucketSignature = "";
  private visibleCentersDirty = true;
  private centerCount = 0;
  private cornerBuffer: WebGLBuffer | null = null;
  private centerBuffer: WebGLBuffer | null = null;
  private maskTexture: WebGLTexture | null = null;
  private maskFramebuffer: WebGLFramebuffer | null = null;
  private maskWidth = 0;
  private maskHeight = 0;
  private maskPrograms = new Map<string, MaskProgram>();
  private compositeProgram: CompositeProgram | null = null;
  private modeOpacity: number;
  private transitionFrom: number;
  private transitionTo: number;
  private transitionStartedAt = 0;
  private liquidHead: [number, number] | null = null;
  private liquidStartedAt: number | null = null;

  constructor(geometry: FogGeometry, mode: MapMode) {
    this.geometry = geometry;
    this.modeOpacity = mode === "discover" ? 1 : 0;
    this.transitionFrom = this.modeOpacity;
    this.transitionTo = this.modeOpacity;
    this.rebuildRevealCenters(geometry);
  }

  setGeometry(geometry: FogGeometry): void {
    if (this.geometry === geometry) return;
    const previousHead = latestRouteCoordinate(this.geometry);
    const nextHead = latestRouteCoordinate(geometry);
    const appendedRoutes = appendedFogRouteCoordinates(
      this.geometry.routeSegments,
      geometry.routeSegments,
    );
    const appendedCells = cellGeometryIsPrefix(
      this.geometry.cellCenters,
      geometry.cellCenters,
    );
    let routeCoordinatesAdded = 0;
    if (appendedRoutes && appendedCells) {
      routeCoordinatesAdded = this.appendRevealCoordinates(appendedRoutes);
      this.appendRevealCoordinates(
        geometry.cellCenters.slice(this.geometry.cellCenters.length),
      );
    } else {
      this.rebuildRevealCenters(geometry);
    }
    this.geometry = geometry;
    if (
      this.map &&
      routeCoordinatesAdded > 0 &&
      previousHead &&
      nextHead &&
      !coordinatesMatch(previousHead, nextHead)
    ) {
      this.liquidStartedAt = performance.now();
    }
    this.map?.triggerRepaint();
  }

  appendRoutePoint(previous: Coordinate | null, point: Coordinate): void {
    this.appendRevealCoordinates(revealCoordinatesBetween(previous, [point]));
    const liquidHead = MercatorCoordinate.fromLngLat(point, 0);
    this.liquidHead = [liquidHead.x, liquidHead.y];
    if (this.map && previous && !coordinatesMatch(previous, point))
      this.liquidStartedAt = performance.now();
    this.map?.triggerRepaint();
  }

  setMode(mode: MapMode): void {
    const targetOpacity = mode === "discover" ? 1 : 0;
    if (this.transitionTo === targetOpacity) return;
    const now = performance.now();
    this.modeOpacity = this.currentModeOpacity(now);
    this.transitionFrom = this.modeOpacity;
    this.transitionTo = targetOpacity;
    this.transitionStartedAt = now;
    this.map?.triggerRepaint();
  }

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.gl = gl;
    this.cornerBuffer = gl.createBuffer();
    this.centerBuffer = gl.createBuffer();
    this.maskTexture = gl.createTexture();
    this.maskFramebuffer = gl.createFramebuffer();
    if (
      !this.cornerBuffer ||
      !this.centerBuffer ||
      !this.maskTexture ||
      !this.maskFramebuffer
    ) {
      throw new Error("Could not allocate WebGL resources for the discovery fog.");
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1, 1, -1, 1, 1,
        -1, -1, 1, 1, -1, 1,
      ]),
      gl.STATIC_DRAW,
    );
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskFramebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.maskTexture,
      0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.compositeProgram = createCompositeProgram(gl);
    this.refreshVisibleRevealCenters();
  }

  prerender(gl: WebGL2RenderingContext, input: CustomRenderMethodInput): void {
    const fogOpacity = this.currentFogOpacity(performance.now());
    if (fogOpacity <= 0) return;
    this.resizeMask(gl);
    if (!this.maskFramebuffer || !this.cornerBuffer || !this.centerBuffer)
      throw new Error("Discovery fog mask resources are unavailable.");
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskFramebuffer);
    gl.viewport(0, 0, this.maskWidth, this.maskHeight);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.refreshVisibleRevealCenters();
    if (this.centerCount === 0) return;

    const now = performance.now();
    const liquidProgress = this.currentLiquidProgress(now);
    const maskProgram = this.getMaskProgram(gl, input);
    gl.useProgram(maskProgram.program);
    applyProjectionUniforms(gl, maskProgram, input.defaultProjectionData);
    gl.uniform2f(maskProgram.viewport, this.maskWidth, this.maskHeight);
    const pixelRatio =
      this.maskWidth /
      Math.max(1, this.map?.getCanvas().clientWidth ?? 1);
    const radiusPixels =
      metersToPixels(
        DISCOVERY_RADIUS_M * MAX_FOG_RADIUS_SCALE,
        this.map?.getCenter().lat ?? 0,
        this.map?.getZoom() ?? 0,
      ) * pixelRatio;
    gl.uniform1f(maskProgram.radiusPixels, radiusPixels);
    gl.uniform2f(
      maskProgram.liquidHead,
      this.liquidHead?.[0] ?? 0,
      this.liquidHead?.[1] ?? 0,
    );
    gl.uniform1f(maskProgram.liquidProgress, liquidProgress);
    gl.uniform1f(
      maskProgram.liquidActive,
      this.liquidStartedAt === null ? 0 : 1,
    );
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.centerBuffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MAX);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.centerCount);
    gl.vertexAttribDivisor(1, 0);
  }

  render(gl: WebGL2RenderingContext): void {
    const now = performance.now();
    const fogOpacity = this.currentFogOpacity(now);
    if (fogOpacity <= 0) {
      if (this.transitionFrom !== this.transitionTo) this.map?.triggerRepaint();
      return;
    }
    if (!this.compositeProgram || !this.maskTexture || !this.cornerBuffer)
      throw new Error("Discovery fog composite resources are unavailable.");
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.useProgram(this.compositeProgram.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.uniform1i(this.compositeProgram.mask, 0);
    gl.uniform1f(this.compositeProgram.fogOpacity, fogOpacity);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (
      this.transitionFrom !== this.transitionTo ||
      this.liquidStartedAt !== null
    ) {
      this.map?.triggerRepaint();
    }
  }

  onRemove(_map: MapLibreMap, gl: WebGL2RenderingContext): void {
    if (this.cornerBuffer) gl.deleteBuffer(this.cornerBuffer);
    if (this.centerBuffer) gl.deleteBuffer(this.centerBuffer);
    if (this.maskTexture) gl.deleteTexture(this.maskTexture);
    if (this.maskFramebuffer) gl.deleteFramebuffer(this.maskFramebuffer);
    this.maskPrograms.forEach(({ program }) => gl.deleteProgram(program));
    if (this.compositeProgram) gl.deleteProgram(this.compositeProgram.program);
    this.map = null;
    this.gl = null;
  }

  private rebuildRevealCenters(geometry: FogGeometry): void {
    this.revealBuckets = new Map();
    this.revealCoordinateKeys = new Set();
    this.visibleBucketSignature = "";
    this.appendRevealCoordinates(fogRevealCoordinates(geometry));
    const head = latestRouteCoordinate(geometry);
    if (!head) {
      this.liquidHead = null;
      return;
    }
    const liquidHead = MercatorCoordinate.fromLngLat(head, 0);
    this.liquidHead = [liquidHead.x, liquidHead.y];
  }

  private appendRevealCoordinates(coordinates: [number, number][]): number {
    let added = 0;
    coordinates.forEach(([lng, lat]) => {
      const normalizedLng = normalizeLongitude(lng);
      const coordinateKey = `${normalizedLng.toFixed(6)}:${lat.toFixed(6)}`;
      if (this.revealCoordinateKeys.has(coordinateKey)) return;
      this.revealCoordinateKeys.add(coordinateKey);
      const coordinate = MercatorCoordinate.fromLngLat(
        { lng: normalizedLng, lat },
        0,
      );
      const x = Math.min(
        FOG_BUCKET_COUNT - 1,
        Math.max(0, Math.floor(coordinate.x * FOG_BUCKET_COUNT)),
      );
      const y = Math.min(
        FOG_BUCKET_COUNT - 1,
        Math.max(0, Math.floor(coordinate.y * FOG_BUCKET_COUNT)),
      );
      const key = `${x}:${y}`;
      const bucket = this.revealBuckets.get(key) ?? { x, y, centers: [] };
      bucket.centers.push(coordinate.x, coordinate.y);
      this.revealBuckets.set(key, bucket);
      added += 1;
    });
    if (added > 0) this.visibleCentersDirty = true;
    return added;
  }

  private visibleBucketRange(): VisibleBucketRange | null {
    if (!this.map) return null;
    const bounds = this.map.getBounds();
    const northWest = MercatorCoordinate.fromLngLat(
      { lng: bounds.getWest(), lat: bounds.getNorth() },
      0,
    );
    const southEast = MercatorCoordinate.fromLngLat(
      { lng: bounds.getEast(), lat: bounds.getSouth() },
      0,
    );
    const west = Math.floor(northWest.x * FOG_BUCKET_COUNT);
    const east = Math.floor(southEast.x * FOG_BUCKET_COUNT);
    return {
      west,
      east,
      north: Math.max(
        0,
        Math.floor(northWest.y * FOG_BUCKET_COUNT) - FOG_BUCKET_MARGIN,
      ),
      south: Math.min(
        FOG_BUCKET_COUNT - 1,
        Math.floor(southEast.y * FOG_BUCKET_COUNT) + FOG_BUCKET_MARGIN,
      ),
      wraps: bounds.getWest() > bounds.getEast(),
    };
  }

  private refreshVisibleRevealCenters(): void {
    if (!this.gl || !this.centerBuffer) return;
    const range = this.visibleBucketRange();
    if (!range) return;
    const signature = `${range.west}:${range.east}:${range.north}:${range.south}:${range.wraps}`;
    if (!this.visibleCentersDirty && signature === this.visibleBucketSignature)
      return;
    const centers: number[] = [];
    this.revealBuckets.forEach((bucket) => {
      const insideLongitude = range.wraps
        ? bucket.x >= range.west - FOG_BUCKET_MARGIN ||
          bucket.x <= range.east + FOG_BUCKET_MARGIN
        : bucket.x >= range.west - FOG_BUCKET_MARGIN &&
          bucket.x <= range.east + FOG_BUCKET_MARGIN;
      if (
        insideLongitude &&
        bucket.y >= range.north &&
        bucket.y <= range.south
      )
        centers.push(...bucket.centers);
    });
    this.centerCount = centers.length / 2;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.centerBuffer);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      new Float32Array(centers),
      this.gl.DYNAMIC_DRAW,
    );
    this.visibleBucketSignature = signature;
    this.visibleCentersDirty = false;
  }

  private resizeMask(gl: WebGL2RenderingContext): void {
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    if (width === this.maskWidth && height === this.maskHeight) return;
    if (!this.maskTexture || !this.maskFramebuffer)
      throw new Error("Discovery fog framebuffer resources are unavailable.");
    this.maskWidth = width;
    this.maskHeight = height;
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      width,
      height,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskFramebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.maskTexture,
      0,
    );
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(
        `Discovery fog framebuffer is incomplete (status ${status}).`,
      );
    }
  }

  private getMaskProgram(
    gl: WebGL2RenderingContext,
    input: CustomRenderMethodInput,
  ): MaskProgram {
    const existing = this.maskPrograms.get(input.shaderData.variantName);
    if (existing) return existing;
    const program = maskProgramForProjection(gl, input);
    this.maskPrograms.set(input.shaderData.variantName, program);
    return program;
  }

  private currentModeOpacity(now: number): number {
    if (this.transitionFrom === this.transitionTo) return this.transitionTo;
    const progress = Math.min(
      1,
      Math.max(0, (now - this.transitionStartedAt) / FOG_TRANSITION_MS),
    );
    const eased = progress * progress * (3 - 2 * progress);
    const opacity =
      this.transitionFrom + (this.transitionTo - this.transitionFrom) * eased;
    if (progress === 1) {
      this.transitionFrom = this.transitionTo;
      this.modeOpacity = this.transitionTo;
    }
    return opacity;
  }

  private currentFogOpacity(now: number): number {
    const zoom = this.map?.getZoom() ?? 0;
    const zoomFade = Math.min(1, Math.max(0, (zoom - 5.5) / 2.5));
    return this.currentModeOpacity(now) * zoomFade;
  }

  private currentLiquidProgress(now: number): number {
    if (this.liquidStartedAt === null) return 1;
    const progress = Math.min(
      1,
      Math.max(0, (now - this.liquidStartedAt) / LIQUID_SETTLE_MS),
    );
    if (progress === 1) this.liquidStartedAt = null;
    return progress;
  }
}
