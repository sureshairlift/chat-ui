/**
 * Models — TypeScript shapes mirroring the React data layer 1:1.
 *
 * The original React file uses inline JS object shapes; we type them here so
 * every component template gets full intellisense and structural checks.
 */

/* ------------------------------------------------------------------ Senders */

export interface Sender {
  id?: string;
  name: string;
  /** Tailwind color class. May be a solid (`bg-emerald-500`),
   *  a tinted pill (`bg-amber-100 text-amber-700`), or a gradient. */
  color: string;
  initials: string;
  org?: string;
  presence?: "active" | "away" | "offline";
}

export type SendersMap = Record<string, Sender>;

/* ------------------------------------------------------------------ Sections */

export type SectionId =
  | "all"
  | "direct"
  | "test"
  | "spaces"
  | "ai"
  | "customers"
  | "pinned"
  | "unread"
  | string; // also custom user-created sections

export interface CustomSection {
  id: string;
  label: string;
  /** Tailwind background class for the colored # chip (used as
   *  fallback when no emoji is set). */
  color: string;
  /** Optional single-character emoji shown in place of the colored
   *  # chip when set. Stored as the raw codepoint string. */
  emoji?: string;
}

/* ------------------------------------------------------------- Conversations */

export type ConversationType = "ai" | "dm" | "space" | "meeting" | "external" | "external-group";

export interface Conversation {
  id: string;
  type: ConversationType;
  name: string;
  initials: string;
  color: string;
  /** Optional seed for the avatar's color + initials derivation. For
   *  DM / AI-direct channels this is the OTHER party's user_ref so
   *  the conversation header avatar matches the same person's bubble
   *  avatar exactly (same hue, same initials). For groups/spaces it
   *  stays undefined — the channel id is used. */
  avatarSeed?: string;

  presence?: "active" | "away" | "offline";
  members?: number;
  org?: string;

  lastSnippet?: string;
  lastTime?: string;

  section: SectionId;
  pinned?: boolean;
  unread?: boolean;
  muted?: boolean;
  archived?: boolean;
  /** When unread, this is the id of the first unread msg — used for the unread divider */
  unreadStartMsgId?: string;

  isAI?: boolean;
  isNewChat?: boolean;
  isCalendar?: boolean;
  isExternal?: boolean;

  /** For external-group convs: array of sender ids participating */
  participants?: string[];

  /** AI-generated meeting summary bullets */
  meetingSummary?: string[];
}

/* ------------------------------------------------------------------ Messages */

export type AttachmentType = "file" | "image" | "video" | "audio";

export interface Attachment {
  type: AttachmentType;
  name?: string;
  size?: string;
  ext?: string;
  mime?: string;
  /** For images/videos */
  preview?: string;
  /** For images */
  aspectRatio?: string;
  /** For audio/video */
  duration?: string;
  /** Direct URL to the underlying file. For images/videos this is the
   *  source URL the inline preview pulls from; for files it's the
   *  download link. Migrated legacy attachments often lack this — the
   *  bubble's renderer falls back to a generic file card in that case. */
  url?: string;
}

export interface ThreadReply {
  sender: string;
  text: string;
  time: string;
  reactions?: Reaction[];
}

export interface ThreadMeta {
  count: number;
  lastTime?: string;
  replies?: ThreadReply[];
}

export interface Reaction {
  emoji: string;
  count: number;
}

export interface QuotedMessage {
  sender: string;
  senderId: string;
  text: string;
}

export type AIMessageKind = "ai-text" | "ai-chart" | "ai-list" | "ai-rated";
export type SystemMessageKind = "system" | "meeting" | "quote" | AIMessageKind;

export interface ChartDataPoint {
  label: string;
  value: number;
  color: string;
}

export interface AIListItem {
  icon: "phone" | "users" | "dollar" | "target" | "trending" | "check";
  title: string;
  meta: string;
  status: "done" | "active" | "pending";
}

export interface Message {
  id: string;
  sender?: string; // sender id — undefined for "system" type
  time?: string;
  text?: string;
  /** Pre-formatted HTML body (used for rich content / mentions / links) */
  html?: string;
  edited?: boolean;
  /** True when the message was tombstoned by its sender. Renders as a
   *  muted "This message was deleted by the sender" placeholder in
   *  place of the body, attachments, reactions, and thread chip. */
  deleted?: boolean;
  /** True when the message is pinned to the channel's board. Comes
   *  straight from the backend's `is_pinned` flag so the bubble can
   *  render a pinned indicator without consulting the separate
   *  pinnedMsgs cache (which only holds messages pinned in this
   *  session + whatever loadPinnedLive hydrated). */
  pinned?: boolean;
  attachments?: Attachment[];
  thread?: ThreadMeta;
  reactions?: Reaction[];

  /** Quoted-reply content */
  quoted?: QuotedMessage;

  /** Special message variants */
  type?: SystemMessageKind;

  /* ----- AI-only fields ----- */
  chartTitle?: string;
  chartSubtitle?: string;
  chartData?: ChartDataPoint[];
  summary?: string;
  sources?: string[];
  listTitle?: string;
  listSubtitle?: string;
  items?: AIListItem[];
}

export type MessagesByConv = Record<string, Message[]>;

/* ------------------------------------------------------------------ Mentions */

export interface MentionEntry {
  id: string;
  space: string;
  sender: string;
  mentions: string[];
  text: string;
  date: string;
}

/* ----------------------------------------------- Customer portal sessions */

export type PortalMode = "ai_only" | "ai_fronting" | "ai_copilot" | "human_only" | "resolved";
export type PortalStatus = "awaiting_handoff" | "assigned" | "active" | "resolved";

export interface PortalSession {
  id: string;
  customer: string;
  org: string;
  initials: string;
  color: string;
  mode: PortalMode;
  status: PortalStatus;
  assignee: string | null;
  lastMessage: string;
  waitingFor: string;
  waitingMinutes: number;
  unread: number;
  priority: "low" | "medium" | "high";
  aiContext: string;
  resolvedAt?: string;
}

/* --------------------------------------------------- AI unread summaries */

export interface AISummary {
  summary: string;
  actions: string[];
  severity: "low" | "medium" | "high";
}

export type AISummariesMap = Record<string, AISummary>;

/* ------------------------------------------------- Team availability */

export interface TeamMember {
  id: string;
  status: "active" | "away" | "offline";
  load: number;
  note: string;
}

/* ------------------------------------------------- Activity feed */

export interface ActivityItem {
  id: string;
  type:
    | "handoff_request"
    | "message_received"
    | "ai_suggestion"
    | "resolved"
    | "takeover"
    | "task_completed";
  actor: string;
  org: string | null;
  text: string;
  time: string;
  icon: "alert" | "msg" | "ai" | "check" | "user";
}

/* --------------------------------------------------------- Tasks */

export interface ConvTask {
  id: string;
  title: string;
  done: boolean;
  assignee?: string;
  due?: string;
}

export type ConvTasksMap = Record<string, ConvTask[]>;

/* ------------------------------------------------------- App-level */

export type ViewKey =
  | "home"
  | "dashboard"
  | "mentions"
  | "threads"
  | "starred"
  | "sent";

export type UserRole = "customer_support" | "operations" | "ops" | "viewer" | "admin";

export interface ToastState {
  id: number;
  message: string;
}

export interface DraftState {
  /** Plain text snapshot for "has draft" indicators */
  text: string;
  /** Full HTML for rich-text composers */
  html: string;
}

export type DraftsMap = Record<string, DraftState>;

export interface ReactionsMap {
  [msgId: string]: Reaction[];
}

export type PinnedMap = Record<string, string[]>; // convId -> msg ids
export type SavedMap  = Record<string, true>;     // msg id -> true (saved across all convs)
