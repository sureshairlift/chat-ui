import { Pipe, PipeTransform } from "@angular/core";

/**
 * Maps an emoji character (or ZWJ sequence) to a Noto Color Emoji
 * asset URL hosted by Google Fonts.
 *
 * URL shape: `https://fonts.gstatic.com/s/e/notoemoji/latest/<cp>/<size>.<kind>`
 * where `cp` is the lowercase-hex codepoint(s) joined with `_`
 * (FE0F variation selectors stripped — Noto's URLs don't include
 * them).
 *
 * Examples:
 *   📌      → 1f4cc/72.png
 *   🇬🇧      → 1f1ec_1f1e7/72.png
 *   👨‍💻      → 1f468_200d_1f4bb/72.png
 *
 * Two `kind`s are exposed:
 *   - "png"  : static high-resolution sticker (use at rest).
 *   - "webp" : animated version (use on hover for the playful feel).
 *
 * Emojis that aren't in Noto's catalog will 404; callers should
 * supply an `(error)` fallback if they care about non-curated input
 * (e.g. user-pasted emojis from the Custom field).
 */
const NOTO_BASE = "https://fonts.gstatic.com/s/e/notoemoji/latest";

export function notoCodepoint(emoji: string): string {
  const parts: string[] = [];
  for (const ch of emoji) {
    const cp = ch.codePointAt(0);
    if (cp == null) continue;
    if (cp === 0xfe0f) continue; // variation selector — Noto omits it
    parts.push(cp.toString(16));
  }
  return parts.join("_");
}

export function notoEmojiUrl(emoji: string, kind: "png" | "webp" = "png", size: 32 | 72 | 512 = 72): string {
  if (!emoji) return "";
  // Noto only ships animated WebPs at size 512 (the reference
  // high-res asset). Any other size (32, 72) 404s for `.webp`, which
  // is why every hover used to fall back to PNG and no animation
  // ever played. Force 512 for webp regardless of caller's request;
  // PNG keeps the requested size.
  const actualSize = kind === "webp" ? 512 : size;
  return `${NOTO_BASE}/${notoCodepoint(emoji)}/${actualSize}.${kind}`;
}

/**
 * Image (error) handler — when an emoji WebP 404s (Noto only
 * animates a subset of emojis), swap the src to the same emoji's
 * PNG URL so the user sees the static sticker instead of a broken
 * image icon. Idempotent: once swapped to .png, a subsequent error
 * is ignored (avoids infinite loops if the PNG also fails).
 *
 * Usage in templates: `(error)="notoWebpFallback($event)"`.
 */
export function notoWebpFallback(ev: Event): void {
  const img = ev.target as HTMLImageElement | null;
  if (!img) return;
  if (img.src.includes(".webp")) {
    img.src = img.src.replace(".webp", ".png");
  }
}

@Pipe({ name: "notoEmoji", standalone: true })
export class NotoEmojiPipe implements PipeTransform {
  transform(emoji: string, kind: "png" | "webp" = "png", size: 32 | 72 | 512 = 72): string {
    return notoEmojiUrl(emoji, kind, size);
  }
}
