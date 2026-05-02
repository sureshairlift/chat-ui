import { Message, MessagesByConv } from "../models/types";

/**
 * Synthetic message bulk for stress-testing the windowed message renderer.
 *
 * We seed the `origin-software` space with ~260 generated messages spread
 * across multiple days so that:
 *   - the initial render only paints the last 50 (windowed),
 *   - the "Load earlier · N more" sentinel actually appears,
 *   - day separators show across multiple days,
 *   - the IntersectionObserver auto-loads earlier pages as you scroll up.
 *
 * The content is deterministic (no Math.random in the seed) so a refresh
 * lands on the same scroll position. Time labels run from "Apr 1" through
 * "now" so the day-grouping pipeline sees real variety.
 */

const SENDERS = ["shiron", "arvindh", "ashwath", "ram", "simi", "aatif",
                 "rajkumar", "anand", "sunil", "me"] as const;

const SAMPLE_LINES = [
  "Pushed a fix for the staging deploy — please pull when you get a chance.",
  "Reviewed the migration plan, left a few comments inline.",
  "Quick heads up: the auth service is restarting in ~5 min.",
  "Anyone seeing flakiness on the iOS test runner this morning?",
  "Numbers look healthy — Q2 retention is up 3.2%.",
  "Pairing on the indexer rewrite at 3pm if anyone wants to join.",
  "Bumped the timeout to 30s. Should clear the intermittent 504s.",
  "Customer reported the dashboard freeze again. I'm digging in now.",
  "Got it. Moving the ticket to in-review.",
  "+1 — let's pick this up after the release cut.",
  "Done. Tests are green on my branch.",
  "Pinning the thread so we don't lose it.",
  "Thanks for the quick turnaround on this!",
  "Will follow up with eng-leads on the timeline tomorrow.",
  "Found the root cause — env var wasn't being read in prod.",
  "Reverted the change. Back to clean main.",
  "Dropping a snippet here for posterity.",
  "Looks good from my end. Merging when CI is green.",
  "Closing this out — feature flag is ramped to 100%.",
  "Linking the design doc for context.",
  "Filed the issue: ENG-1284.",
  "Confirmed the fix locally. Pushing now.",
  "Heads up — I'll be on PTO Thurs/Fri.",
  "Mind giving this a second look?",
  "Re-running the deploy. Should land in ~10 min.",
  "Hotfix is out. Customer impact contained.",
  "Stand-up notes are in the doc. Couple of asks for tomorrow.",
  "Bumping this — anyone able to take a look today?",
  "Yep, that's expected. Doc is here:",
  "Slowing down on this thread — let's pick it up sync tomorrow.",
];

function makeBatch(count: number, startDayOffset: number): Message[] {
  const out: Message[] = [];
  // Build messages spread across `count` minutes ending roughly "now".
  // The day label rolls over every ~80 messages so we get visible
  // day-grouping in the rendered list.
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const sender = SENDERS[i % SENDERS.length];
    const line   = SAMPLE_LINES[i % SAMPLE_LINES.length];
    // Day stepping: oldest message starts `startDayOffset` days back.
    const dayBack = Math.max(0, startDayOffset - Math.floor(i / 60));
    const d = new Date(today);
    d.setDate(today.getDate() - dayBack);
    d.setHours(9 + ((i * 7) % 9));
    d.setMinutes((i * 13) % 60);
    const time = d.toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
    out.push({
      id: `stress-${i}`,
      sender,
      time,
      text: `[#${i + 1}] ${line}`,
    });
  }
  return out;
}

/** ~260 messages across ~5 days. Tweak the count if you want more/less load. */
const BULK_ORIGIN_SOFTWARE = makeBatch(260, 4);

export const MESSAGES_STRESS_TEST: MessagesByConv = {
  "origin-software": BULK_ORIGIN_SOFTWARE,
};
