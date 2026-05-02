/**
 * Helpers — pure functions ported 1:1 from the React file.
 *
 *  - sanitizeHtml : strip <script>/<iframe>/<style>, on* handlers, javascript:/data: hrefs
 *  - getDayKey    : compute a stable group key from a pre-formatted time string
 *  - formatDayLabel : human-friendly label for a day key
 */

/**
 * Lightweight HTML sanitizer for content coming from the rich-text composer.
 * Mirrors the React `sanitizeHtml` function exactly.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  let out = html
    .replace(/<\s*(script|iframe|style|object|embed|link|meta)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, "")
    .replace(/<\s*(script|iframe|style|object|embed|link|meta)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*"(?:[^"\\]|\\.)*"/gi, "")
    .replace(/\son\w+\s*=\s*'(?:[^'\\]|\\.)*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/(href|src)\s*=\s*"(?:\s*javascript:|\s*data:)[^"]*"/gi, '$1="#"')
    .replace(/(href|src)\s*=\s*'(?:\s*javascript:|\s*data:)[^']*'/gi, "$1='#'");
  return out;
}

/**
 * Day-grouping helper: extract a stable key from a message's pre-formatted
 * time string. Time strings come in many shapes ("Tue 8:59 AM",
 * "Yesterday 6:33 AM", "11:37 AM", "23 min", "now", "Apr 22, 2:06 PM",
 * "Mar 13", etc.) — we pattern-match the leading token.
 */
export function getDayKey(time: string | undefined | null): string {
  if (!time) return "Today";
  const dayName = time.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/);
  if (dayName) return dayName[1];
  if (/^Yesterday\b/.test(time)) return "Yesterday";
  const monthDay = time.match(/^([A-Z][a-z]{2})\s+(\d{1,2})/);
  if (monthDay) return `${monthDay[1]} ${monthDay[2]}`;
  // Bare time ("11:37 AM"), relative ("23 min", "now") — treat as today
  return "Today";
}

/** Friendly label for a day key (e.g. "Tue" → "Tuesday", "Apr 22" stays as-is). */
export function formatDayLabel(key: string): string {
  const map: Record<string, string> = {
    Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
    Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
  };
  return map[key] || key;
}

/**
 * Renders a piece of text into HTML where:
 *  - "@First" / "@First Last" become <span> mention chips
 *  - http(s):// urls become anchor tags
 * Returns sanitized HTML safe for [innerHTML] binding.
 *
 * Mirrors React `renderTextWithLinks`, but produces a string of HTML rather
 * than a JSX array (so we can bind it via Angular's [innerHTML]).
 */
export function renderTextWithLinksHtml(text: string | undefined | null): string {
  if (!text) return "";
  const parts = text.split(/(@[A-Z][A-Za-z]*(?:\s[A-Z][A-Za-z]*)?)|((?:https?:\/\/)[^\s]+)/g);
  return parts
    .filter(Boolean)
    .map((p) => {
      if (!p) return "";
      if (p.startsWith("@")) {
        return `<span class="bg-blue-50 text-blue-700 px-1 rounded">${escapeHtml(p)}</span>`;
      }
      if (p.startsWith("http")) {
        return `<a href="#" class="text-blue-600 hover:underline break-all" data-link>${escapeHtml(p)}</a>`;
      }
      return escapeHtml(p);
    })
    .join("");
}

/** Escape HTML special chars so plain text doesn't break rendering. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Numeric formatter — "$248K", "$1.2M". */
export function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}
