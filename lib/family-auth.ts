import { env } from "cloudflare:workers";

export const FAMILY_COOKIE = "__Host-family_session";
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();
type Session = { v: 1; id: string; exp: number };

export function familyAuthConfigured() {
  return Boolean(env.FAMILY_PASSWORD && env.FAMILY_SESSION_SECRET);
}

function secrets() {
  if (!familyAuthConfigured()) throw new Error("Family authentication is not configured");
  return { password: env.FAMILY_PASSWORD!, secret: env.FAMILY_SESSION_SECRET! };
}

function encode(value: Uint8Array) {
  return btoa(String.fromCharCode(...value)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid session encoding");
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (char) => char.charCodeAt(0));
}

async function key(material: string) {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(material));
  return crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function sessionKey() {
  const { password, secret } = secrets();
  // Password changes invalidate every existing session; neither secret is sent to browsers.
  return key(JSON.stringify(["family-session-v1", secret, password]));
}

export async function passwordMatches(candidate: string) {
  const { password } = secrets();
  const hashes = await Promise.all([candidate, password].map(async (value) => new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))));
  let difference = 0;
  for (let i = 0; i < 32; i++) difference |= hashes[0][i] ^ hashes[1][i];
  return difference === 0;
}

export async function createFamilySession(now = Date.now()) {
  const session: Session = { v: 1, id: crypto.randomUUID(), exp: Math.floor(now / 1000) + SESSION_SECONDS };
  const payload = encode(encoder.encode(JSON.stringify(session)));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await sessionKey(), encoder.encode(payload)));
  return { token: `${payload}.${encode(signature)}`, session };
}

export async function verifyFamilySession(token: string | undefined, now = Date.now()): Promise<Session | null> {
  if (!token || token.length > 1000 || !familyAuthConfigured()) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const signature = decode(parts[1]);
    if (signature.length !== 32 || !(await crypto.subtle.verify("HMAC", await sessionKey(), signature, encoder.encode(parts[0])))) return null;
    const session = JSON.parse(new TextDecoder().decode(decode(parts[0]))) as Session;
    const current = Math.floor(now / 1000);
    if (session.v !== 1 || typeof session.id !== "string" || !/^[0-9a-f-]{36}$/.test(session.id)
      || !Number.isInteger(session.exp) || session.exp <= current || session.exp > current + SESSION_SECONDS) return null;
    return session;
  } catch { return null; }
}

export function sessionToken(cookieHeader: string | null) {
  return cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${FAMILY_COOKIE}=`))?.slice(FAMILY_COOKIE.length + 1);
}

export function familyCookie(token: string, maxAge = SESSION_SECONDS) {
  return `${FAMILY_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export async function loginAttemptKey(ip: string) {
  const { secret } = secrets();
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(`family-login:${ip}`)));
  return encode(signature);
}
