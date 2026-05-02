import {
  MentionEntry, PortalSession, AISummariesMap, TeamMember, ActivityItem,
} from "../models/types";

export const MENTIONS_DATA: MentionEntry[] = [
  { id: "m1", space: "Origin Software", sender: "Ram",
    mentions: ["Rajsuresh Airlift", "Rajkumar Airlift"],
    text: " are you traveling as well?", date: "Apr 21" },
  { id: "m2", space: "Origin Software", sender: "Ram",
    mentions: ["Rajkumar Airlift", "Rajsuresh Airlift"],
    text: " chat is down and customer portal is down", date: "Mar 13" },
  { id: "m3", space: "Origin Software", sender: "Ram",
    mentions: ["Rajkumar Airlift", "Rajsuresh Airlift"],
    text: " crm and customer portal are both down", date: "Feb 21" },
  { id: "m4", space: "Origin Software", sender: "Ashwath",
    mentions: ["Rajsuresh Airlift"],
    text: " na please check this bulk quote reuse screen https://zpl.io/QMolAEk",
    date: "Feb 8" },
  { id: "m5", space: "Origin Software", sender: "Ram",
    mentions: ["Rajsuresh Airlift", "Rajkumar Airlift"], text: "", date: "Jan 22" },
  { id: "m6", space: "Origin Software", sender: "Ram",
    mentions: ["Rajkumar Airlift", "Rajsuresh Airlift"],
    text: " looks like rate search is not working in CRM", date: "Jan 21" },
  { id: "m7", space: "Origin Software", sender: "Ram",
    mentions: ["Shiron Airlift", "Rajsuresh Airlift"],
    text: " can you make a duplicate of the v2 landing page and call it v3 with the same analytics events. I want to update the meta ads to use that so we can differentiate between leads that have arrived from google ads or meta ads",
    date: "Jan 8" },
  { id: "m8", space: "Origin Software", sender: "Ashwath",
    mentions: ["Rajsuresh Airlift"],
    text: " na I have uploaded Rate Request CRM screen in zeplin. https://zpl.io/dR9OvLL and For Spot on rate there is a indication in the rate card, this screen is also uploaded in zeplin. https://zpl.io/1MeGKm4 Please check that.",
    date: "Dec 27" },
];

/* ============================ CUSTOMER PORTAL HANDOFFS ============================
   Live state of customer-facing sessions powered by the AI agent. Each session has a
   `mode` (per orchestrator.py: ai_only / ai_fronting / ai_copilot / human_only / resolved)
   and a derived operator-facing `status` for the dashboard:
     - awaiting_handoff : customer asked for a human, no operator assigned yet
     - assigned         : operator assigned but hasn't engaged ("waiting for takeover")
     - active           : operator is actively co-piloting or owns the chat
     - resolved         : closed
*/
export const CUSTOMER_PORTAL_SESSIONS: PortalSession[] = [
  {
    id: "cp1", customer: "Sarah Williams", org: "Globex Logistics", initials: "SW", color: "bg-pink-500",
    mode: "ai_only", status: "awaiting_handoff", assignee: null,
    lastMessage: "I need to speak to a real person about my booking — the AI keeps giving me generic answers.",
    waitingFor: "12 min", waitingMinutes: 12, unread: 3, priority: "high",
    aiContext: "Customer asked about booking #BK-44219 (in transit, ETA delayed). AI offered standard tracking response 3x. Customer escalated frustration.",
  },
  {
    id: "cp2", customer: "Mike Chen", org: "Apex Freight", initials: "MC", color: "bg-indigo-500",
    mode: "ai_copilot", status: "assigned", assignee: "me",
    lastMessage: "Can someone confirm the customs paperwork is filed correctly?",
    waitingFor: "5 min", waitingMinutes: 5, unread: 2, priority: "medium",
    aiContext: "Customer needs confirmation on customs filing for shipment #SH-9831. AI drafted a response — review pending in chat.",
  },
  {
    id: "cp3", customer: "Lena Park", org: "Bluebird Co", initials: "LP", color: "bg-cyan-500",
    mode: "human_only", status: "active", assignee: "me",
    lastMessage: "Thanks for jumping in — that clarifies it. One more thing about the rate sheet…",
    waitingFor: "1 min", waitingMinutes: 1, unread: 1, priority: "medium",
    aiContext: "Active conversation — you took over 18 min ago. Discussing Q2 rate sheet revisions.",
  },
  {
    id: "cp4", customer: "Daniel Roy", org: "Hudson Cargo", initials: "DR", color: "bg-amber-600",
    mode: "ai_fronting", status: "active", assignee: "ram",
    lastMessage: "Got it, will check the documents and get back to you.",
    waitingFor: "—", waitingMinutes: 0, unread: 0, priority: "low",
    aiContext: "Ram is shadowing — AI is replying. Customer satisfied so far, no escalation needed.",
  },
  {
    id: "cp5", customer: "Elena Vasquez", org: "Pacific Routes", initials: "EV", color: "bg-rose-500",
    mode: "ai_only", status: "awaiting_handoff", assignee: null,
    lastMessage: "Please connect me to the operations team. This is urgent — shipment is held at port.",
    waitingFor: "3 min", waitingMinutes: 3, unread: 2, priority: "high",
    aiContext: "Urgent: shipment #SH-7714 held at LAX customs. Customer waited on AI for 8 min, now requesting human.",
  },
  {
    id: "cp6", customer: "James Okafor", org: "Trident Logistics", initials: "JO", color: "bg-violet-500",
    mode: "ai_copilot", status: "assigned", assignee: "aatif",
    lastMessage: "Can you update the delivery address before the next leg?",
    waitingFor: "8 min", waitingMinutes: 8, unread: 1, priority: "medium",
    aiContext: "Aatif assigned 8 min ago, hasn't engaged yet. AI prepared 2 reply suggestions.",
  },
  {
    id: "cp7", customer: "Amara Singh", org: "Coastal Shipping", initials: "AS", color: "bg-teal-500",
    mode: "resolved", status: "resolved", assignee: "me",
    lastMessage: "Perfect, all set. Thank you!",
    waitingFor: "—", waitingMinutes: 0, unread: 0, priority: "low",
    aiContext: "Resolved 22 min ago by you. Customer satisfied with rate adjustment.",
    resolvedAt: "22 min",
  },
];

/** AI summaries for unread internal conversations (mock-generated). Keyed by conv id. */
export const AI_UNREAD_SUMMARIES: AISummariesMap = {
  shiron: {
    summary: "Shiron added a video meeting and shared a status update on the tariff revision PR. Mentions a customer call later today.",
    actions: ["Review the PR", "Confirm meeting attendance"],
    severity: "medium",
  },
  "origin-dev": {
    summary: "Rajkumar deployed the rate-search hotfix to prod — monitoring shows no errors. Ashwath flagged a Hebrew-character edge case in booking flow (CRM-4421) with an active 4-reply thread you're following.",
    actions: ["Check thread for fix update", "Verify production logs"],
    severity: "low",
  },
  "ext-acme": {
    summary: "Jane Carter is following up on the revised quote you promised by EOD. She's asking specifically about the seasonal flex tier numbers.",
    actions: ["Send revised quote", "Schedule follow-up call"],
    severity: "high",
  },
  "ext-northstar": {
    summary: "Priya shared legal feedback on three contract sections and is open to a call Thursday or Friday.",
    actions: ["Review legal feedback", "Propose a call slot"],
    severity: "medium",
  },
};

/** Team availability — drives the "Team on duty" strip on the dashboard. */
export const TEAM_AVAILABILITY: TeamMember[] = [
  { id: "ram",      status: "active",  load: 1, note: "Active in 2 chats" },
  { id: "aatif",    status: "active",  load: 1, note: "Just assigned a handoff" },
  { id: "shiron",   status: "active",  load: 0, note: "Available" },
  { id: "rajkumar", status: "active",  load: 0, note: "In Origin Dev" },
  { id: "ashwath",  status: "away",    load: 0, note: "Away · 12 min" },
  { id: "anand",    status: "active",  load: 0, note: "Available" },
  { id: "sunil",    status: "offline", load: 0, note: "Offline" },
];

/** Activity feed — recent events ops users want to glance at. */
export const ACTIVITY_FEED: ActivityItem[] = [
  { id: "act1", type: "handoff_request", actor: "Sarah Williams", org: "Globex Logistics",
    text: "asked for a human on the customer portal", time: "12 min", icon: "alert" },
  { id: "act2", type: "message_received", actor: "Mike Chen", org: "Apex Freight",
    text: "sent a new message — assigned to you", time: "5 min", icon: "msg" },
  { id: "act3", type: "ai_suggestion", actor: "Airlift AI", org: null,
    text: "drafted 2 reply suggestions for James (Trident)", time: "8 min", icon: "ai" },
  { id: "act4", type: "resolved", actor: "You", org: null,
    text: "resolved chat with Amara Singh (Coastal)", time: "22 min", icon: "check" },
  { id: "act5", type: "takeover", actor: "Ram Murthy", org: null,
    text: "took over Hudson Cargo from AI fronting", time: "35 min", icon: "user" },
  { id: "act6", type: "message_received", actor: "Jane Carter", org: "Acme Corp",
    text: "is following up on your revised quote", time: "8 min", icon: "msg" },
  { id: "act7", type: "task_completed", actor: "Aatif", org: null,
    text: "completed: Send pricing pack", time: "1 hr", icon: "check" },
];
