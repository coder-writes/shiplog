// Server-only: encrypts GitHub tokens at rest with AES-GCM (Web Crypto, works in Workers).
// The key comes from the GITHUB_TOKEN_ENCRYPTION_KEY secret and never leaves the server.

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function getKey(): Promise<CryptoKey> {
  const secret = process.env["GITHUB_TOKEN_ENCRYPTION_KEY"];
  if (!secret) throw new Error("Server is missing its token encryption key.");
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptToken(plain: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain)));
  return `v1:${toB64(iv)}:${toB64(ct)}`;
}

export async function decryptToken(stored: string): Promise<string> {
  if (!stored.startsWith("v1:")) throw new Error("Stored GitHub token is in an unknown format. Reconnect GitHub.");
  const [, ivB64 = "", ctB64 = ""] = stored.split(":");
  const key = await getKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(ivB64) as BufferSource },
    key,
    fromB64(ctB64) as BufferSource,
  );
  return dec.decode(plain);
}
