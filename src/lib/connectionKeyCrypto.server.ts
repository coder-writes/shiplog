// Server-only: encrypts per-user connector keys at rest with AES-GCM (Web Crypto, works in Workers).
// Uses APP_USER_CONNECTION_KEY_SECRET (base64, 32 bytes).

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

async function key(): Promise<CryptoKey> {
  const raw = process.env["APP_USER_CONNECTION_KEY_SECRET"];
  if (!raw) throw new Error("APP_USER_CONNECTION_KEY_SECRET is not set");
  return crypto.subtle.importKey("raw", fromB64(raw) as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptConnectionKey(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), enc.encode(plaintext)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return toB64(out);
}

export async function decryptConnectionKey(stored: string): Promise<string> {
  const buf = fromB64(stored);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: buf.subarray(0, 12) as BufferSource },
    await key(),
    buf.subarray(12) as BufferSource,
  );
  return dec.decode(plain);
}
