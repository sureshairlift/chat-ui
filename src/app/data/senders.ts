import { Sender, SendersMap } from "../models/types";
import { colorForUserRef, initialsForName } from "../services/avatar-helpers";

/** Sender directory — keyed by id, mirrors React `senders` constant 1:1. */
export const SENDERS: SendersMap = {
  shiron:    { name: "Shiron Airlift",          color: "bg-emerald-500", initials: "S" },
  arvindh:   { name: "Arvindhkrisshna Airlift", color: "bg-orange-500",  initials: "A" },
  ashwath:   { name: "Ashwath Airlift",          color: "bg-red-500",     initials: "A" },
  ram:       { name: "Ram Murthy",               color: "bg-gradient-to-br from-amber-400 to-rose-500",   initials: "RM" },
  simi:      { name: "Simi Ramesh",              color: "bg-gradient-to-br from-amber-700 to-amber-900",  initials: "SR" },
  aatif:     { name: "Aatif Airlift",            color: "bg-red-500",     initials: "A" },
  rajkumar:  { name: "Rajkumar Airlift",         color: "bg-gradient-to-br from-emerald-400 to-teal-600", initials: "R" },
  anand:     { name: "Anandhabala Airlift",      color: "bg-emerald-500", initials: "A" },
  sunil:     { name: "Sunil Kumar Airlift",      color: "bg-blue-500",    initials: "S" },
  me:        { name: "Suresh R",                 color: "bg-sky-500",     initials: "SR" },
  airliftai: { name: "Airlift Intelligence",     color: "bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500", initials: "AI" },

  // External customers (from customer portal)
  acme_jane:       { name: "Jane Carter",  org: "Acme Corp",            color: "bg-amber-500", initials: "JC" },
  lighthouse_marc: { name: "Marc Rivera",  org: "Lighthouse Logistics", color: "bg-rose-500",  initials: "MR" },
  northstar_priya: { name: "Priya Shah",   org: "Northstar Inc.",       color: "bg-gradient-to-br from-violet-400 to-indigo-600", initials: "PS" },
  riverstone_tom:  { name: "Tom Anderson", org: "Riverstone Freight",   color: "bg-orange-500", initials: "TA" },
};

/** @-mention autocomplete list — excludes "me" and the AI itself. */
export interface MentionableUser extends Sender { id: string; }

export const MENTIONABLE_USERS: MentionableUser[] = Object.entries(SENDERS)
  .filter(([id]) => id !== "me" && id !== "airliftai")
  .map(([id, s]) => ({ id, ...s }));

/* ================================================================
 *  Live-data alias layer
 * ================================================================
 *
 * The backend emits namespaced user_refs (op:2, ext:101, bot:ai) but
 * many components still look up senders via the legacy mock keys
 * (SENDERS["shiron"], SENDERS["sunil"], etc.). To avoid refactoring
 * ~10 components in one go, we mirror every Sender record under its
 * matching user_ref. Mapping mirrors `nameByRef` in the seed program
 * (apps/chat-service/migrations/seed/main.go) — keep both in sync.
 *
 * After this loop, SENDERS["op:18"] === SENDERS["sunil"] and the
 * existing avatar / name lookups work for live messages too.
 */
const REF_TO_LEGACY_ID: Record<string, string> = {
  "op:2":   "me",
  "op:10":  "shiron",
  "op:11":  "arvindh",
  "op:12":  "ashwath",
  "op:13":  "ram",
  "op:14":  "simi",
  "op:15":  "aatif",
  "op:16":  "rajkumar",
  "op:17":  "anand",
  "op:18":  "sunil",
  "bot:ai": "airliftai",
  "ext:101": "acme_jane",
  "ext:102": "lighthouse_marc",
  "ext:103": "northstar_priya",
  "ext:104": "riverstone_tom",
};

for (const [ref, legacyId] of Object.entries(REF_TO_LEGACY_ID)) {
  const s = SENDERS[legacyId];
  if (s && !SENDERS[ref]) {
    SENDERS[ref] = s;
  }
}

/** Public lookup: human-readable name for any user_ref. Falls back to
 *  the ref string when no record exists (graceful for unknown senders).
 *  Components that need richer data (color, initials, org) should look
 *  up SENDERS[ref] directly — this loop guarantees the lookup succeeds
 *  for every seeded user_ref. */
export function nameForRef(ref: string): string {
  return SENDERS[ref]?.name ?? ref;
}

/** Register a new user_ref → Sender record at runtime. Called by the
 *  live-data adapter when a message arrives from a sender we haven't
 *  seen before — guarantees subsequent lookups succeed without a
 *  network roundtrip. Idempotent.
 *
 *  Color + initials come from `services/avatar-helpers.ts` — the SAME
 *  helpers AvatarComponent uses for its fallback derivation. So a
 *  Sender record written here, when later passed to <app-avatar> with
 *  its explicit color, produces an avatar that's IDENTICAL to the one
 *  Avatar would have derived on its own. No drift between the two
 *  code paths regardless of which call site renders the user. */
export function registerLiveSender(ref: string, name: string): void {
  if (SENDERS[ref]) return;
  SENDERS[ref] = {
    name: name || ref,
    color: colorForUserRef(ref),
    initials: initialsForName(name, ref),
  };
}

function nameToInitials(s: string): string {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
