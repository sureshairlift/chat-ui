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

// Color + initials logic lives in services/avatar-helpers.ts so every
// place that renders an avatar (adapter, bubble, message-info panel,
// board panel) reaches for the SAME function. Re-imported here as
// short aliases for the existing call sites.
import { initialsForName, paletteIndexFor as sharedPaletteIndexFor,
         AVATAR_PALETTE_PAIRS as SHARED_PALETTE } from './avatar-helpers';

/** Build initials from a display name. Wrapper around the shared
 *  `initialsForName` so the legacy callsites here keep compiling. */
function initialsOf(name: string, fallback: string): string {
  return initialsForName(name, fallback);
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

  // For DM-shaped channels (direct + ai_direct), the conversation
  // header avatar represents the OTHER PERSON — so seed color +
  // initials off their user_ref instead of the channel id. That's
  // what makes the header avatar match the bubble avatar for the
  // same person (otherwise the header's "Rajkumar K" shows in
  // orange while his bubble shows in green — same user, two seeds).
  const avatarSeed = directAvatarSeed(api, me);

  return {
    id: api.id,
    type,
    name,
    initials: initialsOf(name, avatarSeed || api.id),
    // Tone is type-aware: 1:1s get the dark solid, groups get the light
    // tinted treatment. See colorForChannel for the mapping. Seed is
    // the other party's ref for DMs, the channel id otherwise.
    color: colorForChannel(api.type, avatarSeed || api.id),
    avatarSeed,
    members: api.members_summary?.count,
    lastSnippet: api.last_message?.snippet,
    lastTime: lastTime ? prettyTime(lastTime) : undefined,
    // Per-user section override wins over the type-derived default,
    // so a conv the caller moved into a custom section stays there
    // across reloads / devices. my_section_id is projected onto each
    // channel by the backend's ListForUser aggregation; falls through
    // to defaultSection() when empty (the conv hasn't been moved).
    section: api.my_section_id || defaultSection(api),
    // Per-member flags come from channel_members via ListForUser's
    // projection. Without these, Pinned/Unread filters would only
    // light up after the user opens each conv (forcing a /info fetch)
    // — Sidebar's "Unread" + pin-floats-to-top wouldn't work on a
    // fresh load. The two unread fields drive both the boolean
    // (any unread) and the numeric badge.
    pinned: !!api.my_is_pinned,
    unread: (api.my_unread_count ?? 0) > 0,
    muted: !!api.my_is_muted,
    archived: !!api.my_is_archived,
    isAI,
    isExternal: api.type === 'support_direct' || api.type === 'ai_assisted',
    api,
  };
}

/** For DM-shaped channels return the OTHER member's user_ref;
 *  otherwise empty. Used by adaptChannel above to align the
 *  conversation header avatar with the person's bubble avatar. */
function directAvatarSeed(api: ApiChannel, me: UserRef): string {
  if (api.type !== 'direct' && api.type !== 'ai_direct') return '';
  if (!api.dm_key) return '';
  const [a, b] = api.dm_key.split('__');
  const other = a === me ? b : a;
  return other || '';
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
// The palette + paletteIndexFor used to live here as a local copy.
// They're now imported from services/avatar-helpers.ts so every
// consumer (including AvatarComponent's fallback path) picks the
// same hue for the same user. Re-export the local names so existing
// references below keep compiling.
const AVATAR_PALETTE_PAIRS = SHARED_PALETTE;
const paletteIndexFor = sharedPaletteIndexFor;

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
  // hour12: true forces 12-hour AM/PM regardless of the browser locale
  // (some locales — fr-FR, de-DE, en-GB by default — would emit 24-hour
  // and we want a consistent format across the app).
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
  if (sameDay) return d.toLocaleTimeString([], opts);
  const yesterday = new Date(now - 86_400_000).toDateString() === d.toDateString();
  if (yesterday) return `Yesterday ${d.toLocaleTimeString([], opts)}`;
  // Within last 7 days → weekday name. Older → explicit calendar
  // date so the bubble timestamp is unambiguous (was previously
  // recycling weekday names for messages weeks/months old).
  const dayDiff = Math.floor((now - d.getTime()) / 86_400_000);
  if (dayDiff < 7) {
    return d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
  }
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString([], sameYear
    ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }
    : { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
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
    // Prefer the explicit `is_deleted` flag; fall back to deleted_at
    // for older docs that only have the timestamp. Either truthy
    // value swaps the bubble body for the tombstone placeholder.
    deleted: !!api.is_deleted || !!api.deleted_at,
    pinned: !!api.is_pinned,
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
  // Image / video previews fall back to the source URL when no
  // explicit thumb_url is provided. Legacy migrated attachments
  // never carry thumb_url but DO carry the file's CDN URL — using
  // it as the preview source means the bubble renders the real
  // image/video instead of a gradient placeholder.
  const isPreviewable = a.kind === 'image' || a.kind === 'video';
  const preview = a.thumb_url ?? (isPreviewable ? a.url : undefined);
  return {
    type: a.kind,
    name: a.filename,
    size: a.size ? humanSize(a.size) : undefined,
    ext: a.filename?.split('.').pop()?.toLowerCase(),
    mime: a.mime,
    preview,
    aspectRatio: a.width && a.height ? `${a.width} / ${a.height}` : undefined,
    duration: a.duration ? `${Math.round(a.duration)}s` : undefined,
    url: a.url,
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
