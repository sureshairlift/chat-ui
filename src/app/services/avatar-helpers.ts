/**
 * Avatar helpers — single source of truth for the color + initials a
 * user / channel renders with. Every consumer (adapter, bubble,
 * message-info panel, board panel, AvatarComponent fallback) calls
 * into here so the same person renders identically across the app.
 *
 * Color logic:
 *   - Each user_ref maps to ONE deterministic palette index.
 *   - For namespaced refs ("op:42", "ext:42") the trailing integer
 *     is the seed → index = id % palette.length. This is what the
 *     user asked for: "divide by 20, get the quotient/remainder,
 *     use that position".
 *   - For non-numeric refs ("bot:ai", custom strings) a djb2-ish
 *     hash of the whole ref keeps the same ref stable across reloads.
 *
 * Initials logic:
 *   - Trim, split on whitespace.
 *   - 2+ words → first letter of word 1 + first letter of word 2 ("Rajkumar K" → "RK")
 *   - 1 word  → first two chars ("Rajkumar" → "RA")
 *   - empty   → fall back to the ref's first two chars
 *
 * Why a separate file and not just stuff inside adapters.ts:
 *   the AvatarComponent itself wants to derive these when its
 *   inputs are sparse — a helper file avoids the cycle.
 */

/** 20 paired tones for the avatar palette. Each entry has a SOLID
 *  variant (dark background, used for direct / 1:1) and a TINTED
 *  variant (light bg + dark text, used for groups / spaces).
 *  Pairs let the SAME user keep the same hue family across direct
 *  vs group renderings. */
export const AVATAR_PALETTE_PAIRS = [
  { solid: 'bg-emerald-500', tinted: 'bg-emerald-100 text-emerald-700' },
  { solid: 'bg-sky-500',     tinted: 'bg-sky-100 text-sky-700' },
  { solid: 'bg-violet-500',  tinted: 'bg-violet-100 text-violet-700' },
  { solid: 'bg-amber-500',   tinted: 'bg-amber-100 text-amber-700' },
  { solid: 'bg-rose-500',    tinted: 'bg-rose-100 text-rose-700' },
  { solid: 'bg-teal-500',    tinted: 'bg-teal-100 text-teal-700' },
  { solid: 'bg-indigo-500',  tinted: 'bg-indigo-100 text-indigo-700' },
  { solid: 'bg-fuchsia-500', tinted: 'bg-fuchsia-100 text-fuchsia-700' },
  { solid: 'bg-lime-500',    tinted: 'bg-lime-100 text-lime-700' },
  { solid: 'bg-cyan-500',    tinted: 'bg-cyan-100 text-cyan-700' },
  { solid: 'bg-purple-500',  tinted: 'bg-purple-100 text-purple-700' },
  { solid: 'bg-orange-500',  tinted: 'bg-orange-100 text-orange-700' },
  { solid: 'bg-pink-500',    tinted: 'bg-pink-100 text-pink-700' },
  { solid: 'bg-blue-500',    tinted: 'bg-blue-100 text-blue-700' },
  { solid: 'bg-green-500',   tinted: 'bg-green-100 text-green-700' },
  { solid: 'bg-red-500',     tinted: 'bg-red-100 text-red-700' },
  { solid: 'bg-yellow-500',  tinted: 'bg-yellow-100 text-yellow-700' },
  // Replaced the previous neutral-gray slots (slate/stone/zinc) with
  // deeper shades of saturated hues — those greys read as "inactive"
  // on a vivid avatar. Tinted pairs use the same 100 bg + 800 text
  // so the visible weight matches the 700 solids.
  { solid: 'bg-rose-700',    tinted: 'bg-rose-100 text-rose-800' },     // deep cherry
  { solid: 'bg-emerald-700', tinted: 'bg-emerald-100 text-emerald-800' }, // deep moss
  { solid: 'bg-blue-700',    tinted: 'bg-blue-100 text-blue-800' },     // deep ocean
];

/** Pull the trailing integer out of a namespaced ref ("op:42",
 *  "ext:128") or null if there isn't one. */
function trailingInt(ref: string): number | null {
  const m = ref.match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

/** djb2-style string hash. Stable across reloads, doesn't depend on
 *  locale. Returns a non-negative 32-bit int. */
function strHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h;
}

/** Palette index for any seed. Prefers `userId % palette` when the
 *  seed carries a numeric id (the algorithm the user asked for);
 *  falls back to a hash for non-numeric seeds (bot:ai, channel ids
 *  before any id is assigned). */
export function paletteIndexFor(seed: string): number {
  if (!seed) return 0;
  const n = trailingInt(seed);
  const idx = n !== null ? n : strHash(seed);
  return idx % AVATAR_PALETTE_PAIRS.length;
}

/** Deterministic solid color for a user_ref. The same ref always
 *  picks the same hue. */
export function colorForUserRef(ref: string): string {
  return AVATAR_PALETTE_PAIRS[paletteIndexFor(ref)].solid;
}

/** Deterministic tinted color for a channel-id / group avatar. Same
 *  palette index as the solid so a 1:1 with the same person picks
 *  the same hue family as the group. */
export function tintedColorForSeed(seed: string): string {
  return AVATAR_PALETTE_PAIRS[paletteIndexFor(seed)].tinted;
}

/** Build initials from a display name. Same rule everywhere:
 *  first letter of word 1 + first letter of word 2 when there are
 *  2+ words; first two chars of the single word otherwise. Falls
 *  back to the ref's first two chars (or "?") when name is empty. */
export function initialsForName(name: string | null | undefined, fallbackRef: string = ""): string {
  const trimmed = (name || "").trim();
  if (!trimmed) {
    return (fallbackRef || "?").slice(0, 2).toUpperCase();
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}
