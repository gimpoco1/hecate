/*
 * Adapted from React Bits Topography by David Haz:
 * https://github.com/DavidHDev/react-bits/blob/main/src/ts-default/Backgrounds/Topography/Topography.tsx
 * Copyright (c) 2026 David Haz
 *
 * MIT + Commons Clause License Condition v1.0
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, and distribute the Software as part of
 * an application, website, or product, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * You may use this Software, including for any commercial purpose, so long as
 * you do not sell, sublicense, or redistribute the components themselves,
 * whether alone, in a bundle, or as a ported version.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { useEffect, useRef } from "react";
import { Mesh, Program, Renderer, Triangle } from "ogl";

const vertex = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const fragment = `#version 300 es
precision highp float;
uniform vec2 resolution;
uniform vec4 controlA;
uniform vec4 controlB;
uniform vec4 controlC;
uniform vec4 controlD;
out vec4 color;

float wave(float t, vec4 control) {
  float angle = 6.2831853 * t;
  return 0.5 * (control.x * sin(angle) + control.y * cos(angle)
    + control.z * sin(2.0 * angle) + control.w * cos(2.0 * angle));
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  vec2 samplePoint = (uv - 0.5) / 1.65 + 0.5;
  vec2 horizontal = vec2(wave(samplePoint.x, controlA), wave(samplePoint.x, controlB));
  vec2 vertical = vec2(wave(samplePoint.y, controlC), wave(samplePoint.y, controlD));
  float elevation = distance(horizontal, vertical);
  float band = elevation * 2.6;
  float distanceToLine = min(fract(band), 1.0 - fract(band));
  float antiAlias = fwidth(band) + 0.0001;
  float line = 1.0 - smoothstep(0.012 - antiAlias, 0.012 + antiAlias, distanceToLine);
  vec3 forest = vec3(0.094, 0.235, 0.184);
  vec3 sage = vec3(0.408, 0.537, 0.447);
  vec3 lime = vec3(0.557, 0.647, 0.263);
  vec3 tint = mix(forest, sage, smoothstep(0.2, 1.2, elevation));
  tint = mix(tint, lime, smoothstep(1.2, 2.3, elevation));
  color = vec4(tint * line, line);
}`;

const controlIndices = [
  [1, -2, 3, -4],
  [9, -8, 7, -6],
  [5, 2, 5, -5],
  [-1, -3, 8, 9],
];

export function TopographyBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new Renderer({
      webgl: 2,
      alpha: true,
      antialias: false,
      dpr: Math.min(window.devicePixelRatio || 1, 1.5),
    });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    container.appendChild(canvas);

    const resolution = new Float32Array([1, 1]);
    const controls = controlIndices.map(() => new Float32Array(4));
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        resolution: { value: resolution },
        controlA: { value: controls[0] },
        controlB: { value: controls[1] },
        controlC: { value: controls[2] },
        controlD: { value: controls[3] },
      },
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let lastRender = 0;
    let elapsed = 0;

    const render = (time: number) => {
      controlIndices.forEach((indices, group) => {
        indices.forEach((index, item) => {
          controls[group][item] =
            2.6 * Math.sin(time * 0.16 * Math.sin(index * 0.05) + index);
        });
      });
      renderer.render({ scene: mesh });
    };

    const resize = () => {
      renderer.setSize(container.clientWidth, container.clientHeight);
      resolution[0] = gl.drawingBufferWidth;
      resolution[1] = gl.drawingBufferHeight;
      render(elapsed);
    };

    const animate = (now: number) => {
      if (now - lastRender >= 33) {
        elapsed += Math.min(now - lastRender, 50) * 0.001;
        lastRender = now;
        render(elapsed);
      }
      frame = requestAnimationFrame(animate);
    };

    const updateAnimation = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (!document.hidden && !reducedMotion.matches) {
        lastRender = performance.now();
        frame = requestAnimationFrame(animate);
      } else {
        render(elapsed);
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    document.addEventListener("visibilitychange", updateAnimation);
    reducedMotion.addEventListener("change", updateAnimation);
    updateAnimation();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", updateAnimation);
      reducedMotion.removeEventListener("change", updateAnimation);
      container.removeChild(canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return <div ref={containerRef} className="leaderboard-topography" aria-hidden="true" />;
}
