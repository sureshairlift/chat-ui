import { Sender, SendersMap } from "../models/types";

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
