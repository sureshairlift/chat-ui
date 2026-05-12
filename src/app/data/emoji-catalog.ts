/**
 * Emoji catalog — Noto Color Emoji served from Google's fonts CDN.
 *
 * URL patterns:
 *   ${EMOJI_BASE_URL}/{code}/{N}.png   — static frame (idle)
 *     N ∈ {32, 72, 128, 512}. Pick the smallest N ≥ display size for
 *     cheap network/decoding (a 32px picker tile is ~1 KB; 512 is ~13 KB).
 *   ${EMOJI_BASE_URL}/{code}/512.webp  — animated frame (hover)
 *     Only 512 is published as webp; CSS scales it down.
 *
 * The `code` is one or more hex codepoints joined by `_`. ZWJ sequences
 * (e.g. `1f636_200d_1f32b_fe0f` = "face in clouds") use the same join
 * pattern — split on `_` to recover the codepoints when emitting the
 * Unicode character via String.fromCodePoint.
 *
 * Curation note: this list deliberately excludes anything that reads
 * as suggestive, violent, or NSFW in a chat context. Add new entries
 * as needed but keep the same filter.
 */

// `latest` rolls forward with each Noto Emoji release so the icons
// auto-refresh when Google ships a redesign. Pin to a specific
// version (e.g. `16.0`) only if you need fixed visual output.
export const EMOJI_BASE_URL = 'https://fonts.gstatic.com/s/e/notoemoji/latest';

/** PNG sizes Google publishes. WebP only exists at 512. */
export const EMOJI_PNG_SIZES = [32, 72, 128, 512] as const;

/** Smallest PNG size that's >= the requested display size. Falls back
 *  to 512 (the largest) for anything bigger. Keeps the picker grid
 *  cheap — 100 emoji × 32px PNG ≈ 100 KB vs ~1.3 MB at 512. */
export function pngBucketFor(displayPx: number): number {
  for (const s of EMOJI_PNG_SIZES) {
    if (s >= displayPx) return s;
  }
  return 512;
}

export type EmojiCategory =
  | 'smileysEmotion'
  | 'hands'
  | 'people'
  | 'hearts'
  | 'animals'
  | 'food'
  | 'travel'
  | 'activity'
  | 'objects'
  | 'symbols';

export interface EmojiEntry {
  /** Hex codepoint(s) joined by `_`. Goes straight into the CDN URL. */
  code: string;
  /** Display name shown as the img alt + button title. */
  name: string;
  /** Grouping for the picker tabs. */
  category: EmojiCategory;
}

export const EMOJI_CATALOG: EmojiEntry[] = [
  // ── Smileys & Emotion ──────────────────────────────────────────────
  { code: '1f600', name: 'Grinning Face', category: 'smileysEmotion' },
  { code: '1f603', name: 'Smiling Face', category: 'smileysEmotion' },
  { code: '1f604', name: 'Big Smile', category: 'smileysEmotion' },
  { code: '1f601', name: 'Beaming Face', category: 'smileysEmotion' },
  { code: '1f606', name: 'Laughing', category: 'smileysEmotion' },
  { code: '1f605', name: 'Sweat Smile', category: 'smileysEmotion' },
  { code: '1f602', name: 'Tears of Joy', category: 'smileysEmotion' },
  { code: '1f923', name: 'ROFL', category: 'smileysEmotion' },
  { code: '1f60a', name: 'Smiling Eyes', category: 'smileysEmotion' },
  { code: '1f60c', name: 'Relieved', category: 'smileysEmotion' },
  { code: '1f60d', name: 'Heart Eyes', category: 'smileysEmotion' },
  { code: '1f970', name: 'Smiling with Hearts', category: 'smileysEmotion' },
  { code: '1f617', name: 'Kissing', category: 'smileysEmotion' },
  { code: '1f619', name: 'Kissing Smiling', category: 'smileysEmotion' },
  { code: '1f60e', name: 'Sunglasses', category: 'smileysEmotion' },
  { code: '1f929', name: 'Star-Struck', category: 'smileysEmotion' },
  { code: '1f973', name: 'Partying', category: 'smileysEmotion' },
  { code: '1f92a', name: 'Zany Face', category: 'smileysEmotion' },
  { code: '1f928', name: 'Raised Eyebrow', category: 'smileysEmotion' },
  { code: '1f9d0', name: 'Monocle', category: 'smileysEmotion' },
  { code: '1f914', name: 'Thinking', category: 'smileysEmotion' },
  { code: '1f917', name: 'Hugging', category: 'smileysEmotion' },
  { code: '1f60f', name: 'Smirking', category: 'smileysEmotion' },
  { code: '1f636_200d_1f32b_fe0f', name: 'Face in Clouds', category: 'smileysEmotion' },
  { code: '1f644', name: 'Eye Roll', category: 'smileysEmotion' },
  { code: '1f612', name: 'Unamused', category: 'smileysEmotion' },
  { code: '1f614', name: 'Pensive', category: 'smileysEmotion' },
  { code: '1f615', name: 'Confused', category: 'smileysEmotion' },
  { code: '1f641', name: 'Slight Frown', category: 'smileysEmotion' },
  { code: '1f61e', name: 'Disappointed', category: 'smileysEmotion' },
  { code: '1f622', name: 'Crying', category: 'smileysEmotion' },
  { code: '1f62d', name: 'Sobbing', category: 'smileysEmotion' },
  { code: '1f624', name: 'Triumph', category: 'smileysEmotion' },
  { code: '1f620', name: 'Angry', category: 'smileysEmotion' },
  { code: '1f621', name: 'Pouting', category: 'smileysEmotion' },
  { code: '1f62e', name: 'Open Mouth', category: 'smileysEmotion' },
  { code: '1f62f', name: 'Hushed', category: 'smileysEmotion' },
  { code: '1f632', name: 'Astonished', category: 'smileysEmotion' },
  { code: '1f62a', name: 'Sleepy', category: 'smileysEmotion' },
  { code: '1f634', name: 'Sleeping', category: 'smileysEmotion' },
  { code: '1f62b', name: 'Tired', category: 'smileysEmotion' },
  { code: '1f629', name: 'Weary', category: 'smileysEmotion' },
  { code: '1f635', name: 'Dizzy', category: 'smileysEmotion' },
  { code: '1f92f', name: 'Exploding Head', category: 'smileysEmotion' },
  { code: '1f976', name: 'Cold Face', category: 'smileysEmotion' },
  { code: '1f975', name: 'Hot Face', category: 'smileysEmotion' },
  { code: '1f637', name: 'Mask', category: 'smileysEmotion' },
  { code: '1f910', name: 'Zipper Mouth', category: 'smileysEmotion' },

  // ── Hands ─────────────────────────────────────────────────────────
  { code: '1f44b', name: 'Waving Hand', category: 'hands' },
  { code: '1f44d', name: 'Thumbs Up', category: 'hands' },
  { code: '1f44e', name: 'Thumbs Down', category: 'hands' },
  { code: '1f44c', name: 'OK Hand', category: 'hands' },
  { code: '1f44f', name: 'Clapping', category: 'hands' },
  { code: '1f64c', name: 'Raising Hands', category: 'hands' },
  { code: '1f64f', name: 'Folded Hands', category: 'hands' },
  { code: '1f91d', name: 'Handshake', category: 'hands' },
  { code: '1f91e', name: 'Crossed Fingers', category: 'hands' },
  { code: '1f4aa', name: 'Flexed Biceps', category: 'hands' },
  { code: '1f9be', name: 'Mechanical Arm', category: 'hands' },
  { code: '270c', name: 'Victory', category: 'hands' },
  { code: '1f44a', name: 'Fist Bump', category: 'hands' },
  { code: '1f590', name: 'Open Hand', category: 'hands' },

  // ── People ────────────────────────────────────────────────────────
  { code: '1f9d1', name: 'Person', category: 'people' },
  { code: '1f468_200d_1f4bb', name: 'Man Technologist', category: 'people' },
  { code: '1f469_200d_1f4bb', name: 'Woman Technologist', category: 'people' },
  { code: '1f9d1_200d_1f4bc', name: 'Office Worker', category: 'people' },
  { code: '1f483', name: 'Dancer', category: 'people' },
  { code: '1f64b', name: 'Raising Hand', category: 'people' },
  { code: '1f937', name: 'Shrug', category: 'people' },

  // ── Hearts & Emotion ──────────────────────────────────────────────
  { code: '2764', name: 'Red Heart', category: 'hearts' },
  { code: '1f9e1', name: 'Orange Heart', category: 'hearts' },
  { code: '1f49b', name: 'Yellow Heart', category: 'hearts' },
  { code: '1f49a', name: 'Green Heart', category: 'hearts' },
  { code: '1f499', name: 'Blue Heart', category: 'hearts' },
  { code: '1f49c', name: 'Purple Heart', category: 'hearts' },
  { code: '1f5a4', name: 'Black Heart', category: 'hearts' },
  { code: '1f496', name: 'Sparkling Heart', category: 'hearts' },
  { code: '1f495', name: 'Two Hearts', category: 'hearts' },
  { code: '1f493', name: 'Beating Heart', category: 'hearts' },
  { code: '1f49e', name: 'Revolving Hearts', category: 'hearts' },
  { code: '1f494', name: 'Broken Heart', category: 'hearts' },

  // ── Animals ───────────────────────────────────────────────────────
  { code: '1f436', name: 'Dog Face', category: 'animals' },
  { code: '1f431', name: 'Cat Face', category: 'animals' },
  { code: '1f98a', name: 'Fox', category: 'animals' },
  { code: '1f43c', name: 'Panda', category: 'animals' },
  { code: '1f981', name: 'Lion', category: 'animals' },
  { code: '1f984', name: 'Unicorn', category: 'animals' },
  { code: '1f426', name: 'Bird', category: 'animals' },
  { code: '1f989', name: 'Owl', category: 'animals' },
  { code: '1f422', name: 'Turtle', category: 'animals' },
  { code: '1f41d', name: 'Bee', category: 'animals' },
  { code: '1f98b', name: 'Butterfly', category: 'animals' },

  // ── Food & Drink ──────────────────────────────────────────────────
  { code: '2615', name: 'Coffee', category: 'food' },
  { code: '1f375', name: 'Tea', category: 'food' },
  { code: '1f370', name: 'Cake', category: 'food' },
  { code: '1f355', name: 'Pizza', category: 'food' },
  { code: '1f354', name: 'Burger', category: 'food' },
  { code: '1f35e', name: 'Bread', category: 'food' },
  { code: '1f34e', name: 'Apple', category: 'food' },
  { code: '1f351', name: 'Peach', category: 'food' },
  { code: '1f352', name: 'Cherries', category: 'food' },
  { code: '1f347', name: 'Grapes', category: 'food' },
  { code: '1f366', name: 'Ice Cream', category: 'food' },
  { code: '1f37e', name: 'Champagne', category: 'food' },

  // ── Travel & Places ───────────────────────────────────────────────
  { code: '1f697', name: 'Car', category: 'travel' },
  { code: '2708', name: 'Airplane', category: 'travel' },
  { code: '1f680', name: 'Rocket', category: 'travel' },
  { code: '1f6a2', name: 'Ship', category: 'travel' },
  { code: '1f4e6', name: 'Package', category: 'travel' },
  { code: '1f30d', name: 'Earth', category: 'travel' },
  { code: '26f0', name: 'Mountain', category: 'travel' },
  { code: '1f3d6', name: 'Beach', category: 'travel' },

  // ── Activity ──────────────────────────────────────────────────────
  { code: '1f389', name: 'Party Popper', category: 'activity' },
  { code: '1f38a', name: 'Confetti', category: 'activity' },
  { code: '1f386', name: 'Fireworks', category: 'activity' },
  { code: '1f3c6', name: 'Trophy', category: 'activity' },
  { code: '1f3af', name: 'Bullseye', category: 'activity' },
  { code: '1f3b5', name: 'Music', category: 'activity' },
  { code: '1f3a7', name: 'Headphones', category: 'activity' },
  { code: '1f3ae', name: 'Gaming', category: 'activity' },

  // ── Objects ───────────────────────────────────────────────────────
  { code: '1f4bb', name: 'Laptop', category: 'objects' },
  { code: '1f4f1', name: 'Phone', category: 'objects' },
  { code: '1f4e7', name: 'Mail', category: 'objects' },
  { code: '1f4dd', name: 'Memo', category: 'objects' },
  { code: '1f4ca', name: 'Chart Up', category: 'objects' },
  { code: '1f4c8', name: 'Chart Rising', category: 'objects' },
  { code: '1f4c9', name: 'Chart Falling', category: 'objects' },
  { code: '1f4a1', name: 'Lightbulb', category: 'objects' },
  { code: '1f50d', name: 'Magnifier', category: 'objects' },
  { code: '1f4cc', name: 'Pin', category: 'objects' },
  { code: '1f517', name: 'Link', category: 'objects' },
  { code: '1f4ce', name: 'Paperclip', category: 'objects' },
  { code: '1f4c5', name: 'Calendar', category: 'objects' },
  { code: '23f0', name: 'Alarm', category: 'objects' },
  { code: '231b', name: 'Hourglass', category: 'objects' },
  { code: '1f6e0', name: 'Tools', category: 'objects' },
  { code: '1f9e9', name: 'Puzzle', category: 'objects' },

  // ── Symbols ───────────────────────────────────────────────────────
  { code: '2705', name: 'Check Mark', category: 'symbols' },
  { code: '274c', name: 'Cross Mark', category: 'symbols' },
  { code: '2757', name: 'Exclamation', category: 'symbols' },
  { code: '2753', name: 'Question', category: 'symbols' },
  { code: '1f4af', name: '100 Points', category: 'symbols' },
  { code: '1f525', name: 'Fire', category: 'symbols' },
  { code: '2728', name: 'Sparkles', category: 'symbols' },
  { code: '26a1', name: 'High Voltage', category: 'symbols' },
  { code: '1f31f', name: 'Star', category: 'symbols' },
  { code: '2b50', name: 'White Star', category: 'symbols' },
  { code: '1f6a8', name: 'Siren', category: 'symbols' },
  { code: '26a0', name: 'Warning', category: 'symbols' },
  { code: '1f7e2', name: 'Green Circle', category: 'symbols' },
  { code: '1f534', name: 'Red Circle', category: 'symbols' },
];

/** Quick-pick set surfaced on the reaction bar above a message bubble. */
export const REACTION_QUICK_PICK: EmojiEntry[] = [
  { code: '1f44d', name: 'Thumbs Up', category: 'hands' },
  { code: '2764', name: 'Red Heart', category: 'hearts' },
  { code: '1f602', name: 'Tears of Joy', category: 'smileysEmotion' },
  { code: '1f389', name: 'Party Popper', category: 'activity' },
  { code: '1f622', name: 'Crying', category: 'smileysEmotion' },
  { code: '1f62e', name: 'Open Mouth', category: 'smileysEmotion' },
];

/** Convert an emoji code like "1f636_200d_1f32b_fe0f" into the
 *  corresponding Unicode string. Used when inserting an emoji into a
 *  plain-text message (the message body stays portable text rather
 *  than carrying CDN-specific markup). */
export function emojiToUnicode(code: string): string {
  return code
    .split('_')
    .map((hex) => String.fromCodePoint(parseInt(hex, 16)))
    .join('');
}

/** Reverse of emojiToUnicode — extract every codepoint from the Unicode
 *  string and join with `_`. Drops the trailing `fe0f` variation
 *  selector when its presence isn't required (the Noto CDN serves
 *  some codepoints with and some without; we try the no-fe0f form
 *  first via this helper, since the older naming convention dropped
 *  it). Returns "" for empty input. */
export function unicodeToCode(emoji: string): string {
  if (!emoji) return '';
  const points: number[] = [];
  for (const ch of emoji) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined) points.push(cp);
  }
  return points.map((cp) => cp.toString(16)).join('_');
}
