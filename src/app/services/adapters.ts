/**
 * adapters.ts — translate between backend wire types and the mock-style
 * frontend types the existing components were built against.
 *
 * Why: ~40 components consume the legacy `Conversation` and `Message`
 * shapes from `models/types.ts`. Rather than refactor every component
 * in one turn (and risk breaking visual fidelity), the live data layer
 * adapts incoming `Channel` / `ApiMessage` from the backend into the
 * legacy shapes. Components stay unchanged; the migration to native
 * api-types happens incrementally over follow-up turns.
 *
 * The adapters are LOSSY in one direction — backend-only fields like
 * `ai_session_state.phase`, `visibility`, `blocks`, `client_message_id`
 * survive on a parallel `Message.api` / `Conversation.api` field so
 * components that need them can opt in without touching the legacy
 * shape.
 */
import type {
  ApiAttachment,
  ApiMessage,
  ApiReaction,
  Block,
  Channel as ApiChannel,
  ChannelType as ApiChannelType,
  MessageType,
  UserRef,
  Visibility,
} from '../models/api-types';
import type {
  Attachment,
  Conversation,
  ConversationType,
  Message,
  Reaction,
  Sender,
} from '../models/types';
import { isBotRef, isExternalRef, parseRef } from './identity.service';
import { SENDERS, nameForRef, registerLiveSender } from '../data/senders';

// ── Legacy-shape carriers extended with the original API doc ─────────
//
// Components can read `.api` on both Conversation and Message to get the
// full backend shape (phase, blocks, visibility, ...) without us having
// to widen the legacy interfaces with every new field.

export type LiveConversation = Conversation & { api: ApiChannel };
export type LiveMessage = Message & {
  api: ApiMessage;
  /** Full sender record extracted from the API payload. The legacy
   *  Message.sender stays a string id for back-compat with existing
   *  components; this carries the structured form for richer renderers. */
  senderRecord?: Sender;
  blocks?: Block[];
  visibility?: Visibility;
  msgType: MessageType;
  channelId: string;
};

// ── Channel -> Conversation ──────────────────────────────────────────

/** Coarse mapping from backend channel type to the legacy
 *  ConversationType. group_dm -> dm (legacy didn't distinguish);
 *  ai_direct + ai_assisted -> ai; support_direct -> external;
 *  bot_channel -> space (close enough for the existing UI). */
function legacyType(t: ApiChannelType): ConversationType {
  switch (t) {
    case 'direct':
    case 'group_dm':
      return 'dm';
    case 'space':
    case 'bot_channel':
      return 'space';
    case 'ai_direct':
    case 'ai_assisted':
      return 'ai';
    case 'support_direct':
      return 'external';
    default:
      return 'dm';
  }
}

/** Build initials from a display name. Falls back to the channel id's
 *  first 2 chars if name is empty. */
function initialsOf(name: string, fallback: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Convert a backend ApiChannel into the legacy Conversation shape +
 *  preserve the original under `.api`. The `me` arg is the current
 *  user's ref so we can compute "name" for direct channels (= the other
 *  party). */
export function adaptChannel(api: ApiChannel, me: UserRef): LiveConversation {
  const type = legacyType(api.type);
  const isAI = type === 'ai';
  const name = api.name || directChannelName(api, me) || 'Untitled';
  const lastTime = api.last_message?.created_on ?? api.last_activity_at;

  return {
    id: api.id,
    type,
    name,
    initials: initialsOf(name, api.id),
    // Tone is type-aware: 1:1s get the dark solid, groups get the light
    // tinted treatment. See colorForChannel for the mapping.
    color: colorForChannel(api.type, api.id),
    members: api.members_summary?.count,
    lastSnippet: api.last_message?.snippet,
    lastTime: lastTime ? prettyTime(lastTime) : undefined,
    section: defaultSection(api),
    pinned: false,
    unread: false,
    isAI,
    isExternal: api.type === 'support_direct' || api.type === 'ai_assisted',
    api,
  };
}

/** For 1:1 channels the channel.name is empty — derive a name from the
 *  other party's user_ref. Returns "" when the channel has no second
 *  party (shouldn't happen for direct/ai_direct but guards regardless). */
function directChannelName(api: ApiChannel, me: UserRef): string {
  if (api.type !== 'direct' && api.type !== 'ai_direct') return '';
  if (api.type === 'ai_direct') return 'Airlift Intelligence';
  if (!api.dm_key) return '';
  const [a, b] = api.dm_key.split('__');
  const other = a === me ? b : a;
  if (!other) return '';
  // Prefer the embedded recent_names from members_summary — the
  // backend backfills this on member-list reads so the sidebar
  // renders real names without a /users/lookup round-trip. Falls
  // back to labelForRef (SENDERS map / "User N") if not present.
  const refs = api.members_summary?.recent_refs ?? [];
  const names = api.members_summary?.recent_names ?? [];
  const idx = refs.indexOf(other);
  if (idx >= 0 && names[idx]) return names[idx];
  return labelForRef(other);
}

/** Display name for a user_ref. Pulls from the SENDERS directory
 *  (which has the seed-aligned op:N / ext:N / bot:ai entries pre-registered;
 *  see data/senders.ts). Falls back to a coarse "User N" / "Customer N"
 *  label only when no record exists at all. */
function labelForRef(ref: UserRef): string {
  const known = nameForRef(ref);
  if (known && known !== ref) return known;
  const parsed = parseRef(ref);
  if (!parsed) return ref;
  if (parsed.kind === 'bot') return 'Airlift Intelligence';
  return `${parsed.kind === 'op' ? 'User' : 'Customer'} ${parsed.id}`;
}

/** Pick the legacy section bucket for a channel based on its backend type. */
function defaultSection(api: ApiChannel): Conversation['section'] {
  switch (api.type) {
    case 'ai_direct':
    case 'ai_assisted':
      return 'ai';
    case 'space':
    case 'bot_channel':
      return 'spaces';
    case 'support_direct':
      return 'customers';
    default:
      return 'direct';
  }
}

// Avatar palette pairs — every entry has a SOLID dark variant (used for
// direct / 1:1 channels: dark bg + implicit white text) and a TINTED
// light variant (used for group / space / external-group / support /
// bot channels: light bg + dark text via the explicit `text-X-700`
// suffix that AvatarComponent.containerClass detects). Keeping them
// paired by tone-family means the same channel renders consistently
// whether it's pinged via direct or group code paths.
const AVATAR_PALETTE_PAIRS = [
  { solid: 'bg-emerald-500', tinted: 'bg-emerald-100 text-emerald-700' },
  { solid: 'bg-sky-500',     tinted: 'bg-sky-100 text-sky-700' },
  { solid: 'bg-violet-500',  tinted: 'bg-violet-100 text-violet-700' },
  { solid: 'bg-amber-500',   tinted: 'bg-amber-100 text-amber-700' },
  { solid: 'bg-rose-500',    tinted: 'bg-rose-100 text-rose-700' },
  { solid: 'bg-teal-500',    tinted: 'bg-teal-100 text-teal-700' },
  { solid: 'bg-indigo-500',  tinted: 'bg-indigo-100 text-indigo-700' },
  { solid: 'bg-fuchsia-500', tinted: 'bg-fuchsia-100 text-fuchsia-700' },
];

/** Hash → palette index. Same seed always picks the same color pair so
 *  a channel's avatar tint is stable across reloads. */
function paletteIndexFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % AVATAR_PALETTE_PAIRS.length;
}

/** Color picker scoped by channel kind:
 *   - direct / ai_direct        -> SOLID dark (bg-X-500, white text)
 *   - group_dm / space / ext-* /
 *     ai_assisted / support /
 *     bot_channel               -> TINTED light (bg-X-100, dark text)
 *
 *  AvatarComponent.containerClass distinguishes the two via the
 *  presence of `text-` in the class string — solids get `text-white`
 *  appended automatically, tinted entries already carry their text-X-700. */
function colorForChannel(channelType: ApiChannelType, seed: string): string {
  const pair = AVATAR_PALETTE_PAIRS[paletteIndexFor(seed)];
  if (channelType === 'direct' || channelType === 'ai_direct') {
    return pair.solid;
  }
  return pair.tinted;
}

/** Pure-sender color (solid). Used for individual person avatars in the
 *  message bubble — always dark + white text regardless of where the
 *  message lives. Channel avatars use colorForChannel above. */
function defaultColor(seed: string): string {
  return AVATAR_PALETTE_PAIRS[paletteIndexFor(seed)].solid;
}

/** Render a backend ISO timestamp into the fuzzy-ish format the legacy
 *  bubble component expects ("Tue 8:59 AM" / "now" / "23 min"). Caller
 *  passes a string from the API; we never trust it as a Date until parsed. */
export function prettyTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = Date.now();
  const diff = now - d.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min} min`;
  const sameDay = new Date().toDateString() === d.toDateString();
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  if (sameDay) return d.toLocaleTimeString([], opts);
  const yesterday = new Date(now - 86_400_000).toDateString() === d.toDateString();
  if (yesterday) return `Yesterday ${d.toLocaleTimeString([], opts)}`;
  // Within last 7 days → weekday name. Older → explicit calendar
  // date so the bubble timestamp is unambiguous (was previously
  // recycling weekday names for messages weeks/months old).
  const dayDiff = Math.floor((now - d.getTime()) / 86_400_000);
  if (dayDiff < 7) {
    return d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  }
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString([], sameYear
    ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ── ApiMessage -> Message ────────────────────────────────────────────

export function adaptMessage(api: ApiMessage): LiveMessage {
  const senderRecord = api.sender ? adaptSender(api.sender) : undefined;
  return {
    id: api.id,
    sender: api.sender?.ref, // legacy field is a string id
    time: prettyTime(api.created_on),
    text: api.content,
    html: api.content_format === 'markdown' ? api.content : undefined,
    edited: !!api.edited_at,
    deleted: !!api.deleted_at,
    // Quoted-reply: backend stores the parent's user_ref + snippet on
    // quoted.{sender, snippet}. Legacy frontend Message.quoted expects
    // {sender: <display name>, senderId: <id>, text: <body>}. Strip
    // any HTML tags that may have leaked into the snippet (older
    // messages predate the strip-at-send fix in app.component.onSend).
    quoted: api.quoted ? {
      sender: nameForRef(api.quoted.sender),
      senderId: api.quoted.sender,
      text: stripHtml(api.quoted.snippet),
    } : undefined,
    attachments: (api.attachments ?? []).map(adaptAttachment),
    reactions: (api.reactions ?? []).map(adaptReaction),
    // Map thread_meta to the legacy thread shape so the bubble's "X replies"
    // chip renders. Replies are NOT inlined — the thread panel calls
    // GET /messages/:id/thread when opened. Empty replies array signals
    // "have meta, fetch replies on demand".
    thread: api.thread_meta && api.thread_meta.reply_count > 0 ? {
      count: api.thread_meta.reply_count,
      lastTime: api.thread_meta.last_reply_at ? prettyTime(api.thread_meta.last_reply_at) : undefined,
      replies: [],
    } : undefined,
    type: legacyMessageType(api.type),
    api,
    senderRecord,
    blocks: api.blocks,
    visibility: api.visibility,
    msgType: api.type,
    channelId: api.channel_id,
  };
}

function adaptSender(s: NonNullable<ApiMessage['sender']>): Sender {
  // The API value is the source of truth — it's denormalised onto the
  // message at send time (or backfilled from the MySQL Users table on
  // member-list reads). The SENDERS directory is just a cache and may
  // be stale (e.g. the data/senders.ts seed assumed op:15 = Aatif but
  // your real MySQL has Ganesh at id 15). When the API has a name,
  // use it AND overwrite the cache so subsequent lookups elsewhere
  // (mentions-view, threads-view) get the right label too.
  const apiName = s.user_name?.trim();
  if (apiName) {
    const existing = SENDERS[s.ref];
    if (!existing || existing.name !== apiName) {
      // Drop the stale entry first — registerLiveSender is non-overwriting.
      delete SENDERS[s.ref];
      registerLiveSender(s.ref, apiName);
    }
    return { id: s.ref, ...SENDERS[s.ref] };
  }
  // No name on the API payload — fall back to whatever's cached, or
  // synthesize a coarse label.
  const cached = SENDERS[s.ref];
  if (cached) return { id: s.ref, ...cached };
  const name = labelForRef(s.ref);
  registerLiveSender(s.ref, name);
  return SENDERS[s.ref] ? { id: s.ref, ...SENDERS[s.ref] } : {
    id: s.ref,
    name,
    color: defaultColor(s.ref),
    initials: initialsOf(name, s.ref),
    presence: 'active',
  };
}

function adaptAttachment(a: ApiAttachment): Attachment {
  return {
    type: a.kind,
    name: a.filename,
    size: a.size ? humanSize(a.size) : undefined,
    ext: a.filename?.split('.').pop()?.toLowerCase(),
    mime: a.mime,
    preview: a.thumb_url ?? undefined,
    aspectRatio: a.width && a.height ? `${a.width} / ${a.height}` : undefined,
    duration: a.duration ? `${Math.round(a.duration)}s` : undefined,
  };
}

/** Strip simple HTML tags from a snippet so it renders as plain text in
 *  the bubble's quoted-reply pill or the composer's "Replying to" chip.
 *  Coarse — turns `<span class="mention-chip">@Name</span>` into `@Name`
 *  and drops `&nbsp;` etc. Doesn't try to parse properly because these
 *  snippets are bounded at 200 chars. */
function stripHtml(s: string): string {
  if (!s) return '';
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function adaptReaction(r: ApiReaction): Reaction {
  return { emoji: r.emoji, count: r.count };
}

/** Map backend MessageType -> legacy Message.type discriminator. AI
 *  variants collapse onto generic ai-text; richer routing happens in the
 *  block renderer (which reads the actual blocks list, not this string). */
function legacyMessageType(t: MessageType): Message['type'] {
  switch (t) {
    case 'system':
    case 'handoff':
      return 'system';
    case 'ai':
    case 'ai_suggestion':
      return 'ai-text';
    default:
      return undefined; // normal user message
  }
}

// ── Helpers exposed for components that need quick checks ────────────

export function isAgentsOnly(m: LiveMessage): boolean {
  return m.visibility === 'agents_only';
}

export function isFromMe(m: LiveMessage, me: UserRef): boolean {
  return m.api.sender?.ref === me;
}

export function isFromBot(m: LiveMessage): boolean {
  const ref = m.api.sender?.ref;
  return !!ref && isBotRef(ref);
}

export function isFromCustomer(m: LiveMessage): boolean {
  const ref = m.api.sender?.ref;
  return !!ref && isExternalRef(ref);
}
