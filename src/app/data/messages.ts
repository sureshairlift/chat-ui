import { MessagesByConv } from "../models/types";
import { MESSAGES_EXTERNAL } from "./messages-external";
import { MESSAGES_AI }       from "./messages-ai";
import { MESSAGES_TEAM_A }   from "./messages-team-a";
import { MESSAGES_TEAM_B }   from "./messages-team-b";

/**
 * Combined initial-messages map. Equivalent to the React `initialMessages`
 * constant — split across files so each chunk stays human-readable.
 */
export const INITIAL_MESSAGES: MessagesByConv = {
  ...MESSAGES_EXTERNAL,
  ...MESSAGES_AI,
  ...MESSAGES_TEAM_A,
  ...MESSAGES_TEAM_B,
};
