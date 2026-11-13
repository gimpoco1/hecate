import { generateKeyPairSync, verify } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createMapKitTokenHandler } from "../api/mapkit-token.mjs";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const origins = ["https://hecate.example", "capacitor://localhost", "https://localhost", "http://localhost:5173"];
const server = createServer(createMapKitTokenHandler({
  APPLE_MAPS_TEAM_ID: "TESTTEAM01",
  APPLE_MAPS_KEY_ID: "TESTKEY001",
  APPLE_MAPS_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString().replace(/\n/g, "\\n"),
  APPLE_MAPS_ALLOWED_ORIGINS: origins.join(","),
  APPLE_MAPS_ORIGIN: origins[0],
}));
/** @type {string} */
let endpoint;
beforeAll(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Token test server did not bind a TCP port.");
  endpoint = `http://127.0.0.1:${address.port}/api/mapkit-token`;
});
afterAll(async () => { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

it.each(origins)("serves a verifiable ES256 token scoped to %s", async (origin) => {
  const response = await fetch(endpoint, { headers: { Origin: origin } });
  expect(response.status).toBe(200);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const [header, payload, signature] = (await response.text()).split(".");
  expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "ES256", kid: "TESTKEY001", typ: "JWT" });
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  expect(claims).toMatchObject({ iss: "TESTTEAM01", origin, scope: "mapkit_js" });
  expect(claims.exp - claims.iat).toBe(3600);
  expect(verify("sha256", Buffer.from(`${header}.${payload}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"))).toBe(true);
});

it("authorizes same-origin browser requests and native preflights", async () => {
  const response = await fetch(`${endpoint}?origin=${encodeURIComponent(origins[3])}`);
  expect(response.status).toBe(200);
  const claims = JSON.parse(Buffer.from((await response.text()).split(".")[1], "base64url").toString());
  expect(claims.origin).toBe(origins[3]);
  const preflight = await fetch(endpoint, { method: "OPTIONS", headers: { Origin: origins[2] } });
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
});

it("rejects a disallowed header even when the query specifies an allowed origin", async () => {
  const response = await fetch(`${endpoint}?origin=${encodeURIComponent(origins[0])}`, { headers: { Origin: "https://untrusted.example" } });
  expect(response.status).toBe(403);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  expect(await response.text()).toContain("https://untrusted.example");
});

it("rejects methods that do not request tokens", async () => {
  const response = await fetch(endpoint, { method: "POST", headers: { Origin: origins[0] } });
  expect(response.status).toBe(405);
});
