// Signed share tokens: "<shareId>.<expiresUnix>.<hmac>". The signing key is passed in
// by server code; nothing here reads secrets.

export const SHARE_DURATIONS = [1, 7, 30] as const;
export type ShareDays = (typeof SHARE_DURATIONS)[number];

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(message))));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signShareToken(key: string, shareId: string, expiresAt: Date): Promise<string> {
  const exp = Math.floor(expiresAt.getTime() / 1000);
  const payload = `${shareId}.${exp}`;
  return `${payload}.${await hmac(key, payload)}`;
}

export type ShareTokenCheck =
  | { ok: true; shareId: string; expiresAt: Date }
  | { ok: false; reason: "invalid" | "expired" };

export async function verifyShareToken(key: string, token: string, now: Date = new Date()): Promise<ShareTokenCheck> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "invalid" };
  const [shareId = "", expRaw = "", sig = ""] = parts;
  if (!/^[0-9a-f-]{36}$/i.test(shareId) || !/^\d{1,12}$/.test(expRaw)) return { ok: false, reason: "invalid" };
  const expected = await hmac(key, `${shareId}.${expRaw}`);
  if (!safeEqual(sig, expected)) return { ok: false, reason: "invalid" };
  const expiresAt = new Date(Number(expRaw) * 1000);
  if (expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true, shareId, expiresAt };
}

export function shareExpiry(days: ShareDays, now: Date = new Date()): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}
