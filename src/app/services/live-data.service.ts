/**
 * live-data.service.ts — backend-backed counterpart to the mock-data
 * initializers in `data/`.
 *
 * The legacy ChatStateService seeds itself from `INITIAL_CONVERSATIONS`
 * and `INITIAL_MESSAGES`. This service replaces those at runtime: it
 * loads channels + messages over REST, adapts them into the legacy
 * shapes, and lets ChatStateService write the result into its signals.
 *
 * Send / react / mark-read flow back through here so the API is called
 * AND the local signal state updates optimistically (so the UI doesn't
 * wait for a roundtrip).
 *
 * On AI channels, sends bypass the REST path and use SseClientService
 * (the response upgrades to text/event-stream and HttpClient can't
 * stream). The streaming message accumulator lives on the chat state.
 */
import { Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  ApiAttachment,
  ApiMessage,
  Channel,
  ChannelInfo,
  HandoffStatus,
  MessageInfoResponse,
  SectionCountsResponse,
  TransitionResult,
  Visibility,
} from '../models/api-types';
import { ApiClientService, type SendMessageBody } from './api-client.service';
import { adaptChannel, adaptMessage, type LiveConversation, type LiveMessage } from './adapters';
import { IdentityService } from './identity.service';
import { registerLiveSender } from '../data/senders';
import { SseClientService, StreamingMessage } from './sse-client.service';

@Injectable({ providedIn: 'root' })
export class LiveDataService {
  /** True after init() has resolved successfully. Components can gate
   *  their first render off this so empty signals don't flash a "no
   *  conversations" state during boot. */
  readonly ready = signal(false);
  /** Last error encountered on init or a background refresh. UI surfaces
   *  this as a small banner; doesn't block the app. */
  readonly lastError = signal<string | null>(null);

  constructor(
    private readonly api: ApiClientService,
    private readonly sse: SseClientService,
    private readonly identity: IdentityService,
  ) {}

  /** Fetch a page of channels for the current user. Optional cursor
   *  paginates older channels (`?before=<channel_id>`). Default page
   *  size is 50 — keeps initial connect snappy and lets the sidebar
   *  trigger a follow-up page on scroll-to-bottom. */
  async loadConversations(opts?: { before?: string; limit?: number }): Promise<LiveConversation[]> {
    const me = this.identity.userRef();
    if (!me) return [];
    try {
      const channels = await firstValueFrom(this.api.listChannels({
        before: opts?.before,
        limit: opts?.limit ?? 50,
      }));
      const adapted = (channels ?? []).map((ch) => adaptChannel(ch, me));
      this.lastError.set(null);
      // Names are embedded in the channel response now via
      // members_summary.recent_names (server-side backfilled). Register
      // them locally so any other lookup path (mention picker, threads)
      // also sees the resolved names without needing /users/lookup.
      for (const c of channels ?? []) {
        const refs = c.members_summary?.recent_refs ?? [];
        const names = c.members_summary?.recent_names ?? [];
        for (let i = 0; i < refs.length; i++) {
          if (names[i]) registerLiveSender(refs[i], names[i]);
        }
      }
      return adapted;
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return [];
    }
  }

  /** Fetch the most-recent N messages for a channel. Reverses to
   *  oldest-first because the bubble list renders top-down. */
  async loadMessages(channelID: string, limit = 50): Promise<LiveMessage[]> {
    try {
      const msgs = await firstValueFrom(this.api.listMessages(channelID, { limit }));
      const adapted = (msgs ?? []).map(adaptMessage).reverse();
      // Each message's sender carries user_name + email already
      // (denormalised on send), so the bubble renders the right name
      // without a second round-trip. We register them locally so any
      // OTHER place in the app that does an unkeyed nameForRef(ref)
      // lookup also gets the live name. Synchronous; no network.
      for (const m of msgs ?? []) {
        if (m.sender?.ref && m.sender?.user_name) {
          registerLiveSender(m.sender.ref, m.sender.user_name);
        }
      }
      return adapted;
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return [];
    }
  }

  /** Older page — used by the top sentinel. Returns oldest-first so
   *  the caller can prepend directly to its message list. */
  async loadOlderMessages(channelID: string, beforeID: string, limit = 50): Promise<LiveMessage[]> {
    try {
      const msgs = await firstValueFrom(this.api.listMessages(channelID, { before: beforeID, limit }));
      return (msgs ?? []).map(adaptMessage).reverse();
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return [];
    }
  }

  /** Newer page — used by the bottom sentinel after a jump-to-message
   *  windowed view. Backend returns oldest-first when only `after` is
   *  set, so the page is ready to append directly. */
  async loadNewerMessages(channelID: string, afterID: string, limit = 50): Promise<LiveMessage[]> {
    try {
      const msgs = await firstValueFrom(this.api.listMessages(channelID, { after: afterID, limit }));
      return (msgs ?? []).map(adaptMessage);
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return [];
    }
  }

  /** Upload a file via chat-service /attachments and return the
   *  attachment metadata ready to pass into the next sendMessage call.
   *  Returns null on failure (caller toasts). */
  async uploadAttachment(file: File): Promise<ApiAttachment | null> {
    try {
      const att = await firstValueFrom(this.api.uploadAttachment(file));
      return { kind: att.kind, url: att.url, filename: att.filename, size: att.size, mime: att.mime };
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  /** Full-text search across the caller's accessible channels. Returns
   *  message hits sorted by relevance. Empty array on empty query. */
  async searchMessages(q: string, channelID?: string, limit = 30): Promise<LiveMessage[]> {
    if (!q.trim()) return [];
    try {
      const msgs = await firstValueFrom(this.api.searchMessages({ q, channelID, limit }));
      return (msgs ?? []).map(adaptMessage);
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return [];
    }
  }

  /** Fetch the rich channel-info payload for the conversation header.
   *  One round-trip returns channel + members + my-member + active
   *  handoff + counts. Components subscribe via the chat-state's
   *  channelInfoByConv signal map (populated below); this raw method is
   *  available for ad-hoc use (e.g. shared-media panel). */
  async loadChannelInfo(channelID: string): Promise<ChannelInfo | null> {
    try {
      const info = await firstValueFrom(this.api.getChannelInfo(channelID));
      return info ?? null;
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  /** Fetch the replies under a thread root. Empty when the message has
   *  no thread or all replies were deleted. Used by ThreadPanelComponent
   *  when it opens a live message — the parent's `thread_meta.reply_count`
   *  tells the bubble how many to expect; this fetches the bodies on demand. */
  async loadThread(messageID: string): Promise<LiveMessage[]> {
    try {
      const msgs = await firstValueFrom(this.api.listThread(messageID));
      return (msgs ?? []).map(adaptMessage);
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return [];
    }
  }

  /** Send a normal (non-AI) message. Returns the persisted message. */
  async sendNormal(channelID: string, body: SendMessageBody): Promise<LiveMessage | null> {
    try {
      const msg = await firstValueFrom(this.api.sendMessage(channelID, body));
      return adaptMessage(msg);
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  /** Send to an AI channel and stream the reply. Returns:
   *   - the StreamingMessage accumulator (subscribe to it via the channel
   *     signal map for live updates)
   *   - the user-message ApiMessage echoed back from Go's pre-persist
   *
   *  The caller owns the lifecycle: on subscriber unsubscribe, the SSE
   *  connection aborts. The accumulator transitions `done = true` when
   *  the stream closes (success or error). */
  sendToAI(channelID: string, body: SendMessageBody): {
    streaming: StreamingMessage;
    cleanup: () => void;
    waitForEnd: () => Promise<StreamingMessage>;
  } {
    const acc = new StreamingMessage();
    const obs = this.sse.sendAIMessage(channelID, body);
    let resolveEnd!: (s: StreamingMessage) => void;
    const ended = new Promise<StreamingMessage>((res) => { resolveEnd = res; });
    const sub = obs.subscribe({
      next: (ev) => {
        acc.ingest(ev);
        if (acc.done) resolveEnd(acc);
      },
      error: (err) => {
        acc.error = { code: 'stream_error', message: stringifyErr(err) };
        acc.done = true;
        resolveEnd(acc);
      },
      complete: () => {
        if (!acc.done) {
          acc.done = true;
          resolveEnd(acc);
        }
      },
    });
    return {
      streaming: acc,
      cleanup: () => sub.unsubscribe(),
      waitForEnd: () => ended,
    };
  }

  /** Toggle a reaction. Returns true on success. */
  async toggleReaction(messageID: string, emoji: string): Promise<boolean> {
    try {
      await firstValueFrom(this.api.toggleReaction(messageID, emoji));
      return true;
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return false;
    }
  }

  /** Mark every message up to messageID as read for the current user. */
  async markRead(channelID: string, messageID: string): Promise<void> {
    try {
      await firstValueFrom(this.api.markChannelRead(channelID, messageID));
    } catch (err) {
      this.lastError.set(stringifyErr(err));
    }
  }

  /** Bulk-mark every message in the channel as read. The server resolves
   *  the latest message id and advances the read pointer to it; no need
   *  to round-trip first. Returns true on success. */
  async markAllRead(channelID: string): Promise<boolean> {
    try {
      await firstValueFrom(this.api.markChannelRead(channelID));
      return true;
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return false;
    }
  }

  /** Owner/admin metadata edit on a channel. Returns the updated channel
   *  doc so callers can replace the local cache without a re-fetch. */
  async updateChannel(
    channelID: string,
    patch: { name?: string; description?: string; icon?: string; is_private?: boolean },
  ): Promise<Channel | null> {
    try {
      return await firstValueFrom(this.api.updateChannel(channelID, patch));
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  /** Owner-only delete. Hard-removes the channel doc on the backend. */
  async deleteChannel(channelID: string): Promise<boolean> {
    try {
      await firstValueFrom(this.api.deleteChannel(channelID));
      return true;
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return false;
    }
  }

  /** Edit a message. Returns the updated body. */
  async editMessage(messageID: string, content: string): Promise<LiveMessage | null> {
    try {
      const msg = await firstValueFrom(this.api.editMessage(messageID, content));
      return adaptMessage(msg);
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  /** Delete (soft) a message. */
  async deleteMessage(messageID: string): Promise<boolean> {
    try {
      await firstValueFrom(this.api.deleteMessage(messageID));
      return true;
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return false;
    }
  }

  /** Pin or unpin one message. Returns the updated message body so the
   *  caller can reflect the new pin state in the local map without a
   *  re-list. */
  async setPinned(messageID: string, pinned: boolean): Promise<LiveMessage | null> {
    try {
      const obs = pinned ? this.api.pinMessage(messageID) : this.api.unpinMessage(messageID);
      const msg = await firstValueFrom(obs);
      return adaptMessage(msg);
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  /** Fetch the pinned message list for a channel. Used to seed the
   *  PinnedPanel when the user opens it on a freshly loaded channel. */
  async loadPinned(channelID: string): Promise<LiveMessage[]> {
    try {
      const msgs = await firstValueFrom(this.api.listPinned(channelID));
      return (msgs ?? []).map(adaptMessage);
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return [];
    }
  }

  /** Star (a.k.a. save) a message for the caller. Returns the updated
   *  message body with the new starred_by[] list. */
  async setStarred(messageID: string, starred: boolean): Promise<LiveMessage | null> {
    try {
      const obs = starred ? this.api.starMessage(messageID) : this.api.unstarMessage(messageID);
      const msg = await firstValueFrom(obs);
      return adaptMessage(msg);
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  /** All messages the caller has starred. Optional channelID scopes
   *  to one channel — useful for the per-conv saved panel. */
  async loadStarred(channelID?: string): Promise<LiveMessage[]> {
    try {
      const opts = channelID ? { channelID } : undefined;
      const msgs = await firstValueFrom(this.api.listStarred(opts));
      return (msgs ?? []).map(adaptMessage);
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return [];
    }
  }

  /** Mark a message as viewed. Idempotent. Quiet (no toast on failure). */
  async markMessageViewed(messageID: string): Promise<void> {
    try {
      await firstValueFrom(this.api.markMessageViewed(messageID));
    } catch (err) {
      // viewed-tracking is best-effort; don't surface to UI.
      this.lastError.set(stringifyErr(err));
    }
  }

  /** Persist the caller's per-channel section override. Returns true
   *  on success; the caller does the optimistic flip + rollback. */
  async setChannelSection(channelID: string, sectionID: string | null): Promise<boolean> {
    try {
      await firstValueFrom(this.api.setChannelSection(channelID, sectionID));
      return true;
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return false;
    }
  }

  /** Demote every conv in the named section back to its type-default.
   *  Returns the count of demoted rows (so the UI can echo it back). */
  async deleteSection(sectionID: string): Promise<number> {
    try {
      const res = await firstValueFrom(this.api.deleteSection(sectionID));
      return res?.demoted_count ?? 0;
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return 0;
    }
  }

  /** Sidebar section badge counts. Returns null on failure so the
   *  caller can fall back to the locally-computed count. */
  async loadSectionCounts(): Promise<SectionCountsResponse | null> {
    try {
      return await firstValueFrom(this.api.getSectionCounts());
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  /** Message-info payload — drives the Message Info side panel.
   *  Returns null on permission/not-found so the caller can render
   *  an empty state without a try/catch. */
  async loadMessageInfo(messageID: string): Promise<MessageInfoResponse | null> {
    try {
      return await firstValueFrom(this.api.getMessageInfo(messageID));
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  /** Channel member roster. Caller must be a member. */
  async loadMembers(channelID: string) {
    try {
      const m = await firstValueFrom(this.api.listMembers(channelID));
      return m ?? [];
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return [];
    }
  }

  /** Invite one or more users to a channel. Idempotent — already-member
   *  refs are skipped silently. Returns the count actually added. */
  async addMembers(channelID: string, refs: string[], role?: string): Promise<{ added: number; refs: string[] } | null> {
    try {
      const res = await firstValueFrom(this.api.addMembers(channelID, refs as never, role));
      return { added: res.added_count, refs: res.added_refs as string[] };
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  /** Remove a member (kick or self-leave). */
  async removeMember(channelID: string, userRef: string): Promise<boolean> {
    try {
      await firstValueFrom(this.api.removeMember(channelID, userRef as never));
      return true;
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return false;
    }
  }

  /** Toggle a per-user channel flag (pin, star, mute, archive). */
  async applyChannelAction(channelID: string, action: 'pin' | 'unpin' | 'star' | 'unstar' | 'mute' | 'unmute' | 'archive' | 'unarchive'): Promise<boolean> {
    try {
      await firstValueFrom(this.api.applyChannelAction(channelID, action));
      return true;
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return false;
    }
  }

  /** Shared attachments + links for a channel, flattened one row per
   *  attachment. type ∈ "file"|"media"|"link"|"all". */
  async loadSharedInfo(channelID: string, kind: 'file' | 'media' | 'link' | 'all', opts?: { offset?: number; limit?: number }) {
    try {
      const items = await firstValueFrom(this.api.listSharedInfo(channelID, kind, opts));
      return items ?? [];
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return [];
    }
  }

  /** Per-channel unread count breakdown for the sidebar badges. */
  async loadUnreadByChannel(): Promise<Record<string, number>> {
    try {
      return await firstValueFrom(this.api.unreadByChannel()) ?? {};
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return {};
    }
  }

  /** Caller's total unread count (for the app-icon badge). */
  async loadTotalUnread(): Promise<number> {
    try {
      const r = await firstValueFrom(this.api.totalUnread());
      return r?.unread_count ?? 0;
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return 0;
    }
  }

  /** Recompute unread_count from messages (drift repair). Optional
   *  channelID narrows to one channel. */
  async refreshUnread(channelID?: string): Promise<number> {
    try {
      const r = await firstValueFrom(this.api.refreshUnread(channelID));
      return r?.unread_count ?? 0;
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return 0;
    }
  }

  /** Bulk unread check for an arbitrary list of channel ids. */
  async processUnreadRows(channelIDs: string[]): Promise<Record<string, boolean>> {
    try {
      return await firstValueFrom(this.api.processUnreadRows(channelIDs)) ?? {};
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return {};
    }
  }

  /** Rich filtered search (Gmail-style query + filters). */
  async searchEverything(body: Parameters<typeof this.api.searchEverything>[0]) {
    try {
      const res = await firstValueFrom(this.api.searchEverything(body));
      return {
        results: (res?.results ?? []).map(adaptMessage),
        total: res?.total ?? 0,
        limit: res?.limit ?? 0,
        offset: res?.offset ?? 0,
      };
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return { results: [], total: 0, limit: 0, offset: 0 };
    }
  }

  /** Autocomplete picker (mention / member-add). */
  async searchUsersAndGroups(opts: Parameters<typeof this.api.searchUsersAndGroups>[0]) {
    try {
      return await firstValueFrom(this.api.searchUsersAndGroups(opts)) ?? [];
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return [];
    }
  }

  /** Window of messages around an anchor — drives jump-to-message
   *  from search results so the bubble list shows surrounding context. */
  async loadMessagesAround(channelID: string, anchor: string, beforeCount = 20, afterCount = 20): Promise<LiveMessage[]> {
    try {
      const msgs = await firstValueFrom(this.api.listMessagesAround(channelID, { anchor, beforeCount, afterCount }));
      return (msgs ?? []).map(adaptMessage);
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return [];
    }
  }

  /** Support-team roster for a CRM record (today: freight booking). */
  async getSupportTeam(module: string, referenceID: string) {
    try {
      return await firstValueFrom(this.api.getSupportTeam(module, referenceID)) ?? [];
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return [];
    }
  }

  /** Static chat-flow menu (prompt + options). */
  async getChatFlowMenu() {
    try {
      return await firstValueFrom(this.api.getChatFlowMenu());
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  /** Post the menu prompt as a system message in the channel. */
  async sendChatFlowMenu(channelID: string, prompt?: string): Promise<LiveMessage | null> {
    try {
      const msg = await firstValueFrom(this.api.sendChatFlowMenu(channelID, prompt));
      return adaptMessage(msg);
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  /** Trigger a flow — posts every step as a system message. */
  async triggerChatFlow(channelID: string, flowID: string): Promise<LiveMessage[]> {
    try {
      const msgs = await firstValueFrom(this.api.triggerChatFlow(channelID, flowID));
      return (msgs ?? []).map(adaptMessage);
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return [];
    }
  }

  /** Per-channel tasks. */
  async loadTasks(channelID: string) {
    try {
      return await firstValueFrom(this.api.listTasks(channelID)) ?? [];
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return [];
    }
  }

  /** Open tasks assigned to the caller across all channels. */
  async loadMyTasks() {
    try {
      return await firstValueFrom(this.api.listMyTasks()) ?? [];
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return [];
    }
  }

  /** Create a task. Returns the persisted row, or null on failure. */
  async createTask(channelID: string, body: { title: string; assignee_ref?: string; due?: string }) {
    try {
      return await firstValueFrom(this.api.createTask(channelID, body));
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  /** Partial-update a task (toggle done, retitle, reassign, due). */
  async updateTask(taskID: string, body: { title?: string; done?: boolean; assignee_ref?: string; due?: string }) {
    try {
      return await firstValueFrom(this.api.updateTask(taskID, body));
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  async deleteTask(taskID: string): Promise<boolean> {
    try {
      await firstValueFrom(this.api.deleteTask(taskID));
      return true;
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return false;
    }
  }

  /** AI catch-up summary for a channel — bullet recap of unread
   *  messages. Returns null when the backend can't produce one (AI
   *  not configured / no unread messages / network failure). */
  async loadAISummary(channelID: string) {
    try {
      return await firstValueFrom(this.api.getAISummary(channelID));
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  /** AI reply-hints — 3 short suggestion replies for the composer
   *  chips. Returns null on failure (network down, AI bridge not
   *  configured, etc.); caller falls back to the local heuristic. */
  async loadAIReplyHints(channelID: string, provider?: string): Promise<string[] | null> {
    try {
      const res = await firstValueFrom(this.api.getAIReplyHints(channelID, provider));
      return res?.suggestions ?? null;
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  /** AI "Thinking…" phrases — 5 short status lines the UI cycles
   *  next to the spinner while the AI is composing a real reply.
   *  Local-LLM-only on the Python side, so cheap to call. Returns
   *  null on failure (caller falls back to a static rotation). */
  async loadAIThinkingWords(channelID: string, question?: string): Promise<string[] | null> {
    try {
      const res = await firstValueFrom(this.api.getAIThinkingWords(channelID, question));
      return res?.words ?? null;
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  /** Stream a generated AI conversation title via Server-Sent Events.
   *  Calls chat-service's `/channels/:id/ai-auto-title-stream` which
   *  proxies the Python local-LLM SSE. Invokes `onDelta(text)` for
   *  each chunk, `onEnd(title)` once the final title arrives, and
   *  `onError(msg)` on any failure. Returns an abort function the
   *  caller can use to cancel the stream early (e.g. nav away from
   *  the conv).
   *
   *  Uses raw `fetch` rather than HttpClient because Angular's
   *  HttpClient doesn't expose the streaming body. */
  streamAutoTitle(
    channelID: string,
    handlers: {
      onDelta?: (text: string) => void;
      onEnd?: (title: string) => void;
      onError?: (msg: string) => void;
    },
  ): () => void {
    const ctrl = new AbortController();
    const url = `/api/v2/chat-service/channels/${channelID}/ai-auto-title-stream`;
    // chat-service auth is JWT — must be passed via the
    // Authorization header (plus x-token for the legacy middleware
    // path). HttpClient adds these automatically; raw fetch has to
    // do it explicitly. Without this the SSE request 401s and the
    // error is invisible to the user.
    const token = this.identity.token();
    const headers: Record<string, string> = { Accept: "text/event-stream" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
      headers["x-token"] = token;
    }
    (async () => {
      try {
        const resp = await fetch(url, {
          method: "GET",
          headers,
          signal: ctrl.signal,
          credentials: "same-origin",
        });
        if (!resp.ok || !resp.body) {
          handlers.onError?.(`HTTP ${resp.status}`);
          return;
        }
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          // SSE events are blank-line-separated. Pull complete
          // events out of the buffer and leave the partial tail.
          let idx: number;
          while ((idx = buf.indexOf("\n\n")) !== -1) {
            const raw = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            this.handleAutoTitleSSEEvent(raw, handlers);
          }
        }
        // Flush any trailing partial event.
        if (buf.trim()) this.handleAutoTitleSSEEvent(buf, handlers);
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        handlers.onError?.(stringifyErr(err));
      }
    })();
    return () => ctrl.abort();
  }

  private handleAutoTitleSSEEvent(
    raw: string,
    handlers: {
      onDelta?: (text: string) => void;
      onEnd?: (title: string) => void;
      onError?: (msg: string) => void;
    },
  ): void {
    let event = "message";
    let data = "";
    for (const line of raw.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (!data) return;
    try {
      const parsed = JSON.parse(data) as { text?: string; title?: string; message?: string };
      if (event === "title.delta" && typeof parsed.text === "string") handlers.onDelta?.(parsed.text);
      else if (event === "title.end" && typeof parsed.title === "string") handlers.onEnd?.(parsed.title);
      else if (event === "title.error") handlers.onError?.(parsed.message || "stream error");
    } catch {
      // Ignore malformed payloads.
    }
  }

  /** Spin up a fresh 1:1 AI chat channel for the caller. Returns the
   *  adapted LiveConversation on success; null on failure (network,
   *  permission, etc.). Caller is responsible for prepending it to
   *  the local conversations list and setting it as the active conv. */
  async createAIChat(): Promise<LiveConversation | null> {
    try {
      const me = this.identity.userRef();
      const channel = await firstValueFrom(this.api.createChannel({
        type: 'ai_direct',
        name: 'Airlift Intelligence',
      }));
      return adaptChannel(channel, me || '');
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  /** Move read pointer back so the named message + everything after
   *  becomes unread again. Returns true on success. */
  async markChannelUnread(channelID: string, messageID: string): Promise<boolean> {
    try {
      await firstValueFrom(this.api.markChannelUnread(channelID, messageID));
      return true;
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return false;
    }
  }

  /** All composer drafts for the caller, returned as
   *  { [channel_id]: { text, html } } for direct merge into chat-state. */
  async loadDrafts(): Promise<Record<string, { text: string; html: string }>> {
    try {
      const list = await firstValueFrom(this.api.listDrafts());
      const map: Record<string, { text: string; html: string }> = {};
      for (const d of list ?? []) {
        map[d.channel_id] = { text: d.text ?? '', html: d.html ?? '' };
      }
      return map;
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return {};
    }
  }

  /** Upsert one draft. Empty text+html clears it. Quiet on failure
   *  (drafts are best-effort; localStorage still has the latest). */
  async setDraft(channelID: string, body: { text?: string; html?: string }): Promise<void> {
    try {
      await firstValueFrom(this.api.setDraft(channelID, body));
    } catch (err) {
      this.lastError.set(stringifyErr(err));
    }
  }

  async clearDraft(channelID: string): Promise<void> {
    try {
      await firstValueFrom(this.api.deleteDraft(channelID));
    } catch (err) {
      this.lastError.set(stringifyErr(err));
    }
  }

  /** Caller's sidebar prefs (section order + custom sections). */
  async loadPreferences() {
    try {
      return await firstValueFrom(this.api.getPreferences());
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  /** Persist sidebar prefs cross-device. */
  async setPreferences(body: { section_order?: string[]; custom_sections?: { id: string; label: string; color?: string; emoji?: string }[] }) {
    try {
      return await firstValueFrom(this.api.setPreferences(body));
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  /** Caller's custom status — null when nothing is set. */
  async loadUserStatus() {
    try {
      return await firstValueFrom(this.api.getUserStatus());
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  /** Upsert the caller's status. Empty emoji+text clears it. */
  async setUserStatus(body: { emoji?: string; text?: string; clearAt?: number | null }) {
    try {
      const wire: { emoji?: string; text?: string; clear_at?: string | null } = {
        emoji: body.emoji,
        text: body.text,
        // wire format is RFC3339; localStorage uses an epoch millis number.
        clear_at: body.clearAt && body.clearAt > 0 ? new Date(body.clearAt).toISOString() : null,
      };
      return await firstValueFrom(this.api.setUserStatus(wire));
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  // ── Handoff queue ─────────────────────────────────────────────────

  async loadHandoffs(opts?: { team?: string; status?: HandoffStatus[] }) {
    try {
      const list = await firstValueFrom(this.api.listHandoffs(opts));
      return list ?? [];
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return [];
    }
  }

  async claimHandoff(id: string) {
    return firstValueFrom(this.api.claimHandoff(id));
  }

  async assignHandoff(id: string, assignee: string) {
    return firstValueFrom(this.api.assignHandoff(id, assignee));
  }

  async dismissHandoff(id: string, reason: string) {
    return firstValueFrom(this.api.dismissHandoff(id, reason));
  }

  async resolveHandoff(id: string) {
    return firstValueFrom(this.api.resolveHandoff(id));
  }

  // ── Transitions ───────────────────────────────────────────────────

  async transitionHandoff(channelID: string, supportTeam: Array<Record<string, unknown>>): Promise<TransitionResult | null> {
    try {
      return await firstValueFrom(this.api.transitionHandoff(channelID, { support_team: supportTeam }));
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  async requestHuman(channelID: string, intentHint?: string): Promise<TransitionResult | null> {
    try {
      return await firstValueFrom(this.api.transitionRequestHuman(channelID, intentHint));
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  async takeOver(channelID: string): Promise<TransitionResult | null> {
    try {
      return await firstValueFrom(this.api.transitionTakeOver(channelID));
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  async returnToAI(channelID: string): Promise<TransitionResult | null> {
    try {
      return await firstValueFrom(this.api.transitionReturnToAI(channelID));
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  async resolveChannel(channelID: string): Promise<TransitionResult | null> {
    try {
      return await firstValueFrom(this.api.transitionResolve(channelID));
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return null;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────

  /** Hydrate display names for a batch of unknown user_refs by hitting
   *  POST /users/lookup. Skips refs that already resolve to a known
   *  Sender (so it's safe to call broadly). Quiet on failure — the
   *  worst case is the bubble shows "User N" until the next call. */
  async hydrateUserNames(refs: string[]): Promise<void> {
    if (refs.length === 0) return;
    // Local SENDERS map de-dup. Avoids burning a round-trip on refs
    // that already resolve to a real name (seed users, previously
    // hydrated migrated users, bot:ai).
    const known = (await import('../data/senders')).SENDERS;
    const unknown = Array.from(new Set(refs)).filter((r) => !known[r]);
    if (unknown.length === 0) return;
    try {
      const resolved = await firstValueFrom(this.api.lookupUsers(unknown as never));
      for (const r of resolved ?? []) {
        if (r.user_name) registerLiveSender(r.ref, r.user_name);
      }
    } catch (err) {
      this.lastError.set(stringifyErr(err));
    }
  }

  /** Force-refresh just one channel + its messages. Used by the FCM
   *  listener when a `message.created` payload arrives. */
  async refresh(channelID: string): Promise<{ channel: Channel | null; messages: LiveMessage[] }> {
    try {
      const [ch, msgs] = await Promise.all([
        firstValueFrom(this.api.getChannel(channelID)),
        this.loadMessages(channelID),
      ]);
      return { channel: ch, messages: msgs };
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return { channel: null, messages: [] };
    }
  }
}

function stringifyErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// ── Re-exports so consumers can import everything from one module ───

export type { LiveConversation, LiveMessage } from './adapters';
export type { Visibility, ApiMessage };
export { StreamingMessage } from './sse-client.service';
