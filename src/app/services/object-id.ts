/**
 * Client-side Mongo ObjectID hex generator.
 *
 * Produces the same 12-byte / 24-char-hex shape the Mongo drivers
 * generate (and that chat-service stores as `_id` on channels, messages,
 * etc.): 4 bytes Unix timestamp (seconds, big-endian) + 5 random bytes
 * stable per process + 3-byte counter.
 *
 * Used for custom-section IDs so they share one opaque shape with the
 * rest of the app — the URL mapper passes 24-hex tokens through
 * unchanged instead of FNV-hashing them.
 */
function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  return buf;
}

const PROCESS_RAND = randomBytes(5);
let counter = Math.floor(Math.random() * 0xffffff);

function toHex(buf: Uint8Array): string {
  let s = "";
  for (let i = 0; i < buf.length; i++) s += buf[i].toString(16).padStart(2, "0");
  return s;
}

export function newObjectIDHex(): string {
  const ts = Math.floor(Date.now() / 1000) & 0xffffffff;
  counter = (counter + 1) & 0xffffff;
  const tsHex = ts.toString(16).padStart(8, "0");
  const randHex = toHex(PROCESS_RAND);
  const ctrHex = counter.toString(16).padStart(6, "0");
  return tsHex + randHex + ctrHex;
}

/** True for a 24-char lowercase-hex string. */
export function isObjectIDHex(s: string): boolean {
  return /^[0-9a-f]{24}$/.test(s);
}
