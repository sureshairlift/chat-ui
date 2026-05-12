/**
 * Status phrases for the AI streaming spinner — ported from
 * `chatv1.0/ai-backend/cli.py` so the web UX matches the CLI vibe.
 *
 * Two pools:
 *   - GENERIC_THINKING_PHRASES: shown when there's no detected intent
 *     yet. Mix of "warming up" + freight-domain framing.
 *   - INTENT_THINKING_PHRASES: keyed by the SSE classifier's intent
 *     label so the phrases stay relevant to what the AI is actually
 *     working on (rate quote vs tracking vs SQL report etc.).
 *
 * The bubble picks a list and the rotator cycles every 1.6s — same
 * cadence the CLI uses.
 */

export const GENERIC_THINKING_PHRASES: string[] = [
  "Thinking...",
  "Loading context...",
  "Warming up...",
  "Reading the question...",
  "Picking up the manifest...",
];

export const INTENT_THINKING_PHRASES: Record<string, string[]> = {
  TOOL_RATE: [
    "Negotiating with shipping liners...",
    "Pricing FCL slots...",
    "Calling Maersk...",
    "Comparing rates across carriers...",
    "Scrolling through tariff sheets...",
    "Checking GRI updates...",
    "Phoning the rate desk...",
    "Asking the broker...",
  ],
  TOOL_TRACKING: [
    "Pinging the vessel via AIS...",
    "Locating your container...",
    "Reading port telemetry...",
    "Knocking on the terminal gate...",
    "Polling the carrier API...",
    "Tracing the booking...",
    "Asking the agent...",
  ],
  SQL_REPORT: [
    "Crunching bookings...",
    "Joining Lead...",
    "Sweeping the database...",
    "Counting containers...",
    "Aggregating rows...",
    "Indexing customers...",
    "Querying flow_pod...",
    "Translating to SQL...",
    "Sanitizing query...",
  ],
  KB_FREIGHT: [
    "Reading the INCOTERMS handbook...",
    "Flipping through customs guidelines...",
    "Consulting the freight glossary...",
    "Decoding HS codes...",
    "Browsing carrier policies...",
  ],
  REFINE_PREVIOUS: [
    "Applying filters...",
    "Sieving rows...",
    "Trimming the list...",
    "Narrowing it down...",
    "Picking only the matching rates...",
  ],
  OPS_TASK: [
    "Pulling pending tasks...",
    "Checking priorities...",
    "Reviewing SLAs...",
    "Sweeping ops dashboards...",
  ],
  CUSTOMER_SHIPMENT: [
    "Locating your shipments...",
    "Pulling your booking history...",
    "Looking up your containers...",
  ],
  HANDOFF_REQUEST: [
    "Paging support...",
    "Forwarding to a human...",
    "Tracking down an agent...",
  ],
  SMALLTALK: [
    "Thinking of a witty reply...",
    "Sipping coffee...",
    "Pondering...",
    "Stretching...",
  ],
  CHART_REQUEST: [
    "Picking the right chart...",
    "Sketching axes...",
    "Counting data points...",
    "Choosing colors...",
  ],
  UNKNOWN: [
    "Thinking carefully...",
    "Considering the question...",
    "Reading between the lines...",
  ],
};

/**
 * Pick a phrase list based on the user's question text — cheap
 * keyword heuristic, since the SSE flow we use for chat-service
 * (`ai.block.*`) doesn't currently emit the classifier's intent
 * event. Gets the bubble onto a freight-relevant phrase set without
 * a server round-trip; the LLM-generated context-aware phrases from
 * /v1/thinking-words still override when available.
 */
export function guessIntentPhrases(question: string): string[] {
  const q = (question || "").toLowerCase();
  if (!q) return GENERIC_THINKING_PHRASES;
  if (/\b(rate|quote|price|tariff|gri|fcl|lcl|cost)\b/.test(q))      return INTENT_THINKING_PHRASES.TOOL_RATE;
  if (/\b(track|tracking|container|vessel|eta|terminal|location|where is)\b/.test(q))
                                                                     return INTENT_THINKING_PHRASES.TOOL_TRACKING;
  if (/\b(report|how many|count|aggregate|total|sum|list me|show me|breakdown)\b/.test(q))
                                                                     return INTENT_THINKING_PHRASES.SQL_REPORT;
  if (/\b(incoterm|hs code|customs|policy|tariff sheet|glossary)\b/.test(q))
                                                                     return INTENT_THINKING_PHRASES.KB_FREIGHT;
  if (/\b(filter|only|just|exclude|narrow|except|where)\b/.test(q))  return INTENT_THINKING_PHRASES.REFINE_PREVIOUS;
  if (/\b(task|todo|to do|priority|sla|pending|deadline)\b/.test(q)) return INTENT_THINKING_PHRASES.OPS_TASK;
  if (/\b(shipment|booking|my container|my shipment|order)\b/.test(q))
                                                                     return INTENT_THINKING_PHRASES.CUSTOMER_SHIPMENT;
  if (/\b(agent|human|support|escalate|handoff)\b/.test(q))          return INTENT_THINKING_PHRASES.HANDOFF_REQUEST;
  if (/\b(chart|graph|plot|visuali[sz]e|histogram|bar)\b/.test(q))   return INTENT_THINKING_PHRASES.CHART_REQUEST;
  if (/\b(hi|hello|hey|thanks|thank you)\b/.test(q))                 return INTENT_THINKING_PHRASES.SMALLTALK;
  return GENERIC_THINKING_PHRASES;
}
