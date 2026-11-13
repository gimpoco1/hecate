import { createPrivateKey, sign } from "node:crypto";

/** @typedef {{ APPLE_MAPS_KEY_ID?: string, APPLE_MAPS_TEAM_ID?: string, APPLE_MAPS_PRIVATE_KEY?: string, APPLE_MAPS_ALLOWED_ORIGINS?: string, APPLE_MAPS_ORIGIN?: string }} AppleMapsEnvironment */

/** @param {Record<string, string | number>} value */
function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** @param {string} value */
function normalizePrivateKey(value) {
  const pem = value.replace(/\\n/g, "\n").trim();
  const body = pem.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\s/g, "");
  if (!pem.startsWith("-----BEGIN PRIVATE KEY-----") || !pem.endsWith("-----END PRIVATE KEY-----") || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) {
    throw new Error("APPLE_MAPS_PRIVATE_KEY must be a PKCS#8 PEM private key.");
  }
  return `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`;
}

/** @param {import('node:http').IncomingMessage} request */
function requestOrigin(request) {
  const header = request.headers.origin;
  if (header) return Array.isArray(header) ? header[0] : header;
  return new URL(request.url || "/", "http://localhost").searchParams.get("origin");
}

/** @param {import('node:http').ServerResponse} response @param {number} status @param {string} body */
function send(response, status, body) {
  response.statusCode = status;
  response.end(body);
}

/** Sign only origin-scoped browser tokens; never cache tokens across requesting origins.
 * @param {AppleMapsEnvironment} environment
 * @returns {(request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) => void}
 */
export function createMapKitTokenHandler(environment) {
  return (request, response) => {
    response.setHeader("Vary", "Origin");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    const origins = environment.APPLE_MAPS_ALLOWED_ORIGINS?.split(",").map(origin => origin.trim()).filter(Boolean);
    const origin = requestOrigin(request) || environment.APPLE_MAPS_ORIGIN;
    if (!origins?.length) return send(response, 503, "APPLE_MAPS_ALLOWED_ORIGINS is not configured.");
    if (!origin || !origins.includes(origin)) return send(response, 403, `Apple Maps origin is not allowed: ${origin || "missing"}`);
    response.setHeader("Access-Control-Allow-Origin", origin);
    if (request.method === "OPTIONS") {
      response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      return send(response, 204, "");
    }
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET, OPTIONS");
      return send(response, 405, "Method not allowed. Use GET to request an Apple Maps token.");
    }
    const teamId = environment.APPLE_MAPS_TEAM_ID;
    const keyId = environment.APPLE_MAPS_KEY_ID;
    if (!teamId || !keyId || !environment.APPLE_MAPS_PRIVATE_KEY) {
      return send(response, 503, "Apple Maps requires APPLE_MAPS_TEAM_ID, APPLE_MAPS_KEY_ID and APPLE_MAPS_PRIVATE_KEY on the token server.");
    }
    try {
      const privateKey = createPrivateKey(normalizePrivateKey(environment.APPLE_MAPS_PRIVATE_KEY));
      if (privateKey.asymmetricKeyType !== "ec" || privateKey.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
        throw new Error("APPLE_MAPS_PRIVATE_KEY must use the P-256 elliptic curve for ES256.");
      }
      const now = Math.floor(Date.now() / 1000);
      const header = encode({ alg: "ES256", kid: keyId, typ: "JWT" });
      const payload = encode({ iss: teamId, iat: now, exp: now + 3600, scope: "mapkit_js", origin });
      const signature = sign("sha256", Buffer.from(`${header}.${payload}`), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
      send(response, 200, `${header}.${payload}.${signature}`);
    } catch (error) {
      console.error("Apple Maps token signing failed", { keyId, error: error instanceof Error ? error.message : String(error) });
      send(response, 503, "Apple Maps signing failed. Check APPLE_MAPS_PRIVATE_KEY is the P-256 private key matching APPLE_MAPS_KEY_ID.");
    }
  };
}

/** @param {import('node:http').IncomingMessage} request @param {import('node:http').ServerResponse} response */
export default function handler(request, response) {
  createMapKitTokenHandler(process.env)(request, response);
}
