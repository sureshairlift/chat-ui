import { MessagesByConv } from "../models/types";
import { MESSAGES_EXTERNAL }    from "./messages-external";
import { MESSAGES_AI }          from "./messages-ai";
import { MESSAGES_TEAM_A }      from "./messages-team-a";
import { MESSAGES_TEAM_B }      from "./messages-team-b";
import { MESSAGES_STRESS_TEST } from "./messages-stress-test";

/**
 * Combined initial-messages map. Equivalent to the React `initialMessages`
 * constant — split across files so each chunk stays human-readable.
 *
 * The stress-test batch is prepended (older than) the curated `origin-software`
 * thread so the curated end-of-thread stays the bottom-of-pane content,
 * giving us ~260 older messages to scroll back through.
 */
const merged: MessagesByConv = {
  ...MESSAGES_EXTERNAL,
  ...MESSAGES_AI,
  ...MESSAGES_TEAM_A,
  ...MESSAGES_TEAM_B,
};

for (const [convId, bulk] of Object.entries(MESSAGES_STRESS_TEST)) {
  merged[convId] = [...bulk, ...(merged[convId] ?? [])];
}

export const INITIAL_MESSAGES: MessagesByConv = merged;
