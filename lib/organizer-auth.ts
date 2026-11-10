// One shared password guards the organizer side until there are real accounts. The cookie holds
// an expiry signed with ORGANIZER_SECRET, using Web Crypto so that proxy.ts can check it as well.
export const ORGANIZER_COOKIE = "venu_organizer";
export const SESSION_SECONDS = 7 * 24 * 60 * 60;

const encoder = new TextEncoder();

function settings() {
  const password = process.env.ORGANIZER_PASSWORD;
  const secret = process.env.ORGANIZER_SECRET;
  return password && secret ? { password, secret } : null;
}

/** "open" only on a laptop with nothing configured; a deployment without settings stays locked */
export function organizerLock(): "open" | "locked" | "password" {
  if (settings()) return "password";
  return process.env.NODE_ENV === "production" ? "locked" : "open";
}

async function sign(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Buffer.from(
    await crypto.subtle.sign("HMAC", key, encoder.encode(text)),
  ).toString("base64url");
}

/** compares in constant time, so the answer's timing gives nothing away */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function checkPassword(input: string): Promise<boolean> {
  const s = settings();
  // both sides are hashed first, so their lengths never differ
  return (
    !!s &&
    same(
      await sign(s.secret, `password:${input}`),
      await sign(s.secret, `password:${s.password}`),
    )
  );
}

export async function createSession(now = Date.now()): Promise<string> {
  const s = settings();
  if (!s)
    throw new Error("ORGANIZER_PASSWORD and ORGANIZER_SECRET are required");
  const expires = Math.floor(now / 1000) + SESSION_SECONDS;
  return `${expires}.${await sign(s.secret, `organizer:${expires}`)}`;
}

export async function isOrganizer(
  token: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  const lock = organizerLock();
  if (lock !== "password") return lock === "open";
  const s = settings()!;
  const [expires, signature] = token?.split(".") ?? [];
  if (!signature || !(Number(expires) > now / 1000)) return false;
  return same(signature, await sign(s.secret, `organizer:${expires}`));
}

/** only pages of the organizer side, so the login form can't send anyone off-site */
export function safeNext(next: unknown): string {
  return typeof next === "string" && /^\/organizer\/events(\/|\?|$)/.test(next)
    ? next
    : "/organizer/events";
}
