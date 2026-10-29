import { MercatorCoordinate } from "maplibre-gl";
import { t } from "./i18n";
import { Camera, Geometry, Mesh, Program, Renderer, Shadow, Transform, Vec3, Quat } from "ogl";
import type { CityRelief } from "./cityRelief";
import type { ReliefBackground } from "./reliefBackground";
import { createReliefShareImage, type ReliefShareDetails } from "./reliefShareImage";

const vertex = `
attribute vec3 position;
attribute vec3 normal;
attribute float occlusion;
attribute float structure;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 shadowProjectionMatrix;
uniform mat4 shadowViewMatrix;
uniform float lift;
uniform float extrusion;
varying float vStructure;
varying vec3 vNormal;
varying float vOcclusion;
varying vec4 vShadow;
void main() {
  vec3 raised = position;
  raised.y *= mix(1.0, extrusion, structure);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(raised, 1.0);
  vStructure = structure;
  vNormal = normal;
  vOcclusion = occlusion;
  vShadow = shadowProjectionMatrix * shadowViewMatrix * vec4(position, 1.0);
}`;
const fragment = `
precision highp float;
uniform sampler2D tShadow;
uniform float lift;
uniform float opacity;
uniform float extrusion;
varying float vStructure;
varying vec3 vNormal;
varying float vOcclusion;
varying vec4 vShadow;
float unpackDepth(vec4 color) {
  return dot(color, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0));
}
void main() {
  vec3 normal = normalize(vNormal);
  vec3 light = normalize(vec3(-3.0, 5.0, -4.0));
  vec3 shadowPosition = vShadow.xyz / vShadow.w * 0.5 + 0.5;
  float visibility = 0.0;
  float bias = max(0.00008, 0.00035 * (1.0 - dot(normal, light)));
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      float depth = unpackDepth(texture2D(tShadow, shadowPosition.xy + vec2(float(x), float(y)) / 2048.0));
      visibility += shadowPosition.z - bias <= depth ? 1.0 : 0.0;
    }
  }
  visibility = mix(1.0, 0.55 + visibility / 9.0 * 0.45, lift);
  float key = max(dot(normal, light), 0.0);
  float fill = max(dot(normal, normalize(vec3(0.6, -0.5, 0.4))), 0.0);
  float shade = (0.62 + 0.50 * key * visibility + 0.14 * fill) * mix(0.86, 1.0, vOcclusion);
  gl_FragColor = vec4(vec3(1.0, 0.99, 0.97) * shade, opacity * mix(1.0, extrusion, vStructure));
}`;

export type ReliefScene = {
  revealBuildings: (relief: CityRelief) => void;
  dispose: () => void;
  image: (details: ReliefShareDetails) => Promise<Blob>;
  reset: () => void;
  rotate: (direction: number) => void;
  tilt: (direction: number) => void;
  zoom: (factor: number) => void;
  pan: (x: number, y: number) => void;
};

function reliefGeometry(gl: Renderer["gl"], relief: CityRelief): Geometry {
  const structure = new Float32Array(relief.positions.length / 3);
  structure.fill(1, relief.groundVertexCount);
  const geometry = new Geometry(gl, {
    position: { size: 3, data: relief.positions },
    normal: { size: 3, data: relief.normals },
    occlusion: { size: 1, data: relief.occlusion },
    structure: { size: 1, data: structure },
  });
  geometry.computeBoundingBox();
  return geometry;
}

/** Samples actual ground faces so holes or gaps between islands cannot satisfy the visibility limit. */
function reliefAnchors(relief: CityRelief): Vec3[] {
  const anchors: Vec3[] = [];
  const step = Math.max(1, Math.ceil(relief.groundVertexCount / 3 / 256)) * 9;
  for (let index = 0; index < relief.groundVertexCount * 3; index += step) {
    anchors.push(new Vec3(
      (relief.positions[index] + relief.positions[index + 3] + relief.positions[index + 6]) / 3,
      (relief.positions[index + 1] + relief.positions[index + 4] + relief.positions[index + 7]) / 3,
      (relief.positions[index + 2] + relief.positions[index + 5] + relief.positions[index + 8]) / 3,
    ));
  }
  return anchors;
}

/** Lifts a bounded, flat city footprint into an interactive artwork. */
export function createReliefScene(
  canvas: HTMLCanvasElement,
  relief: CityRelief,
  background: ReliefBackground,
  onLift: (progress: number) => void,
  onReady: () => void,
  onFailure: (error: Error) => void,
): ReliefScene {
  if (!canvas.getContext("webgl2", { alpha: true, antialias: true, preserveDrawingBuffer: true })) {
    throw new Error(t("WebGL 2 is unavailable. Enable hardware acceleration to view your 3D map."));
  }
  const renderer = new Renderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, width: canvas.clientWidth, height: canvas.clientHeight, dpr: Math.min(devicePixelRatio, 2) });
  const gl = renderer.gl;
  const camera = new Camera(gl, { fov: 38, near: .1, far: 30 });
  const scene = new Transform();
  let geometry = reliefGeometry(gl, relief);
  const anchors = reliefAnchors(relief);
  const program = new Program(gl, { vertex, fragment, transparent: true, cullFace: null, uniforms: { lift: { value: 0 }, opacity: { value: 0 }, extrusion: { value: 0 } } });
  const mesh = new Mesh(gl, { geometry, program });
  mesh.setParent(scene);
  const light = new Camera(gl);
  light.orthographic({ left: -2.3, right: 2.3, bottom: -2.3, top: 2.3, near: .1, far: 15 });
  light.position.set(-3, 5, -4);
  light.lookAt([0, 0, 0]);
  const shadow = new Shadow(gl, { light, width: 2048, height: 2048 });
  shadow.add({ mesh, cast: true, receive: true });
  gl.clearColor(1, 1, 1, 1);
  shadow.render({ scene });

  const bearing = background.bearing * Math.PI / 180;
  const separation = .08;
  const mapCenter = MercatorCoordinate.fromLngLat(background.center);
  const mapTarget = new Vec3((mapCenter.x - relief.centerX) * relief.scale, 0, (mapCenter.y - relief.centerY) * relief.scale);
  const mapDistance = background.height / (2 * Math.tan(background.fov * Math.PI / 360)) / (512 * 2 ** background.zoom) * relief.scale;
  camera.position.set(mapTarget.x, mapDistance, mapTarget.z);
  camera.up.set(Math.sin(bearing), 0, -Math.cos(bearing));
  camera.lookAt(mapTarget);
  const mapFramingX = -2 * (background.centerPixel.x - canvas.clientWidth / 2) / canvas.clientWidth;
  const mapFramingY = 2 * (background.centerPixel.y - canvas.clientHeight / 2) / canvas.clientHeight;
  const startRotation = new Quat().copy(camera.quaternion);
  let ready = false;
  let framingX = 0;
  let framingY = 0;
  const target = new Vec3(0, separation, 0);
  const viewingDistance = (): number => {
    const { min, max } = geometry.bounds;
    const radius = Math.hypot(Math.max(Math.abs(min.x), Math.abs(max.x)),
      Math.max(Math.abs(min.y), Math.abs(max.y)), Math.max(Math.abs(min.z), Math.abs(max.z)));
    return Math.max(5.1 / Math.min(1, canvas.clientWidth / canvas.clientHeight), radius * 2 + .1);
  };
  const frameArtwork = (liftPixels: number, centering: number): void => {
    camera.updateMatrixWorld();
    const { min, max } = geometry.bounds;
    let left = Infinity;
    let right = -Infinity;
    let bottom = Infinity;
    let top = -Infinity;
    for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
      const point = new Vec3(x, y + mesh.position.y, z);
      camera.project(point);
      left = Math.min(left, point.x);
      right = Math.max(right, point.x);
      bottom = Math.min(bottom, point.y);
      top = Math.max(top, point.y);
    }
    // Fit all corners throughout the tilt, independently of the underlying map's zoom.
    const fitScale = Math.min(1.4 / (right - left), .9 / (top - bottom));
    const scale = Math.min(fitScale, 1 + (fitScale - 1) * centering);
    camera.perspective({ fov: Math.atan(Math.tan(camera.fov * Math.PI / 360) / scale) * 360 / Math.PI });
    framingX = mapFramingX * (1 - centering) + ((left + right) * scale / 2 + 24 / canvas.clientWidth) * centering;
    framingY = mapFramingY * (1 - centering) + (bottom + top) * scale / 2 * centering - 2 * liftPixels / canvas.clientHeight;
    camera.projectionMatrix[8] = framingX;
    camera.projectionMatrix[9] = framingY;
  };
  const reset = (): void => {
    target.set(0, separation, 0);
    const distance = viewingDistance();
    camera.up.set(0, 1, 0);
    camera.position.set(distance * .40, separation + distance * .76, distance * .50);
    camera.lookAt(target);
    camera.perspective({ fov: 38, near: .1, far: Math.max(30, viewingDistance() * 3) });
    frameArtwork(0, 1);
  };
  const constrainView = (): boolean => {
    camera.updateMatrixWorld();
    const marginX = Math.min(.4, 80 / canvas.clientWidth);
    const marginY = Math.min(.4, 80 / canvas.clientHeight);
    let nearest: { x: number; y: number; depth: number; distance: number } | null = null;
    for (const anchor of anchors) {
      const world = anchor.clone().add(mesh.position);
      const view = world.clone().applyMatrix4(camera.viewMatrix);
      if (-view.z <= camera.near || -view.z >= camera.far) continue;
      camera.project(world);
      const x = world.x - Math.max(-1 + marginX, Math.min(1 - marginX, world.x));
      const y = world.y - Math.max(-1 + marginY, Math.min(1 - marginY, world.y));
      const distance = x * x + y * y;
      if (distance === 0) return true;
      if (!nearest || distance < nearest.distance) nearest = { x, y, depth: -view.z, distance };
    }
    if (!nearest) return false;
    const units = nearest.depth * Math.tan(camera.fov * Math.PI / 360);
    const right = new Vec3(camera.matrix[0], camera.matrix[1], camera.matrix[2]).multiply(nearest.x * units * camera.aspect);
    const up = new Vec3(camera.matrix[4], camera.matrix[5], camera.matrix[6]).multiply(nearest.y * units);
    const offset = right.add(up);
    camera.position.add(offset);
    target.add(offset);
    camera.updateMatrixWorld();
    return true;
  };
  const updateView = (change: () => void): void => {
    const previousPosition = camera.position.clone();
    const previousTarget = target.clone();
    change();
    camera.lookAt(target);
    if (!constrainView()) {
      camera.position.copy(previousPosition);
      target.copy(previousTarget);
      camera.lookAt(target);
    }
  };
  const resize = (): void => {
    const container = canvas.parentElement!;
    renderer.setSize(container.clientWidth, container.clientHeight);
    camera.perspective({ aspect: container.clientWidth / container.clientHeight });
    camera.projectionMatrix[8] = framingX;
    camera.projectionMatrix[9] = framingY;
    if (ready) constrainView();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement!);
  resize();
  reset();
  const finalRotation = new Quat().copy(camera.quaternion);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const started = performance.now();
  let frame = 0;
  let disposed = false;
  let buildingsStarted: number | null = null;
  const smooth = (progress: number): number => {
    const bounded = Math.max(0, Math.min(1, progress));
    return bounded * bounded * (3 - 2 * bounded);
  };
  const draw = (now: number): void => {
    if (disposed) return;
    const elapsed = reducedMotion ? 2000 : now - started;
    const rise = smooth(elapsed / 500);
    const travel = smooth((elapsed - 300) / 1700);
    const extrusion = buildingsStarted === null ? 0 : reducedMotion ? 1 : smooth((now - buildingsStarted) / 850);
    program.uniforms.extrusion.value = extrusion;
    program.uniforms.lift.value = rise * extrusion;
    program.uniforms.opacity.value = smooth(elapsed / 220);
    mesh.position.y = separation * rise;
    gl.clearColor(0, 0, 0, 0);
    if (!ready) {
      camera.quaternion.copy(startRotation).slerp(finalRotation, travel);
      const distance = mapDistance + (viewingDistance() - mapDistance) * travel;
      const focus = mapTarget.clone().lerp(new Vec3(0, mesh.position.y, 0), travel);
      camera.position.set(0, 0, distance).applyQuaternion(camera.quaternion).add(focus);
      camera.perspective({ fov: background.fov + (38 - background.fov) * travel, near: .1, far: Math.max(30, distance * 3) });
      frameArtwork(12 * rise * (1 - travel), travel);
      onLift(rise);
    }
    renderer.render({ scene, camera });
    if (elapsed >= 2000 && buildingsStarted !== null && extrusion === 1 && !ready) {
      ready = true;
      camera.lookAt(target);
      onReady();
    }
    frame = requestAnimationFrame(draw);
  };
  const contextLost = (event: Event): void => {
    event.preventDefault();
    cancelAnimationFrame(frame);
    onFailure(new Error(t("The 3D view was interrupted. Close this view and try again.")));
  };
  canvas.addEventListener("webglcontextlost", contextLost);
  frame = requestAnimationFrame(draw);
  return {
    revealBuildings: (completeRelief) => {
      if (disposed) throw new Error("Cannot add buildings to a closed city artwork.");
      const nextGeometry = reliefGeometry(gl, completeRelief);
      mesh.geometry = nextGeometry;
      geometry.remove();
      geometry = nextGeometry;
      buildingsStarted = completeRelief.groundVertexCount === completeRelief.positions.length / 3
        ? performance.now() - 850 : Math.max(performance.now(), started + 300);
      // The shadow texture uses model coordinates, independent of the artwork’s lift.
      const elevation = mesh.position.y;
      try {
        mesh.position.y = 0;
        gl.clearColor(1, 1, 1, 1);
        shadow.render({ scene });
      } finally {
        mesh.position.y = elevation;
      }
    },
    reset,
    rotate: (direction) => updateView(() => {
      const x = camera.position.x - target.x;
      const z = camera.position.z - target.z;
      camera.position.x = target.x + x * Math.cos(direction) + z * Math.sin(direction);
      camera.position.z = target.z + z * Math.cos(direction) - x * Math.sin(direction);
    }),
    tilt: (direction) => updateView(() => {
      const offset = camera.position.clone().sub(target);
      const distance = offset.distance();
      const polar = Math.max(.001, Math.min(Math.PI - .001, Math.acos(offset.y / distance) + direction));
      const azimuth = Math.atan2(offset.x, offset.z);
      camera.position.set(target.x + distance * Math.sin(polar) * Math.sin(azimuth), target.y + distance * Math.cos(polar), target.z + distance * Math.sin(polar) * Math.cos(azimuth));
    }),
    zoom: (factor) => updateView(() => {
      const offset = camera.position.clone().sub(target);
      const distance = offset.distance();
      camera.position.copy(offset).multiply(Math.max(.35, Math.min(20, distance * factor)) / distance).add(target);
    }),
    pan: (x, y) => updateView(() => {
      const unitsPerPixel = 2 * camera.position.distance(target) * Math.tan(camera.fov * Math.PI / 360) / canvas.clientHeight;
      const right = new Vec3(camera.matrix[0], camera.matrix[1], camera.matrix[2]).multiply(-x * unitsPerPixel);
      const up = new Vec3(camera.matrix[4], camera.matrix[5], camera.matrix[6]).multiply(y * unitsPerPixel);
      const offset = right.add(up);
      target.add(offset);
      camera.position.add(offset);
    }),
    image: (details) => {
      const originalDpr = renderer.dpr;
      try {
        const exportScale = 2400 / Math.max(canvas.clientWidth, canvas.clientHeight);
        renderer.dpr = exportScale;
        resize();
        renderer.render({ scene, camera });
        return createReliefShareImage(canvas, background.image, details, exportScale);
      } finally {
        renderer.dpr = originalDpr;
        resize();
      }
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", contextLost);
      geometry.remove();
      program.remove();
      shadow.depthProgram.remove();
      for (const texture of shadow.target.textures) gl.deleteTexture(texture.texture);
      gl.deleteRenderbuffer(shadow.target.depthBuffer);
      gl.deleteFramebuffer(shadow.target.buffer);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
