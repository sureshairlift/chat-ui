/**
 * Heuristic-based reply suggester for the composer's quick-chip row.
 *
 * Takes the most recent incoming message text and returns 3–4 short
 * context-aware replies. Patterns we look for, in priority order:
 *
 *   - greeting     ("hi", "hello", "hey", "good morning")
 *   - thanks       ("thanks", "thank you", "appreciate")
 *   - apology      ("sorry", "apologize")
 *   - question     ends with "?" / starts with question word
 *   - request      contains "please", "can you", "could you", "need"
 *   - confirmation ("ok", "got it", "received") — gets a soft ack
 *   - default      generic three-chip fallback
 *
 * Stays on the frontend so we don't pay an LLM round-trip on every
 * conversation switch. If we later want richer suggestions, swap
 * `suggestReplies` for an async call to chat-service's AI bridge.
 */

const QUESTION_STARTS = [
  "what", "where", "when", "who", "why", "how",
  "is ", "are ", "do ", "does ", "did ", "can ", "could ",
  "would ", "will ", "should ", "may ",
];

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function intentOf(raw: string): "greeting" | "thanks" | "apology" | "question" | "request" | "confirm" | "default" {
  const t = stripHtml(raw).toLowerCase();
  if (!t) return "default";
  if (/\b(hi|hello|hey|good\s+(morning|afternoon|evening))\b/.test(t)) return "greeting";
  if (/\b(thanks?|thank\s+you|appreciate|ty)\b/.test(t)) return "thanks";
  if (/\b(sorry|apologi[sz]e|apologies|my\s+bad)\b/.test(t)) return "apology";
  if (t.endsWith("?") || QUESTION_STARTS.some((q) => t.startsWith(q))) return "question";
  if (/\b(please|pls|plz|kindly|can\s+you|could\s+you|would\s+you|need|requesting|request)\b/.test(t)) return "request";
  if (/\b(ok|okay|got\s+it|received|noted|understood|sure)\b/.test(t)) return "confirm";
  return "default";
}

/** Curated chip sets per intent. Kept short (≤14 chars each) so they
 *  fit the chip row on narrow viewports. */
const CHIPS: Record<ReturnType<typeof intentOf>, string[]> = {
  greeting: ["Hi! 👋", "Hello!", "Hey there", "Good to see you"],
  thanks:   ["You're welcome!", "Anytime", "Glad to help", "No problem"],
  apology:  ["No worries", "All good", "It's okay", "Thanks for letting me know"],
  question: ["Yes", "No", "Let me check", "Will get back to you"],
  request:  ["On it", "Will do", "Got it", "Sure, sending shortly"],
  confirm:  ["Thanks!", "Great", "Perfect", "Appreciate it"],
  default:  ["Thanks!", "Got it", "Sure", "Will look into it"],
};

/**
 * Generate 3–4 short replies for the given incoming message text.
 * Returns an empty array when `text` is empty (e.g., attachment-only
 * message) — the composer should fall back to a generic chip set.
 */
export function suggestReplies(text: string | null | undefined): string[] {
  if (!text) return [];
  const intent = intentOf(text);
  return CHIPS[intent];
}
