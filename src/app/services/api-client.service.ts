/**
 * api-client.service.ts — Typed REST client for chat-service.
 *
 * Every method maps 1:1 to a route in
 * `apps/chat-service/cmd/server/router.go`. JSON-only; SSE on POST /messages
 * (when the channel is AI-eligible) is handled by sse-client.service.ts —
 * that service calls `sendUserMessage` directly with `accept: 'text/event-stream'`.
 *
 * Auth is JWT in the `Authorization: Bearer <token>` header. The gateway
 * accepts both `Authorization` and `x-token` for backward compat with the
 * legacy CRM frontend.
 *
 * Error shape: shared-pkg/response on the Go side wraps every response
 * envelope as `{ status, code?, message?, data?, meta? }`. Non-2xx
 * responses raise an `ApiError` with the parsed envelope so callers can
 * surface user-friendly messages.
 */
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import type {
  ApiAttachment,
  ApiMessage,
  Block,
  Channel,
  ChannelInfo,
  ChannelMember,
  ChannelType,
  HandoffRequest,
  HandoffStatus,
  MessageInfoResponse,
  SectionCountsResponse,
  TransitionResult,
  UserRef,
} from '../models/api-types';
import { IdentityService } from './identity.service';

// ── Configuration ─────────────────────────────────────────────────────

/** Base URL of chat-service. Override at app bootstrap (provideEnvironment-style)
 *  if you need to point at a non-default host. Defaults match the local dev
 *  port from configs/services/chat-service.yml. */
const DEFAULT_BASE = '/api/v2/chat-service';

// ── AI catch-up summary (banner above bubble list) ────────────────────

export interface AISummary {
  channel_id: string;
  message_count: number;
  summary: string;
  ai_meta?: Record<string, unknown>;
}

// ── Tasks (per-channel "to do") ────────────────────────────────────────

export interface TaskWire {
  id: string;
  channel_id: string;
  title: string;
  done?: boolean;
  assignee_ref?: string;
  due?: string;
  created_by: string;
  created_on: string;
  completed_on?: string;
  last_modified?: string;
}

// ── Cross-device composer drafts ──────────────────────────────────────

export interface UserDraftWire {
  user_ref?: string;
  channel_id: string;
  text?: string;
  html?: string;
  updated_on?: string;
}

// ── Cross-device sidebar preferences ──────────────────────────────────

export interface UserPrefsWire {
  user_ref?: string;
  section_order?: string[];
  custom_sections?: { id: string; label: string; color?: string; emoji?: string }[];
  updated_on?: string;
}

// ── User status (custom emoji + text, cross-device) ───────────────────

export interface UserStatus {
  user_ref?: string;
  emoji?: string;
  text?: string;
  clear_at?: string | null;
  set_at?: string;
}

// ── Chat flow menu (static; rendered as inline picker) ────────────────

export interface ChatFlowOption {
  id: string;
  title: string;
  description?: string;
}

export interface ChatFlowMenu {
  prompt: string;
  options: ChatFlowOption[];
}

// ── Support team result (CRM linkage) ─────────────────────────────────

export interface SupportTeamMember {
  id: number;
  user_name: string;
  email: string;
  is_external_user?: boolean;
}

export interface SupportTeamGroup {
  name: string;
  column_name: string;
  team: SupportTeamMember[];
}

// ── Common-search result (mention picker / member-add picker) ─────────

export interface UserOrGroupResult {
  type: 'user' | 'group';
  id: string;
  name: string;
  user_name?: string;
  email?: string;
  avatar?: string;
  members?: number[];
}

// ── Shared info entry shape ────────────────────────────────────────────

export interface SharedItem {
  message_id: string;
  channel_id: string;
  shared_by?: { ref: string; user_name?: string; email?: string; avatar_url?: string };
  shared_on: string;
  kind: 'file' | 'image' | 'video' | 'audio' | 'link';
  url: string;
  filename?: string;
  size?: number;
  mime?: string;
  thumb_url?: string;
  title?: string;
  display_name?: string;
}

// ── Public envelope shapes ────────────────────────────────────────────

export interface ApiEnvelope<T> {
  status: 'success' | 'error';
  data?: T;
  meta?: unknown;
  message?: string;
  code?: string;
  errors?: Array<{ field?: string; message: string }>;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | undefined,
    message: string,
    public readonly raw?: ApiEnvelope<unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Request body shapes ───────────────────────────────────────────────

export interface CreateChannelBody {
  type: ChannelType;
  name?: string;
  description?: string;
  is_private?: boolean;
  members?: UserRef[];
}

export interface SendMessageBody {
  content?: string;
  content_format?: 'text' | 'markdown' | 'blocks';
  blocks?: Block[];
  attachments?: ApiMessage['attachments'];
  mentions?: ApiMessage['mentions'];
  quoted?: ApiMessage['quoted'];
  thread_root_id?: string;
  broadcast_in_feed?: boolean;
  client_message_id?: string;
  visibility?: ApiMessage['visibility'];
}

export interface OpenHandoffBody {
  channel_id: string;
  reason?: string;
  ai_summary?: string;
  intent_tags?: string[];
  priority?: HandoffRequest['priority'];
  assigned_team?: string;
}

export interface TransitionBody {
  // handoff
  support_team?: Array<Record<string, unknown>>;
  // request-human
  intent_hint?: string;
  // take-over
  agent_id?: number;
}

// ── Service ───────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private readonly base = DEFAULT_BASE;

  constructor(
    private readonly http: HttpClient,
    private readonly identity: IdentityService,
  ) {}

  // ── Channels ────────────────────────────────────────────────────────

  /** POST /channels — create a channel of any type. */
  createChannel(body: CreateChannelBody): Observable<Channel> {
    return this.post<Channel>('/channels', body);
  }

  /** GET /channels — caller's channel list, ordered most-recent first. */
  listChannels(opts?: { before?: string; limit?: number }): Observable<Channel[]> {
    return this.get<Channel[]>('/channels', this.params(opts));
  }

  /** GET /channels/:channel_id — single channel. */
  getChannel(channelID: string): Observable<Channel> {
    return this.get<Channel>(`/channels/${channelID}`);
  }

  /** PUT /channels/:channel_id — owner/admin metadata edit. Returns the
   *  updated channel doc. Pass only the fields you want changed; null
   *  pointers on the server skip untouched fields. */
  updateChannel(
    channelID: string,
    patch: { name?: string; description?: string; icon?: string; is_private?: boolean },
  ): Observable<Channel> {
    return this.put<Channel>(`/channels/${channelID}`, patch);
  }

  /** DELETE /channels/:channel_id — owner-only teardown. Hard-deletes
   *  the channel doc; orphan member rows are dropped silently by
   *  ListForUser's $unwind, so no client-side cleanup needed. */
  deleteChannel(channelID: string): Observable<void> {
    return this.delete<void>(`/channels/${channelID}`);
  }

  /** GET /users/:user_id/channels — paginated channel list for an
   *  explicit user_ref. Today policy is "self only" so this resolves
   *  to the same set as listChannels for the caller. Provided for
   *  legacy URL parity. */
  listUserChannels(userRef: string, opts?: { before?: string; limit?: number }): Observable<Channel[]> {
    return this.get<Channel[]>(`/users/${encodeURIComponent(userRef)}/channels`, this.params(opts));
  }

  /** POST /attachments — multipart upload. Returns the stored
   *  attachment metadata that can be passed verbatim into the next
   *  sendMessage's `attachments[]`. Uses bare fetch (not HttpClient)
   *  because Angular's HttpClient hides upload Progress events behind
   *  a separate API surface that's awkward inside an Observable<T>
   *  return — for "upload + get URL" flows this is cleaner. */
  uploadAttachment(file: File): Observable<ApiAttachment & { id: string }> {
    return new Observable((subscriber) => {
      const form = new FormData();
      form.append('file', file, file.name);
      const headers: Record<string, string> = {};
      const token = this.identity.token();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        headers['x-token'] = token;
      }
      // Don't set Content-Type — fetch sets the right multipart boundary.
      fetch(`${this.base}/attachments`, { method: 'POST', body: form, headers })
        .then(async (res) => {
          const body = (await res.json().catch(() => ({}))) as ApiEnvelope<ApiAttachment & { id: string }>;
          if (!res.ok || body.status === 'error') {
            subscriber.error(new ApiError(res.status, body.code, body.message ?? 'upload failed', body));
            return;
          }
          subscriber.next(body.data!);
          subscriber.complete();
        })
        .catch((err) => subscriber.error(new ApiError(0, 'unknown', String(err))));
    });
  }

  /** POST /search — full-text search against chat.messages, scoped to
   *  the caller's accessible channels. Returns matched messages sorted
   *  by relevance score. Pass channelID to scope to one channel. */
  searchMessages(opts: { q: string; channelID?: string; limit?: number }): Observable<ApiMessage[]> {
    return this.post<ApiMessage[]>('/search', {
      q: opts.q,
      channel_id: opts.channelID,
      limit: opts.limit,
    });
  }

  /** POST /search/everything — Gmail-style filtered search.
   *  q can include `from:`, `is:pinned`, `has:attachment`, `before:`,
   *  `after:` operators. Explicit fields override what's in q. */
  searchEverything(body: {
    q?: string;
    from?: string;
    channel_id?: string;
    before?: string;
    after?: string;
    has_attachment?: boolean;
    has_reaction?: boolean;
    is_pinned?: boolean;
    limit?: number;
    offset?: number;
  }): Observable<{ results: ApiMessage[]; total: number; limit: number; offset: number }> {
    return this.post('/search/everything', body);
  }

  /** GET /channels/:id/ai-summary — short bullet recap of recent /
   *  unread messages. Drives the catch-up banner above the bubble list.
   *  Returns 503 when AI backend isn't configured. */
  getAISummary(channelID: string): Observable<AISummary> {
    return this.get<AISummary>(`/channels/${channelID}/ai-summary`);
  }

  /** GET /channels/:id/ai-reply-hints — 3 short context-aware reply
   *  suggestions for the composer chip row. Optional provider override
   *  ("local" / "gemini_flash" / "gemini_pro"). Returns 503 when the
   *  AI bridge isn't configured — caller falls back to the local
   *  heuristic in services/reply-suggestions.ts. */
  getAIReplyHints(channelID: string, provider?: string): Observable<{ suggestions: string[]; provider: string }> {
    const q = provider ? `?provider=${encodeURIComponent(provider)}` : "";
    return this.get<{ suggestions: string[]; provider: string }>(
      `/channels/${channelID}/ai-reply-hints${q}`,
    );
  }

  /** GET /channels/:id/ai-thinking-words — 5 short "Thinking…"
   *  status phrases the UI cycles next to the spinner while the
   *  real reply is composing. Optional `question` override —
   *  otherwise the service uses the caller's latest message. */
  getAIThinkingWords(channelID: string, question?: string): Observable<{ words: string[]; provider: string }> {
    const q = question ? `?question=${encodeURIComponent(question)}` : "";
    return this.get<{ words: string[]; provider: string }>(
      `/channels/${channelID}/ai-thinking-words${q}`,
    );
  }

  /** POST /channels/:id/unread — flip the read pointer back so the
   *  named message + everything after counts as unread again. */
  markChannelUnread(channelID: string, messageID: string): Observable<void> {
    return this.post<void>(`/channels/${channelID}/unread`, { message_id: messageID });
  }

  /** GET /channels/:id/tasks — all tasks in a channel. */
  listTasks(channelID: string): Observable<TaskWire[]> {
    return this.get<TaskWire[]>(`/channels/${channelID}/tasks`);
  }

  /** POST /channels/:id/tasks — create a new task. */
  createTask(channelID: string, body: { title: string; assignee_ref?: string; due?: string }): Observable<TaskWire> {
    return this.post<TaskWire>(`/channels/${channelID}/tasks`, body);
  }

  /** PATCH /tasks/:id — partial update. */
  updateTask(taskID: string, body: { title?: string; done?: boolean; assignee_ref?: string; due?: string }): Observable<TaskWire> {
    return this.patch<TaskWire>(`/tasks/${taskID}`, body);
  }

  /** DELETE /tasks/:id */
  deleteTask(taskID: string): Observable<void> {
    return this.delete<void>(`/tasks/${taskID}`);
  }

  /** GET /me/tasks — open tasks assigned to the caller across all channels. */
  listMyTasks(): Observable<TaskWire[]> {
    return this.get<TaskWire[]>('/me/tasks');
  }

  /** GET /me/drafts — every composer draft the caller has, keyed
   *  by channel_id on the client. */
  listDrafts(): Observable<UserDraftWire[]> {
    return this.get<UserDraftWire[]>('/me/drafts');
  }

  /** PUT /me/drafts/:channel_id — upsert (empty text+html clears it). */
  setDraft(channelID: string, body: { text?: string; html?: string }): Observable<void> {
    return this.put<void>(`/me/drafts/${channelID}`, body);
  }

  /** DELETE /me/drafts/:channel_id — explicit clear. */
  deleteDraft(channelID: string): Observable<void> {
    return this.delete<void>(`/me/drafts/${channelID}`);
  }

  /** GET /me/preferences — sidebar prefs (section order + custom). */
  getPreferences(): Observable<UserPrefsWire | null> {
    return this.get<UserPrefsWire | null>('/me/preferences');
  }

  /** PUT /me/preferences — upsert. */
  setPreferences(body: UserPrefsWire): Observable<UserPrefsWire | null> {
    return this.put<UserPrefsWire | null>('/me/preferences', body);
  }

  /** GET /me/status — caller's custom status (emoji + text + optional
   *  clear_at). Returns null when nothing is set. */
  getUserStatus(): Observable<UserStatus | null> {
    return this.get<UserStatus | null>('/me/status');
  }

  /** PUT /me/status — upsert. Empty emoji+text clears the status. */
  setUserStatus(body: { emoji?: string; text?: string; clear_at?: string | null }): Observable<UserStatus | null> {
    return this.put<UserStatus | null>('/me/status', body);
  }

  /** DELETE /me/status — explicit clear. */
  clearUserStatus(): Observable<void> {
    return this.delete<void>('/me/status');
  }

  /** GET /flows/menu — static chat-flow menu (prompt + options). */
  getChatFlowMenu(): Observable<ChatFlowMenu> {
    return this.get<ChatFlowMenu>('/flows/menu');
  }

  /** POST /flows/menu — post the menu prompt as a system message in
   *  the channel. Optional custom prompt overrides the default. */
  sendChatFlowMenu(channelID: string, prompt?: string): Observable<ApiMessage> {
    return this.post<ApiMessage>('/flows/menu', { channel_id: channelID, prompt });
  }

  /** POST /flows/trigger — post every step of the chosen flow as a
   *  system message sequence. Returns the array of posted messages. */
  triggerChatFlow(channelID: string, flowID: string): Observable<ApiMessage[]> {
    return this.post<ApiMessage[]>('/flows/trigger', { channel_id: channelID, flow_id: flowID });
  }

  /** GET /support_team/:module/:referenceId — assigned-team roster
   *  for one CRM record (today: freight booking). Returns groups
   *  (Booking Team, Customer Care, ...). Empty groups are dropped. */
  getSupportTeam(module: string, referenceID: string): Observable<SupportTeamGroup[]> {
    return this.get<SupportTeamGroup[]>(`/support_team/${module}/${encodeURIComponent(referenceID)}`);
  }

  /** POST /users/lookup — bulk display-name resolution for a batch
   *  of namespaced user_refs. Returns one entry per ref that matched
   *  a row in the legacy Users table; unmatched refs are silently
   *  dropped (caller falls back to "User N" rendering). */
  lookupUsers(refs: UserRef[]): Observable<{ ref: UserRef; user_name?: string; email?: string }[]> {
    return this.post<{ ref: UserRef; user_name?: string; email?: string }[]>('/users/lookup', { refs });
  }

  /** GET /common/search/:type — autocomplete for mention picker / member-add
   *  picker. Searches MySQL Users + Chat_User_Groups by LIKE %q%. */
  searchUsersAndGroups(opts: { type: 'user' | 'group' | 'all'; q: string; limit?: number; offset?: number }): Observable<UserOrGroupResult[]> {
    return this.get<UserOrGroupResult[]>(`/common/search/${opts.type}`, this.params({
      q: opts.q,
      limit: opts.limit,
      offset: opts.offset,
    }));
  }

  /** GET /me/section-counts — caller's channel counts grouped by
   *  sidebar section (direct/spaces/ai/customers). Server-side
   *  aggregation so the badges show real totals across the workspace
   *  rather than whatever the local list pane has paginated in. */
  getSectionCounts(): Observable<SectionCountsResponse> {
    return this.get<SectionCountsResponse>('/me/section-counts');
  }

  /** GET /messages/:message_id/info — rich payload for the Message
   *  Info side panel: who viewed (with timestamp), who hasn't, and
   *  the reactor list per emoji. Members are hydrated with user_name
   *  so the panel renders without a /users/lookup round-trip. */
  getMessageInfo(messageID: string): Observable<MessageInfoResponse> {
    return this.get<MessageInfoResponse>(`/messages/${messageID}/info`);
  }

  /** GET /channels/:channel_id/info — rich payload for the header.
   *  Returns the channel doc + all members + caller's per-channel state +
   *  active handoff + counts in a single round-trip. Use on conversation
   *  switch to populate the entire header at once. */
  getChannelInfo(channelID: string): Observable<ChannelInfo> {
    return this.get<ChannelInfo>(`/channels/${channelID}/info`);
  }

  /** PUT /channels/:channel_id/section — set the caller's per-user
   *  sidebar section for this channel. Pass empty `sectionID` (or
   *  null) to clear the override and fall back to the type-derived
   *  default. Folder-style: one section per (user, channel). */
  setChannelSection(channelID: string, sectionID: string | null): Observable<void> {
    return this.put<void>(`/channels/${channelID}/section`, {
      section_id: sectionID ?? '',
    });
  }

  /** DELETE /me/sections/:section_id — demote every conv currently
   *  in the section back to its type-default. Returns
   *  {demoted_count} for the toast. The caller is responsible for
   *  separately removing the section from user_preferences.custom_sections. */
  deleteSection(sectionID: string): Observable<{ demoted_count: number }> {
    return this.delete<{ demoted_count: number }>(`/me/sections/${encodeURIComponent(sectionID)}`);
  }

  /** POST /channels/:channel_id/read — advance the caller's read pointer.
   *  When messageID is omitted, the server resolves to the channel's
   *  newest visible message (bulk "Mark all as read"). */
  markChannelRead(channelID: string, messageID?: string): Observable<{ marked_up_to?: string } | void> {
    const body = messageID ? { message_id: messageID } : {};
    return this.post<{ marked_up_to?: string } | void>(`/channels/${channelID}/read`, body);
  }

  // ── Messages ────────────────────────────────────────────────────────

  /** POST /channels/:channel_id/messages — send. Returns the persisted
   *  message. Use sse-client when sending to AI channels (the response
   *  upgrades to text/event-stream and this method won't see it). */
  sendMessage(channelID: string, body: SendMessageBody): Observable<ApiMessage> {
    return this.post<ApiMessage>(`/channels/${channelID}/messages`, body);
  }

  /** GET /channels/:channel_id/messages — cursor pagination.
   *  - before only: page older (newest-first) — usual top-of-list scroll.
   *  - after only:  page newer (oldest-first) — bottom-of-list scroll
   *    after a jump-to-message put the caller in the middle of the log.
   *  - both set:    bounded slice between the two ids. */
  listMessages(channelID: string, opts?: { before?: string; after?: string; limit?: number }): Observable<ApiMessage[]> {
    return this.get<ApiMessage[]>(`/channels/${channelID}/messages`, this.params(opts));
  }

  /** Same endpoint as listMessages but in "around" mode — returns the
   *  N messages before the anchor + the anchor + N messages after.
   *  Drives jump-to-message from search results so the client renders
   *  surrounding context immediately. Oldest-first. */
  listMessagesAround(channelID: string, opts: { anchor: string; beforeCount?: number; afterCount?: number }): Observable<ApiMessage[]> {
    return this.get<ApiMessage[]>(`/channels/${channelID}/messages`, this.params({
      anchor: opts.anchor,
      before_count: opts.beforeCount,
      after_count: opts.afterCount,
    }));
  }

  editMessage(messageID: string, content: string, blocks?: Block[]): Observable<ApiMessage> {
    return this.patch<ApiMessage>(`/messages/${messageID}`, { content, blocks });
  }

  deleteMessage(messageID: string): Observable<void> {
    return this.delete<void>(`/messages/${messageID}`);
  }

  // ── Threads ─────────────────────────────────────────────────────────

  listThread(messageID: string, opts?: { limit?: number }): Observable<ApiMessage[]> {
    return this.get<ApiMessage[]>(`/messages/${messageID}/thread`, this.params(opts));
  }

  // ── Reactions ───────────────────────────────────────────────────────

  /** POST /messages/:message_id/reactions — toggle on/off. */
  toggleReaction(messageID: string, emoji: string): Observable<void> {
    return this.post<void>(`/messages/${messageID}/reactions`, { emoji });
  }

  // ── Pinned messages ─────────────────────────────────────────────────

  /** POST /messages/:message_id/pin — pin a message. Server-side state
   *  lives on the message itself so every channel member sees the same
   *  pinboard. */
  pinMessage(messageID: string): Observable<ApiMessage> {
    return this.post<ApiMessage>(`/messages/${messageID}/pin`, {});
  }

  /** DELETE /messages/:message_id/pin — unpin. Idempotent. */
  unpinMessage(messageID: string): Observable<ApiMessage> {
    return this.delete<ApiMessage>(`/messages/${messageID}/pin`);
  }

  /** GET /channels/:channel_id/pinned — pinned messages for a channel,
   *  ordered newest-first. Caller must be a member. */
  listPinned(channelID: string): Observable<ApiMessage[]> {
    return this.get<ApiMessage[]>(`/channels/${channelID}/pinned`);
  }

  /** PUT /messages/:id/star — star (a.k.a. save) the message for the
   *  caller. Idempotent. Returns updated message. */
  starMessage(messageID: string): Observable<ApiMessage> {
    return this.put<ApiMessage>(`/messages/${messageID}/star`, {});
  }

  /** DELETE /messages/:id/star — unstar. */
  unstarMessage(messageID: string): Observable<ApiMessage> {
    return this.delete<ApiMessage>(`/messages/${messageID}/star`);
  }

  /** GET /me/starred — caller's saved messages, optionally scoped to
   *  one channel. Newest-first. */
  listStarred(opts?: { channelID?: string }): Observable<ApiMessage[]> {
    const params = opts?.channelID ? this.params({ channel_id: opts.channelID }) : undefined;
    return this.get<ApiMessage[]>('/me/starred', params);
  }

  /** PUT /messages/:id/view — record that the caller saw the message.
   *  Drives read-receipt UI. Idempotent. */
  markMessageViewed(messageID: string): Observable<void> {
    return this.put<void>(`/messages/${messageID}/view`, {});
  }

  /** GET /unread — map of channel_id -> unread count for the caller. */
  unreadByChannel(): Observable<Record<string, number>> {
    return this.get<Record<string, number>>('/unread');
  }

  /** GET /unread-count — single int = sum across channels. */
  totalUnread(): Observable<{ unread_count: number }> {
    return this.get<{ unread_count: number }>('/unread-count');
  }

  /** POST /unread-count/refresh — recompute unread_count from messages
   *  for the caller. Optional channelID narrows to one channel. Drift
   *  repair; ops dashboards / "mark all read" can call it. */
  refreshUnread(channelID?: string): Observable<{ unread_count: number }> {
    const params = channelID ? this.params({ channel_id: channelID }) : undefined;
    return this.post<{ unread_count: number }>(`/unread-count/refresh${params ? '?' + params.toString() : ''}`, {});
  }

  /** POST /unread-count/process-rows — bulk unread check for an arbitrary
   *  list of channel ids. Returns map[id]bool. */
  processUnreadRows(channelIDs: string[]): Observable<Record<string, boolean>> {
    return this.post<Record<string, boolean>>('/unread-count/process-rows', { channel_ids: channelIDs });
  }

  /** GET /channels/:id/shared/:type — list shared attachments / links
   *  in a channel, flattened one row per attachment. type ∈ "file"
   *  | "media" | "link" | "all". Pagination via offset/limit. */
  listSharedInfo(channelID: string, kind: 'file' | 'media' | 'link' | 'all', opts?: { offset?: number; limit?: number }): Observable<SharedItem[]> {
    return this.get<SharedItem[]>(`/channels/${channelID}/shared/${kind}`, this.params(opts));
  }

  // ── Handoffs ────────────────────────────────────────────────────────

  /** GET /handoffs — queue (pending+claimed by default). */
  listHandoffs(opts?: { team?: string; status?: HandoffStatus[]; limit?: number; before?: string }): Observable<HandoffRequest[]> {
    let p = new HttpParams();
    if (opts?.team) p = p.set('team', opts.team);
    if (opts?.limit) p = p.set('limit', String(opts.limit));
    if (opts?.before) p = p.set('before', opts.before);
    if (opts?.status) {
      for (const s of opts.status) {
        p = p.append('status', s);
      }
    }
    return this.get<HandoffRequest[]>('/handoffs', p);
  }

  openHandoff(body: OpenHandoffBody): Observable<HandoffRequest> {
    return this.post<HandoffRequest>('/handoffs', body);
  }

  claimHandoff(handoffID: string): Observable<HandoffRequest> {
    return this.post<HandoffRequest>(`/handoffs/${handoffID}/claim`, {});
  }

  assignHandoff(handoffID: string, assigneeRef: UserRef): Observable<HandoffRequest> {
    return this.post<HandoffRequest>(`/handoffs/${handoffID}/assign`, { assignee_ref: assigneeRef });
  }

  dismissHandoff(handoffID: string, reason: string): Observable<HandoffRequest> {
    return this.post<HandoffRequest>(`/handoffs/${handoffID}/dismiss`, { reason });
  }

  resolveHandoff(handoffID: string): Observable<HandoffRequest> {
    return this.post<HandoffRequest>(`/handoffs/${handoffID}/resolve`, {});
  }

  // ── Channel transitions (AI lifecycle) ─────────────────────────────

  /** POST /channels/:channel_id/handoff — operator-initiated. */
  transitionHandoff(channelID: string, body: TransitionBody): Observable<TransitionResult> {
    return this.post<TransitionResult>(`/channels/${channelID}/handoff`, body);
  }

  /** POST /channels/:channel_id/request-human — customer-initiated. */
  transitionRequestHuman(channelID: string, intentHint?: string): Observable<TransitionResult> {
    return this.post<TransitionResult>(`/channels/${channelID}/request-human`, { intent_hint: intentHint ?? '' });
  }

  /** POST /channels/:channel_id/take-over — agent claims. */
  transitionTakeOver(channelID: string, agentID?: number): Observable<TransitionResult> {
    const body: TransitionBody = {};
    if (agentID) body.agent_id = agentID;
    return this.post<TransitionResult>(`/channels/${channelID}/take-over`, body);
  }

  transitionReturnToAI(channelID: string): Observable<TransitionResult> {
    return this.post<TransitionResult>(`/channels/${channelID}/return-to-ai`, {});
  }

  transitionSuppressAI(channelID: string): Observable<TransitionResult> {
    return this.post<TransitionResult>(`/channels/${channelID}/suppress-ai`, {});
  }

  transitionResolve(channelID: string): Observable<TransitionResult> {
    return this.post<TransitionResult>(`/channels/${channelID}/resolve`, {});
  }

  // ── FCM / events ────────────────────────────────────────────────────

  registerFCMToken(userID: number, token: string, opts?: { platform?: string; isExternal?: boolean }): Observable<unknown> {
    return this.post(`/fcm_token_register/${userID}`, {
      token,
      platform: opts?.platform,
      is_external: opts?.isExternal ?? false,
    });
  }

  /** POST /events — typing indicator. type is "typing" or "typing_stop". */
  sendTypingEvent(channelID: string, type: 'typing' | 'typing_stop'): Observable<void> {
    return this.post<void>('/events', { channel_id: channelID, type });
  }

  // ── Members ─────────────────────────────────────────────────────────

  listMembers(channelID: string): Observable<ChannelMember[]> {
    return this.get<ChannelMember[]>(`/channels/${channelID}/members`);
  }

  /** POST /channels/:id/members — invite one or more users. Idempotent;
   *  existing members are silently skipped. Returns the count actually
   *  inserted plus the refs that landed. */
  addMembers(channelID: string, refs: UserRef[], role?: string): Observable<{ added_count: number; added_refs: UserRef[] }> {
    return this.post<{ added_count: number; added_refs: UserRef[] }>(
      `/channels/${channelID}/members`,
      { refs, role },
    );
  }

  /** DELETE /channels/:id/members/:user_ref — soft-remove a member.
   *  Caller can remove themselves (leave) or anyone else (kick). */
  removeMember(channelID: string, userRef: UserRef): Observable<void> {
    return this.delete<void>(`/channels/${channelID}/members/${encodeURIComponent(userRef)}`);
  }

  /** PUT /channels/:id/action — toggle a per-user channel flag (pin,
   *  star, mute, archive). Mirrors the legacy chat-service contract. */
  applyChannelAction(channelID: string, action: 'pin' | 'unpin' | 'star' | 'unstar' | 'mute' | 'unmute' | 'archive' | 'unarchive'): Observable<void> {
    return this.put<void>(`/channels/${channelID}/action`, { action });
  }

  // ── Internals ───────────────────────────────────────────────────────

  /** Default headers including JWT auth + UTC time hint that the legacy
   *  middleware uses for time-zone resolution. */
  private headers(): HttpHeaders {
    let h = new HttpHeaders().set('Content-Type', 'application/json');
    const token = this.identity.token();
    if (token) {
      h = h.set('Authorization', `Bearer ${token}`).set('x-token', token);
    }
    return h;
  }

  private params(opts?: Record<string, string | number | undefined>): HttpParams {
    let p = new HttpParams();
    if (!opts) return p;
    for (const [k, v] of Object.entries(opts)) {
      if (v !== undefined && v !== null && v !== '') {
        p = p.set(k, String(v));
      }
    }
    return p;
  }

  private get<T>(path: string, params?: HttpParams): Observable<T> {
    return this.http
      .get<ApiEnvelope<T>>(this.base + path, { headers: this.headers(), params })
      .pipe(map(unwrap), catchError(handleError));
  }

  private post<T>(path: string, body: unknown): Observable<T> {
    return this.http
      .post<ApiEnvelope<T>>(this.base + path, body, { headers: this.headers() })
      .pipe(map(unwrap), catchError(handleError));
  }

  private put<T>(path: string, body: unknown): Observable<T> {
    return this.http
      .put<ApiEnvelope<T>>(this.base + path, body, { headers: this.headers() })
      .pipe(map(unwrap), catchError(handleError));
  }

  private patch<T>(path: string, body: unknown): Observable<T> {
    return this.http
      .patch<ApiEnvelope<T>>(this.base + path, body, { headers: this.headers() })
      .pipe(map(unwrap), catchError(handleError));
  }

  private delete<T>(path: string): Observable<T> {
    return this.http
      .delete<ApiEnvelope<T>>(this.base + path, { headers: this.headers() })
      .pipe(map(unwrap), catchError(handleError));
  }
}

// ── Envelope unwrapping ──────────────────────────────────────────────

function unwrap<T>(env: ApiEnvelope<T>): T {
  if (env.status === 'error') {
    throw new ApiError(0, env.code, env.message ?? 'request failed', env);
  }
  return env.data as T;
}

function handleError(err: unknown) {
  if (err instanceof ApiError) {
    return throwError(() => err);
  }
  if (err instanceof HttpErrorResponse) {
    const body = err.error as ApiEnvelope<unknown> | undefined;
    return throwError(() => new ApiError(
      err.status,
      body?.code,
      body?.message ?? err.message ?? 'network error',
      body,
    ));
  }
  return throwError(() => new ApiError(0, 'unknown', String(err)));
}
