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
 * Day-grouping helper. When a real ISO timestamp is available (live
 * messages carry one on `m.api.created_on` / `m.iso`), bucket by the
 * date portion of that timestamp — gives a stable, locale-stable key
 * like "2026-04-22". When only a display string is available (mock
 * data, optimistic placeholders), fall back to the legacy regex
 * parser that recognises "Tue 8:59 AM" / "Yesterday …" / "Apr 22 …".
 *
 * The key is opaque to callers — pass it to `formatDayLabel` to get
 * the human-friendly header text.
 */
export function getDayKey(time: string | undefined | null, iso?: string | null): string {
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      // YYYY-MM-DD in local time. Local on purpose so a message sent
      // at 11pm doesn't show under tomorrow's header for a US user.
      return ymd(d);
    }
  }
  if (!time) return ymd(new Date());
  const dayName = time.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/);
  if (dayName) return dayName[1];
  if (/^Yesterday\b/.test(time)) return "Yesterday";
  const monthDay = time.match(/^([A-Z][a-z]{2})\s+(\d{1,2})/);
  if (monthDay) return `${monthDay[1]} ${monthDay[2]}`;
  // Bare time ("11:37 AM"), relative ("23 min", "now") — treat as today.
  return ymd(new Date());
}

/**
 * Friendly label for a day key.
 *
 *   today                → "Today"
 *   yesterday            → "Yesterday"
 *   within last 7 days   → weekday name ("Tuesday")
 *   within current year  → "Apr 22"
 *   older                → "Apr 22, 2025"
 *
 * Accepts both new ISO-style YYYY-MM-DD keys and the legacy short
 * tokens ("Tue", "Apr 22", "Yesterday") so mixed mock/live lists keep
 * rendering during the migration.
 */
export function formatDayLabel(key: string): string {
  // Legacy-token paths (mock data, optimistic placeholders).
  const legacyMap: Record<string, string> = {
    Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
    Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
    Yesterday: "Yesterday", Today: "Today",
  };
  if (legacyMap[key]) return legacyMap[key];

  // YYYY-MM-DD path (live data).
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return key; // unrecognised — render verbatim ("Apr 22" etc.)
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return key;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) {
    return d.toLocaleDateString([], { weekday: "long" });
  }
  if (d.getFullYear() === today.getFullYear()) {
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

/** Local YYYY-MM-DD — used as the day-bucket key for live messages. */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}
