import { Injectable, signal, computed, effect, inject } from "@angular/core";
import {
  Conversation, Message, MessagesByConv, CustomSection, ConvTasksMap, ConvTask,
  DraftsMap, DraftState, ReactionsMap, PinnedMap, SavedMap, ViewKey, UserRole,
  SectionId, Reaction, PortalSession,
} from "../models/types";
// Mock data is no longer the source of truth — backend hydration via
// LiveDataService.connect() populates these signals from the real API.
// The seeds are commented out (not deleted) so the mock files remain
// available for unit tests, demo screenshots, or fallback restoration.
//
// import { INITIAL_CONVERSATIONS } from "../data/conversations";
// import { INITIAL_MESSAGES } from "../data/messages";
// import { CUSTOMER_PORTAL_SESSIONS } from "../data/dashboard";
import { LiveDataService } from "./live-data.service";
import { FcmListenerService } from "./fcm-listener.service";
import { IdentityService } from "./identity.service";
import type { LiveMessage } from "./adapters";
import type { SendMessageBody } from "./api-client.service";
import type { ChannelInfo } from "../models/api-types";

/**
 * ChatStateService — single source of truth for the app's mutable state.
 *
 * Why a service: in the React file, ~25 useState calls live on the top-level
 * ChatApp component and are passed down via props. To avoid prop drilling
 * across ~50 Angular components, we centralise the state in a service that
 * any component can inject. Signals provide fine-grained reactivity.
 */
@Injectable({ providedIn: "root" })
export class ChatStateService {
  /* ---------------------- Core data ---------------------- */

  // Empty by default — populated by `connect()` from chat-service. The
  // mock seeds (INITIAL_CONVERSATIONS / INITIAL_MESSAGES) are commented
  // at the import block above; restore by un-commenting if you need to
  // demo without a backend running.
  readonly conversations = signal<Conversation[]>([]);
  readonly messagesByConv = signal<MessagesByConv>({});

  /* ---------------------- View / selection ---------------------- */

  readonly view = signal<ViewKey>("home");
  readonly selectedSection = signal<SectionId>("all");
  // No default active conv — set after `connect()` resolves with the
  // most-recent channel from the user's list.
  readonly activeConv = signal<string | null>(null);
  readonly userRole = signal<UserRole>("customer_support");

  /* ---------------------- Per-message state ---------------------- */

  readonly reactions = signal<ReactionsMap>({});
  readonly pinnedMsgs = signal<PinnedMap>({});
  readonly savedMsgs = signal<SavedMap>({});
  readonly drafts = signal<DraftsMap>({});
  readonly editingMsgId = signal<string | null>(null);

  /* ---------------------- Tasks ---------------------- */

  // Tasks are per-channel and currently a frontend-only feature. When
  // the Tasks panel goes live (Phase TBD), this will hydrate from a
  // /channels/:id/tasks endpoint. For now, empty.
  //
  // Mock seed (kept for reference):
  //   {
  //     "origin-software": [
  //       { id: "task-1", title: "Review rate revision PR", done: false, assignee: "me", due: "Today" },
  //       { id: "task-2", title: "Reply to Ashwath on Zeplin spec", done: false, assignee: "me", due: "Today" },
  //       { id: "task-3", title: "Untouched > 3 weeks filter", done: true, assignee: "rajkumar" },
  //     ],
  //     "ext-acme": [
  //       { id: "task-acme-1", title: "Send revised quote with seasonal flex tier", done: false, assignee: "me", due: "Today" },
  //       { id: "task-acme-2", title: "Schedule follow-up call", done: false, assignee: "me" },
  //     ],
  //   }
  readonly convTasks = signal<ConvTasksMap>({});

  /* ---------------------- Custom sections ---------------------- */

  readonly customSections = signal<CustomSection[]>([]);

  /** Default order for the sidebar's section list. Built-ins first in
   *  their pre-existing order, then any custom sections appended on
   *  creation. The user can drag/up-down-arrow to reorder, and the new
   *  order persists across reloads via localStorage. */
  private readonly DEFAULT_SECTION_ORDER = ["customers", "ai", "direct", "test", "spaces"];
  private readonly SECTION_ORDER_KEY = "airlift-chat:section-order";
  readonly sectionOrder = signal<string[]>(this.loadSectionOrder());

  private loadSectionOrder(): string[] {
    if (typeof localStorage === "undefined") return [...this.DEFAULT_SECTION_ORDER];
    try {
      const raw = localStorage.getItem(this.SECTION_ORDER_KEY);
      if (!raw) return [...this.DEFAULT_SECTION_ORDER];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [...this.DEFAULT_SECTION_ORDER];
      // Sanitize: keep only string IDs the persisted array provides, then
      // append any default built-ins that the saved version is missing
      // (e.g. user upgraded the app and we added a new built-in section).
      const seen = new Set<string>();
      const out: string[] = [];
      for (const v of arr) {
        if (typeof v !== "string") continue;
        if (seen.has(v)) continue;
        seen.add(v);
        out.push(v);
      }
      for (const id of this.DEFAULT_SECTION_ORDER) {
        if (!seen.has(id)) out.push(id);
      }
      return out;
    } catch { return [...this.DEFAULT_SECTION_ORDER]; }
  }

  /* ---------------------- Side panels (top-level booleans, mirror React) --------- */

  readonly showSearch = signal(false);
  readonly showThread = signal<string | null>(null);
  readonly showBoard = signal(false);
  readonly showFollowing = signal(false);
  readonly showTasks = signal(false);
  readonly showPinned = signal(false);
  readonly showSharedMedia = signal(false);
  readonly showStatusEditor = signal(false);

  /** Currently-expanded message (for the fullscreen viewer overlay).
   *  null when nothing is open. The bubble's more menu sets this via
   *  openMessageFullscreen(); the overlay component watches it and
   *  renders. Esc / backdrop click clears it. */
  readonly expandedMessage = signal<Message | null>(null);

  /* ---------------------- Layout / resizable ---------------------- */

  readonly sidebarCollapsed = signal(false);
  readonly sidebarFullScreen = signal(false);
  readonly sidePanelFullscreen = signal(false);

  /** Panel widths persist to localStorage so the user's resize preference
   *  survives reloads. Initial values come from the loaders below; the
   *  constructor wires an effect that writes back on every change. */
  private readonly SIDEBAR_WIDTH_KEY = "airlift-chat:sidebar-width";
  private readonly THREAD_WIDTH_KEY = "airlift-chat:thread-width";
  readonly sidebarWidth = signal(this.loadWidth(this.SIDEBAR_WIDTH_KEY, 320, 280, 620));
  readonly threadWidth = signal(this.loadWidth(this.THREAD_WIDTH_KEY, 420, 320, 640));
  readonly threadResizing = signal(false);
  readonly sidebarResizing = signal(false);

  /** Read a width from localStorage and clamp to the resize range. Falls
   *  back to the provided default if the storage value is missing or junk. */
  private loadWidth(key: string, fallback: number, min: number, max: number): number {
    if (typeof localStorage === "undefined") return fallback;
    const raw = localStorage.getItem(key);
    const n = raw ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  /* ---------------------- User status (persisted) ----------------------
   *  Custom Slack/GChat-style status — emoji + short text + optional
   *  auto-clear timestamp. Persisted across reloads. The constructor
   *  starts a setInterval that clears expired statuses once a minute. */
  private readonly USER_STATUS_KEY = "airlift-chat:user-status";
  readonly userStatus = signal<{ emoji: string; text: string; clearAt: number | null } | null>(this.loadUserStatus());

  private loadUserStatus(): { emoji: string; text: string; clearAt: number | null } | null {
    if (typeof localStorage === "undefined") return null;
    try {
      const raw = localStorage.getItem(this.USER_STATUS_KEY);
      if (!raw) return null;
      const v = JSON.parse(raw);
      if (!v || typeof v !== "object" || !v.emoji || typeof v.text !== "string") return null;
      // Skip if already expired.
      if (typeof v.clearAt === "number" && v.clearAt > 0 && Date.now() >= v.clearAt) return null;
      return { emoji: String(v.emoji), text: String(v.text), clearAt: v.clearAt ?? null };
    } catch { return null; }
  }
  setUserStatus(value: { emoji: string; text: string; clearAt: number | null } | null): void {
    this.userStatus.set(value);
    if (typeof localStorage !== "undefined") {
      if (value) localStorage.setItem(this.USER_STATUS_KEY, JSON.stringify(value));
      else localStorage.removeItem(this.USER_STATUS_KEY);
    }
    // Live mode: also push to chat-service so the status follows the
    // user across devices. localStorage stays in sync as the immediate
    // optimistic source for next page load.
    if (this.live() && this.liveData) {
      void this.liveData.setUserStatus({
        emoji: value?.emoji ?? "",
        text: value?.text ?? "",
        clearAt: value?.clearAt ?? null,
      });
    }
  }
  clearUserStatus(): void { this.setUserStatus(null); }

  /** Pull the caller's status from chat-service and overwrite the
   *  local cache. Called once on connect() so a status set on another
   *  device shows up here too. */
  async loadUserStatusLive(): Promise<void> {
    if (!this.liveData) return;
    const remote = await this.liveData.loadUserStatus();
    if (!remote) {
      // Server says no status; clear local too.
      this.userStatus.set(null);
      if (typeof localStorage !== "undefined") localStorage.removeItem(this.USER_STATUS_KEY);
      return;
    }
    const next = {
      emoji: remote.emoji ?? "",
      text: remote.text ?? "",
      clearAt: remote.clear_at ? new Date(remote.clear_at).getTime() : null,
    };
    this.userStatus.set(next);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(this.USER_STATUS_KEY, JSON.stringify(next));
    }
  }

  /* ---------------------- Composer reply state ---------------------- */

  readonly replyingTo = signal<{ msgId: string; convId: string } | null>(null);

  /* ---------------------- Threads view state ---------------------- */

  /** Threads the user has manually clicked "Follow" on (key: `${convId}:${msgId}`) */
  readonly manuallyFollowedThreads = signal<Set<string>>(new Set());
  /** Threads the user has explicitly unfollowed (key: `${convId}:${msgId}`) */
  readonly manuallyUnfollowedThreads = signal<Set<string>>(new Set());
  /** Threads marked read (key: `${convId}:${msgId}`) */
  readonly readThreads = signal<Set<string>>(new Set());

  /* ---------------------- Customer portal sessions ---------------------- */

  /** Live state of customer-facing AI sessions. Empty by default — the
   *  HandoffQueueComponent reads from LiveDataService.loadHandoffs() now.
   *  CUSTOMER_PORTAL_SESSIONS (mock) is commented at the import block;
   *  uncomment and re-spread here to restore the legacy URGENT mock UI. */
  readonly portalSessions = signal<PortalSession[]>([]);

  /** Operator takes over an AI-fronted session. Flips mode → human_only,
   *  status → active, sets assignee to current user. */
  takeOverPortalSession(id: string, assignee = "me"): void {
    this.portalSessions.update((list) =>
      list.map((s) => (s.id === id ? {
        ...s,
        mode: "human_only",
        status: "active",
        assignee,
        waitingFor: "—",
        waitingMinutes: 0,
        unread: 0,
      } : s))
    );
  }

  /** Operator declines the handoff — AI continues solo. Status flips back
   *  to whatever the AI was doing before, and the wait-time clock resets. */
  continueAIPortalSession(id: string): void {
    this.portalSessions.update((list) =>
      list.map((s) => (s.id === id ? {
        ...s,
        mode: "ai_only",
        status: "active",
        assignee: null,
        waitingFor: "—",
        waitingMinutes: 0,
      } : s))
    );
  }

  /** Mark a session resolved. */
  resolvePortalSession(id: string): void {
    this.portalSessions.update((list) =>
      list.map((s) => (s.id === id ? {
        ...s,
        mode: "resolved",
        status: "resolved",
        waitingFor: "—",
        waitingMinutes: 0,
        unread: 0,
        resolvedAt: "just now",
      } : s))
    );
  }

  /** Reassign a session to a different operator (default: clears assignee → awaiting). */
  reassignPortalSession(id: string, newAssignee: string | null = null): void {
    this.portalSessions.update((list) =>
      list.map((s) => (s.id === id ? {
        ...s,
        assignee: newAssignee,
        status: newAssignee ? "assigned" : "awaiting_handoff",
      } : s))
    );
  }

  /* ---------------------- HomeList toggle ---------------------- */

  /** "Unread" filter pill on the conversation list panel header */
  readonly unreadOnly = signal(false);
  /** "Split pane" toggle (placeholder — used by HomeList header in some modes) */
  readonly splitPane = signal(false);

  /** Multi-select for bulk actions on messages. Holds the IDs of currently
   *  selected messages. Cleared on conv switch (handled by setActiveConv).
   *  Selection mode is only entered when the user picks Save / Forward /
   *  Delete from a message's More menu — `pendingBulkAction` records which
   *  one. The selection bar at the top of the conv shows just that action,
   *  not all three, so the workflow stays focused. */
  readonly selectedMsgs = signal<Set<string>>(new Set());
  readonly pendingBulkAction = signal<"save" | "forward" | "delete" | null>(null);

  /** Conversations currently popped out as floating Gmail/GChat-style cards
   *  in the bottom-right of the viewport. Each entry can be minimized
   *  independently. The order in the array is the visual order from
   *  right-to-left (most-recent on the right). */
  readonly popupConvs = signal<{ convId: string; minimized: boolean }[]>([]);

  /* ---------------------- Derived state ---------------------- */

  /** Current conversation object (or null). */
  readonly currentConv = computed<Conversation | null>(() => {
    const id = this.activeConv();
    if (!id) return null;
    return this.conversations().find((c) => c.id === id) ?? null;
  });

  /** Messages for the active conversation. */
  readonly currentMessages = computed<Message[]>(() => {
    const id = this.activeConv();
    if (!id) return [];
    return this.messagesByConv()[id] ?? [];
  });

  /** Messages for the active conversation INCLUDING any in-flight AI
   *  streaming bubble. The streaming bubble's blocks update on every
   *  ai.block.delta event; OnPush components re-render when this signal
   *  changes. Used by app.component's message list instead of
   *  currentMessages so the live AI reply appears inline as it streams. */
  readonly currentMessagesWithStreaming = computed<Message[]>(() => {
    const id = this.activeConv();
    if (!id) return [];
    const persisted = this.messagesByConv()[id] ?? [];
    const streaming = this.streamingByConv()[id];
    if (!streaming || streaming.length === 0) return persisted;
    // Append streaming entries that aren't already in the persisted list
    // (the persisted list catches up after ai.message.end fires).
    const seen = new Set(persisted.map((m) => m.id));
    const tail = streaming.filter((s) => !seen.has(s.id));
    return tail.length > 0 ? [...persisted, ...tail] : persisted;
  });

  /** Whether the current user can take over customer handoffs (CS role). */
  readonly canHandleCustomerHandoffs = computed(
    () => this.userRole() === "customer_support" || this.userRole() === "admin"
  );

  /* ============================================================
   *   CONSTRUCTOR — persistence wiring
   * ============================================================ */

  constructor() {
    // Persist resizable panel widths to localStorage on every change. Reads
    // the signals → writes to storage; no signal writes happen inside, so
    // `allowSignalWrites` is not needed.
    effect(() => {
      const w = this.sidebarWidth();
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(this.SIDEBAR_WIDTH_KEY, String(w));
      }
    });
    effect(() => {
      const w = this.threadWidth();
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(this.THREAD_WIDTH_KEY, String(w));
      }
    });

    // Persist sidebar section order. Updates whenever the user drags or
    // taps the up/down arrows in rearrange mode, or when a new custom
    // section is added (which appends to the order). Reads only — no
    // signal writes — so allowSignalWrites isn't needed.
    effect(() => {
      const order = this.sectionOrder();
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(this.SECTION_ORDER_KEY, JSON.stringify(order));
      }
    });

    // Auto-clear expired user statuses. Every 30s we check whether the
    // current status has hit its clearAt timestamp; if so, drop it. 30s
    // is a coarse but cheap cadence — for a UX where the user picks
    // "clear in 1 hour" they don't notice the up-to-30s lag.
    if (typeof window !== "undefined") {
      setInterval(() => {
        const s = this.userStatus();
        if (s && typeof s.clearAt === "number" && s.clearAt > 0 && Date.now() >= s.clearAt) {
          this.setUserStatus(null);
        }
      }, 30_000);
    }
  }

  /* ============================================================
   *   LIVE BACKEND INTEGRATION (Phase 9d)
   * ============================================================
   *
   * connect() opts the service into talking to chat-service instead of
   * the mock data layer. Until called, the service behaves identically
   * to the original demo (mock seeds, mock sends).
   *
   * Lifecycle:
   *
   *   appComponent.ngOnInit() {
   *     if (identity.isAuthenticated()) {
   *       await chatState.connect();   // hydrates conversations + active messages
   *     }
   *   }
   *
   * Once connected, sends route through `sendMessageLive` instead of
   * `appendMessage`. AI sends use the SSE path under the hood; the
   * accumulator is exposed via `streamingMessageFor(convId)` for the
   * message-bubble component to consume.
   * ============================================================ */

  /** True after connect() resolves successfully. Components can gate
   *  empty-state UIs on `live() ? !conversations().length : false`. */
  readonly live = signal(false);

  /** Pagination state for the conversation list. The sidebar calls
   *  loadMoreConvsLive() when its bottom sentinel scrolls into view. */
  readonly hasMoreConvs = signal(true);
  readonly loadingMoreConvs = signal(false);
  /** Page size for sidebar pagination. Tuned so the first page covers
   *  most users in one shot but a power user with hundreds of channels
   *  still gets responsive scroll. */
  private static readonly CONV_PAGE_SIZE = 50;

  /** Live dashboard signals — populated by loadDashboardLive. Each
   *  is null until the first hydrate completes. The dashboard reads
   *  these directly so KPIs, the urgent queue, and the assigned-to-me
   *  list reflect what's actually in chat-service. */
  readonly liveHandoffs = signal<import("../models/api-types").HandoffRequest[] | null>(null);
  readonly liveUnreadByChannel = signal<Record<string, number> | null>(null);
  readonly liveTotalUnread = signal<number>(0);
  readonly liveSavedCount = signal<number>(0);
  /** Hydrating flag — true while loadDashboardLive is in flight. Drives
   *  the dashboard's "Loading…" state when the page is first opened. */
  readonly dashboardLoading = signal<boolean>(false);
  /** Per-conv message pagination state. The bubble-list scroll
   *  observers read these to decide whether to fire a load.
   *  - hasMoreOlder defaults true (we never know the channel-start
   *    until a paged fetch returns less than a full page).
   *  - hasMoreNewer defaults false on a normal open (initial load
   *    starts from the latest), flips true after jump-to-message. */
  readonly msgPagination = signal<Record<string, { hasMoreOlder: boolean; hasMoreNewer: boolean; loading?: boolean }>>({});
  private static readonly MSG_PAGE_SIZE = 50;

  /** In-flight AI message accumulators, keyed by channel id. The bubble
   *  component reads this to render streaming blocks. Cleared when the
   *  stream completes (done flag flips). */
  readonly streamingByConv = signal<Record<string, LiveMessage[] | undefined>>({});

  /** Cached ChannelInfo per channel id. Populated by `loadChannelInfo`
   *  on conversation switch (called from setActiveConv when live). The
   *  conversation header reads from here so it doesn't fire its own
   *  request on every render. Keyed by channel id; entry is undefined
   *  while a load is in-flight or before the channel was ever opened. */
  readonly channelInfoByConv = signal<Record<string, ChannelInfo | undefined>>({});

  /** Convenience computed: the active channel's info (or null when not
   *  loaded yet / no active conv). Header components subscribe to this
   *  rather than picking from the map manually. */
  readonly activeChannelInfo = computed<ChannelInfo | null>(() => {
    const id = this.activeConv();
    if (!id) return null;
    return this.channelInfoByConv()[id] ?? null;
  });

  private readonly liveData = inject(LiveDataService, { optional: true });
  private readonly fcm = inject(FcmListenerService, { optional: true });
  private readonly identity = inject(IdentityService);
  private fcmSubscribed = false;

  /** Hydrate conversations + active conv's messages from the backend.
   *  Safe to call multiple times — last call wins. Returns true on
   *  success, false on missing identity or backend error. */
  async connect(): Promise<boolean> {
    if (!this.liveData) return false;
    const convs = await this.liveData.loadConversations({
      limit: ChatStateService.CONV_PAGE_SIZE,
    });
    // First page exhausted the list when it returned fewer rows than
    // the page size — we know loadMoreConvsLive shouldn't fire.
    this.hasMoreConvs.set(convs.length >= ChatStateService.CONV_PAGE_SIZE);
    if (convs.length === 0) {
      this.live.set(true);
      return true;
    }
    this.conversations.set(convs);
    // Pick the most-recent channel as the active conv if none is set.
    if (!this.activeConv()) {
      this.activeConv.set(convs[0]?.id ?? null);
    }
    // Load messages for the active conv only — others load lazily on switch.
    const id = this.activeConv();
    if (id) {
      const msgs = await this.liveData.loadMessages(id);
      this.messagesByConv.update((m) => ({ ...m, [id]: msgs }));
    }
    this.live.set(true);
    this.subscribeFcm();
    // Background-hydrate per-user state so the Saved view + status pill +
    // composer drafts + sidebar layout reflect server state on first
    // load (not just localStorage). Quiet on failure — all non-critical.
    void this.loadSavedLive();
    void this.loadUserStatusLive();
    void this.loadDraftsLive();
    void this.loadPreferencesLive();
    void this.loadDashboardLive();
    void this.loadMyTasksLive();
    return true;
  }

  /** Fetch the next page of conversations using the oldest currently-
   *  loaded channel id as the cursor. Idempotent (guarded by
   *  loadingMoreConvs + hasMoreConvs). The sidebar calls this when its
   *  bottom sentinel scrolls into view. */
  async loadMoreConvsLive(): Promise<void> {
    if (!this.liveData) return;
    if (!this.hasMoreConvs() || this.loadingMoreConvs()) return;
    const list = this.conversations();
    if (list.length === 0) return;
    // Cursor = oldest loaded channel id (server returns newest-first
    // and pages strictly older). The legacy Conversation has no api
    // field for mock convs; LiveConversation does — read the api id
    // when present, fall back to local id otherwise.
    const oldest = list[list.length - 1] as { api?: { id: string }; id: string };
    const before = oldest?.api?.id ?? oldest?.id;
    if (!before) return;
    this.loadingMoreConvs.set(true);
    try {
      const next = await this.liveData.loadConversations({
        before,
        limit: ChatStateService.CONV_PAGE_SIZE,
      });
      if (next.length === 0) {
        this.hasMoreConvs.set(false);
        return;
      }
      // Dedup defensively in case the cursor returns an overlap.
      const seen = new Set(list.map((c) => c.id));
      const merged = [...list, ...next.filter((c) => !seen.has(c.id))];
      this.conversations.set(merged);
      this.hasMoreConvs.set(next.length >= ChatStateService.CONV_PAGE_SIZE);
    } finally {
      this.loadingMoreConvs.set(false);
    }
  }

  /** Pull every dashboard data set in one shot:
   *   - GET /handoffs (queue + claimed + resolved-today filter)
   *   - GET /unread (per-channel breakdown)
   *   - GET /unread-count (total)
   *   - GET /me/starred (saved-messages count)
   *  Stores results on the live* signals; FCM subscriber re-fires this
   *  when phase.changed / message.created lands so the dashboard
   *  doesn't go stale. Quiet on partial failure — each source updates
   *  independently. */
  async loadDashboardLive(): Promise<void> {
    if (!this.liveData) return;
    this.dashboardLoading.set(true);
    try {
      const [handoffs, unread, total, starred] = await Promise.all([
        this.liveData.loadHandoffs({ status: ['pending', 'claimed', 'resolved'] }),
        this.liveData.loadUnreadByChannel(),
        this.liveData.loadTotalUnread(),
        this.liveData.loadStarred(),
      ]);
      this.liveHandoffs.set(handoffs);
      this.liveUnreadByChannel.set(unread);
      this.liveTotalUnread.set(total);
      this.liveSavedCount.set(starred.length);
    } finally {
      this.dashboardLoading.set(false);
    }
  }

  /** Subscribe to FCM payloads and refresh affected channels. Idempotent
   *  — second + subsequent calls are no-ops. */
  private subscribeFcm(): void {
    if (this.fcmSubscribed || !this.fcm) return;
    this.fcmSubscribed = true;
    this.fcm.messages$.subscribe((payload) => {
      if (!payload.channel_id) return;
      // Only act when the channel exists in the user's list (avoids
      // a 404 thrash if the FCM payload references a channel we just left).
      const exists = this.conversations().some((c) => c.id === payload.channel_id);
      if (!exists) return;
      // Reactions are quiet, message-scoped events — refresh just that
      // one message instead of the whole list. Skip the conv-level
      // refresh (which would re-fetch all messages and flicker).
      if (payload.event === 'reaction.changed' && payload.message_id) {
        void this.refreshMessageReactions(payload.channel_id, payload.message_id);
        return;
      }
      // New message in this channel → cached AI summary is now stale.
      // Drop it so the next banner render fetches a fresh recap.
      if (payload.event === 'message.created') {
        this.invalidateAISummary(payload.channel_id);
      }
      // phase.changed / channel.updated impact the handoff queue +
      // dashboard counts (e.g. someone else claimed a pending). Pull
      // a fresh snapshot in the background so KPIs stay live.
      if (payload.event === 'phase.changed' || payload.event === 'channel.updated' || payload.event === 'message.created') {
        void this.loadDashboardLive();
      }
      void this.refreshConv(payload.channel_id);
      // phase.changed / channel.updated payloads also invalidate the
      // cached header info so the phase pill, member pile, and active
      // handoff state stay accurate without a manual refresh.
      if (payload.event === 'phase.changed' || payload.event === 'channel.updated') {
        void this.refreshChannelInfo(payload.channel_id);
      }
    });
  }

  /** Re-fetch one message and merge its reactions back into the local
   *  list. Triggered by `reaction.changed` FCM payloads so other clients
   *  see emoji changes within seconds without polling. Cheap — the
   *  endpoint we'd call (single message) doesn't exist yet, so we
   *  re-list and pluck. Fine for small windows; if it gets hot we add
   *  GET /messages/:id and switch to that. */
  private async refreshMessageReactions(convId: string, messageID: string): Promise<void> {
    if (!this.liveData) return;
    const msgs = await this.liveData.loadMessages(convId);
    const updated = msgs.find((m) => m.id === messageID);
    if (!updated) return;
    this.messagesByConv.update((map) => {
      const cur = map[convId] ?? [];
      return { ...map, [convId]: cur.map((m) => (m.id === messageID ? updated : m)) };
    });
  }

  /** Switch active conv AND lazily load its messages from the backend
   *  (if connected and not already cached). */
  async setActiveConvLive(id: string | null): Promise<void> {
    this.setActiveConv(id);
    if (!id || !this.live() || !this.liveData) return;
    const have = this.messagesByConv()[id];
    if (have && have.length > 0) return;
    const msgs = await this.liveData.loadMessages(id);
    this.messagesByConv.update((m) => ({ ...m, [id]: msgs }));
  }

  /** Send a message through the backend. Routes to AI dispatch when the
   *  channel is AI-eligible; falls back to plain REST otherwise.
   *
   *  Optimistic update: appends a placeholder user message immediately so
   *  the bubble appears without waiting for the round-trip. On success
   *  the placeholder is replaced with the persisted message. */
  async sendMessageLive(convId: string, body: SendMessageBody): Promise<void> {
    if (!this.liveData) return;
    const conv = this.conversations().find((c) => c.id === convId);
    const isAI = !!conv?.isAI;

    // Optimistic user-message append. Without this the bubble doesn't show
    // until the round-trip (or the AI stream) completes — which feels
    // broken to the sender. We seed a `tmp-` id keyed off client_message_id
    // so a follow-up page reload can replace the placeholder cleanly when
    // it pulls the persisted message.
    const tempId = body.client_message_id
      ? `tmp-${body.client_message_id}`
      : `tmp-${Date.now()}`;
    const optimistic = this.buildOptimisticUserMessage(convId, tempId, body);
    this.messagesByConv.update((map) => ({
      ...map,
      [convId]: [...(map[convId] ?? []), optimistic],
    }));

    if (isAI) {
      // Surface a streaming bubble immediately (empty blocks list) so the
      // user sees "AI is responding…" without waiting for the first block
      // to arrive. The accumulator's blocks fill in via SSE.
      const handle = this.liveData.sendToAI(convId, body);
      const acc = handle.streaming;
      this.streamingByConv.update((s) => ({
        ...s,
        [convId]: [{
          id: `streaming-${convId}`,
          api: undefined as never,
          channelId: convId,
          msgType: 'ai',
          sender: 'bot:ai',
          blocks: [],
          time: 'now',
          text: '',
        } as unknown as LiveMessage],
      }));
      // Poll the accumulator on a 100ms tick. Could be replaced with a
      // proper subject; the adapter cost stays low this way.
      const tick = setInterval(() => {
        if (acc.done) {
          clearInterval(tick);
          handle.cleanup();
          // Inject the final AI message into messagesByConv directly from
          // the accumulator. NO refetch — refetching is what produced the
          // visible "list refresh" the user complained about. The user
          // message is already in the list (optimistic), and the assistant
          // body comes from `acc.blocks` / `acc.finalContent`.
          if (acc.error) {
            // Surface the failure inline as an error block on the bubble.
            const errMsg: LiveMessage = {
              id: acc.messageID || `assistant-err-${Date.now()}`,
              sender: 'bot:ai',
              time: 'now',
              text: acc.error.message || 'AI failed to respond.',
              msgType: 'ai',
              channelId: convId,
              api: undefined as never,
            } as unknown as LiveMessage;
            this.messagesByConv.update((map) => ({
              ...map,
              [convId]: [...(map[convId] ?? []), errMsg],
            }));
          } else {
            const finalMsg: LiveMessage = {
              id: acc.messageID || `assistant-${Date.now()}`,
              sender: 'bot:ai',
              time: 'now',
              text: acc.finalContent,
              blocks: acc.blocks,
              msgType: 'ai',
              channelId: convId,
              api: undefined as never,
            } as unknown as LiveMessage;
            this.messagesByConv.update((map) => ({
              ...map,
              [convId]: [...(map[convId] ?? []), finalMsg],
            }));
          }
          this.streamingByConv.update((s) => ({ ...s, [convId]: undefined }));
          return;
        }
        // In-flight: push current accumulator state so deltas re-render.
        this.streamingByConv.update((s) => ({
          ...s,
          [convId]: [{
            id: acc.messageID || `streaming-${convId}`,
            api: undefined as never,
            channelId: convId,
            msgType: 'ai',
            sender: 'bot:ai',
            blocks: acc.blocks,
            time: 'now',
            text: acc.finalContent,
          } as unknown as LiveMessage],
        }));
      }, 100);
      return;
    }

    // Normal channel: replace the optimistic placeholder with the
    // persisted message once the round-trip resolves. On failure we
    // leave the placeholder so the user can retry / sees their input.
    const msg = await this.liveData.sendNormal(convId, body);
    if (!msg) return;
    this.messagesByConv.update((map) => {
      const cur = map[convId] ?? [];
      return { ...map, [convId]: cur.map((m) => (m.id === tempId ? msg : m)) };
    });
  }

  /** Construct an optimistic user-message bubble that the rest of the
   *  pipeline (bubble, isMe check, scroll-to-bottom, etc.) can render
   *  before the backend round-trip. The id is a `tmp-` prefix so future
   *  message loads can drop or reconcile the placeholder cleanly. */
  private buildOptimisticUserMessage(
    convId: string,
    tempId: string,
    body: SendMessageBody,
  ): LiveMessage {
    const me = this.identity.userRef();
    const html = body.content || '';
    const looksHTML = /<[a-z][\s\S]*>/i.test(html);
    const text = looksHTML
      ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : html;
    return {
      id: tempId,
      sender: me,
      time: 'now',
      text,
      ...(looksHTML ? { html } : {}),
      msgType: 'message',
      channelId: convId,
      api: undefined as never,
    } as unknown as LiveMessage;
  }

  /** Edit a message via the backend, then re-merge the updated body
   *  into messagesByConv so the bubble re-renders. Called by the
   *  message-bubble's submitEdit. */
  async editMessageLive(messageID: string, convId: string, newContent: string): Promise<void> {
    if (!this.liveData) return;
    const updated = await this.liveData.editMessage(messageID, newContent);
    if (!updated) return;
    this.messagesByConv.update((map) => {
      const cur = map[convId] ?? [];
      return { ...map, [convId]: cur.map((m) => (m.id === messageID ? updated : m)) };
    });
  }

  /** Soft-delete via the backend, then drop the message from the local
   *  list. The backend keeps the row for audit; we hide it client-side. */
  async deleteMessageLive(messageID: string, convId: string): Promise<void> {
    if (!this.liveData) return;
    const ok = await this.liveData.deleteMessage(messageID);
    if (!ok) return;
    this.messagesByConv.update((map) => {
      const cur = map[convId] ?? [];
      return { ...map, [convId]: cur.filter((m) => m.id !== messageID) };
    });
  }

  /** Toggle a message's pin state through the backend, then sync the
   *  local pinnedMsgs map. Caller (the bubble) flips optimistically;
   *  on failure we roll the local map back to match the server. */
  async togglePinLive(convId: string, messageID: string): Promise<void> {
    if (!this.liveData) return;
    const wasPinned = (this.pinnedMsgs()[convId] ?? []).includes(messageID);
    // Optimistic flip — keeps the bubble responsive.
    this.togglePin(convId, messageID);
    const updated = await this.liveData.setPinned(messageID, !wasPinned);
    if (!updated) {
      // Server rejected — undo the optimistic flip.
      this.togglePin(convId, messageID);
    }
  }

  /** Hydrate the pinnedMsgs map for a channel from the backend. Called
   *  by the PinnedPanel when it opens (and on conversation switch). */
  async loadPinnedLive(convId: string): Promise<void> {
    if (!this.liveData) return;
    const pinned = await this.liveData.loadPinned(convId);
    this.pinnedMsgs.update((map) => ({ ...map, [convId]: pinned.map((m) => m.id) }));
  }

  /** Toggle a per-user channel flag (pin/star/mute/archive) through the
   *  backend AND optimistically flip local state. Used by the sidebar
   *  conversation row's pin/star/mute/archive menu. */
  async togglePinConvLive(convId: string): Promise<void> {
    if (!this.liveData) return;
    const wasPinned = !!this.conversations().find((c) => c.id === convId)?.pinned;
    this.togglePinConv(convId); // optimistic
    const ok = await this.liveData.applyChannelAction(convId, wasPinned ? 'unpin' : 'pin');
    if (!ok) this.togglePinConv(convId); // rollback
  }

  /** Star (a.k.a. save) a message through the backend, then sync local
   *  savedMsgs map. Optimistic — rolls back on failure. */
  async toggleSaveLive(msgId: string): Promise<void> {
    if (!this.liveData) return;
    const wasSaved = !!this.savedMsgs()[msgId];
    this.toggleSave(msgId); // optimistic
    const updated = await this.liveData.setStarred(msgId, !wasSaved);
    if (!updated) this.toggleSave(msgId); // rollback
  }

  /** Hydrate the savedMsgs map from the backend's per-user starred list.
   *  Called once on connect() so the saved-messages view is populated
   *  with the server-side state, not just stars made this session. */
  async loadSavedLive(): Promise<void> {
    if (!this.liveData) return;
    const starred = await this.liveData.loadStarred();
    const map: Record<string, true> = {};
    for (const m of starred) map[m.id] = true;
    this.savedMsgs.set(map);
  }

  /** Mark a message as viewed for the caller. Idempotent and quiet. */
  async markMessageViewedLive(messageID: string): Promise<void> {
    if (!this.liveData) return;
    await this.liveData.markMessageViewed(messageID);
  }

  /** Archive (or unarchive) a conversation for the caller. Returns
   *  true on success. Per-user flag — other members unaffected. */
  async archiveConvLive(convId: string, archive = true): Promise<boolean> {
    if (!this.liveData) return false;
    return await this.liveData.applyChannelAction(convId, archive ? 'archive' : 'unarchive');
  }

  /** Mute (or unmute) a conversation for the caller. */
  async muteConvLive(convId: string, mute = true): Promise<boolean> {
    if (!this.liveData) return false;
    return await this.liveData.applyChannelAction(convId, mute ? 'mute' : 'unmute');
  }

  /** Per-conv AI summary cache. On-demand only — the banner inside
   *  a conv and the sparkles button on each list row both call
   *  loadAISummaryLive which fills this map. The `loading: true`
   *  state lets the UI render a "Summarizing…" placeholder during
   *  the LLM call. Invalidated by FCM message.created so a new
   *  message triggers a fresh recap on next request. */
  readonly aiSummaryByConv = signal<Record<string, { summary: string; messageCount: number; loadedAt: number; loading?: boolean } | undefined>>({});

  /** Returns the cached summary for a conv if it exists; otherwise
   *  fetches from the backend and caches the result. Stamps a
   *  `loading: true` placeholder during the LLM call so any UI
   *  watching the cache (list-row sparkles button + banner) can
   *  render a spinner without firing its own duplicate request. */
  async loadAISummaryLive(convId: string): Promise<{ summary: string; messageCount: number } | null> {
    if (!this.liveData) return null;
    const cached = this.aiSummaryByConv()[convId];
    if (cached && !cached.loading) {
      return cached.summary
        ? { summary: cached.summary, messageCount: cached.messageCount }
        : null;
    }
    if (cached?.loading) {
      // Already in-flight from another caller — skip the duplicate
      // request; the first call's result will land in the cache.
      return null;
    }
    this.aiSummaryByConv.update((m) => ({
      ...m,
      [convId]: { summary: "", messageCount: 0, loadedAt: 0, loading: true },
    }));
    const res = await this.liveData.loadAISummary(convId);
    if (!res || !res.summary) {
      this.aiSummaryByConv.update((m) => ({
        ...m,
        [convId]: { summary: "", messageCount: 0, loadedAt: Date.now() },
      }));
      return null;
    }
    this.aiSummaryByConv.update((m) => ({
      ...m,
      [convId]: { summary: res.summary, messageCount: res.message_count, loadedAt: Date.now() },
    }));
    return { summary: res.summary, messageCount: res.message_count };
  }

  /** Drop the cached AI summary for a conv. Called from the FCM
   *  subscriber when message.created arrives so the next banner
   *  render fetches a fresh recap. */
  invalidateAISummary(convId: string): void {
    this.aiSummaryByConv.update((m) => {
      if (!(convId in m)) return m;
      const next = { ...m };
      delete next[convId];
      return next;
    });
  }


  /** Pull a message-window centered on `anchorID` (default 20 before /
   *  20 after) and replace the cached message list for `convId`. Used
   *  by jump-to-message from search results so the anchor bubble
   *  exists before focusMessage tries to scroll to it. */
  async loadMessagesAroundLive(convId: string, anchorID: string, before = 20, after = 20): Promise<void> {
    if (!this.liveData) return;
    const msgs = await this.liveData.loadMessagesAround(convId, anchorID, before, after);
    if (msgs.length > 0) {
      this.messagesByConv.update((map) => ({ ...map, [convId]: msgs }));
      // Windowed view — both directions can scroll-fetch.
      this.msgPagination.update((m) => ({ ...m, [convId]: { hasMoreOlder: true, hasMoreNewer: true } }));
    }
  }

  /** Fetch one page of OLDER messages and prepend. Idempotent
   *  (guarded by the per-conv `loading` flag). When the page comes
   *  back shorter than the request size, flips hasMoreOlder = false
   *  so the top sentinel stops firing. */
  async loadOlderMessagesLive(convId: string): Promise<void> {
    if (!this.liveData) return;
    const state = this.msgPagination()[convId] ?? { hasMoreOlder: true, hasMoreNewer: false };
    if (!state.hasMoreOlder || state.loading) return;
    const cur = this.messagesByConv()[convId] ?? [];
    if (cur.length === 0) return;
    const oldestID = cur[0].id;
    if (!oldestID) return;
    this.msgPagination.update((m) => ({ ...m, [convId]: { ...state, loading: true } }));
    try {
      const older = await this.liveData.loadOlderMessages(convId, oldestID, ChatStateService.MSG_PAGE_SIZE);
      if (older.length > 0) {
        const seen = new Set(cur.map((c) => c.id));
        const merged = [...older.filter((o) => !seen.has(o.id)), ...cur];
        this.messagesByConv.update((m) => ({ ...m, [convId]: merged }));
      }
      this.msgPagination.update((m) => ({
        ...m,
        [convId]: {
          hasMoreOlder: older.length >= ChatStateService.MSG_PAGE_SIZE,
          hasMoreNewer: state.hasMoreNewer,
        },
      }));
    } catch {
      this.msgPagination.update((m) => ({ ...m, [convId]: { ...state, loading: false } }));
    }
  }

  /** Fetch one page of NEWER messages and append. Only meaningful when
   *  the user is in a windowed view (hasMoreNewer=true after jump-to-
   *  message). If the returned page is short, flips hasMoreNewer=false
   *  — the user is now at the bottom of the channel for real. */
  async loadNewerMessagesLive(convId: string): Promise<void> {
    if (!this.liveData) return;
    const state = this.msgPagination()[convId];
    if (!state || !state.hasMoreNewer || state.loading) return;
    const cur = this.messagesByConv()[convId] ?? [];
    if (cur.length === 0) return;
    const newestID = cur[cur.length - 1].id;
    if (!newestID) return;
    this.msgPagination.update((m) => ({ ...m, [convId]: { ...state, loading: true } }));
    try {
      const newer = await this.liveData.loadNewerMessages(convId, newestID, ChatStateService.MSG_PAGE_SIZE);
      if (newer.length > 0) {
        const seen = new Set(cur.map((c) => c.id));
        const merged = [...cur, ...newer.filter((n) => !seen.has(n.id))];
        this.messagesByConv.update((m) => ({ ...m, [convId]: merged }));
      }
      this.msgPagination.update((m) => ({
        ...m,
        [convId]: {
          hasMoreOlder: state.hasMoreOlder,
          hasMoreNewer: newer.length >= ChatStateService.MSG_PAGE_SIZE,
        },
      }));
    } catch {
      this.msgPagination.update((m) => ({ ...m, [convId]: { ...state, loading: false } }));
    }
  }

  /** Leave a conversation — soft-removes the caller's channel_member
   *  row and drops the conv from the local list on success. */
  async leaveConvLive(convId: string): Promise<boolean> {
    if (!this.liveData) return false;
    const me = this.identity.userRef();
    if (!me) return false;
    const ok = await this.liveData.removeMember(convId, me);
    if (ok) {
      this.conversations.update((list) => list.filter((c) => c.id !== convId));
      if (this.activeConv() === convId) this.setActiveConv(null);
    }
    return ok;
  }

  /** Toggle a reaction through the backend AND optimistically update
   *  the local map. */
  async toggleReactionLive(messageID: string, emoji: string): Promise<void> {
    if (!this.liveData) return;
    await this.liveData.toggleReaction(messageID, emoji);
    // Refetch the message from the backend would be cleaner; for now we
    // bump the local reactions map heuristically.
    this.reactions.update((m) => {
      const existing = m[messageID] ?? [];
      const idx = existing.findIndex((r) => r.emoji === emoji);
      if (idx === -1) {
        return { ...m, [messageID]: [...existing, { emoji, count: 1 }] };
      }
      const cur = existing[idx];
      const nextCount = cur.count > 1 ? cur.count - 1 : 0;
      const next = nextCount === 0
        ? existing.filter((_, i) => i !== idx)
        : existing.map((r, i) => (i === idx ? { ...r, count: nextCount } : r));
      return { ...m, [messageID]: next };
    });
  }

  /** Mark a specific conversation as read up to its latest message.
   *  Optimistically clears the local unread badge AND fires
   *  POST /channels/:id/read so other devices stay in sync. The
   *  per-conv form (vs markActiveConvReadLive below) is what the
   *  AI catch-up banner uses since it knows which conv it represents. */
  async markConvReadLive(convId: string): Promise<void> {
    this.markConvRead(convId); // optimistic — clears badge + unreadStartMsgId
    if (!this.live() || !this.liveData) return;
    const msgs = this.messagesByConv()[convId];
    const last = msgs?.[msgs.length - 1];
    if (!last) return;
    await this.liveData.markRead(convId, last.id);
  }

  /** Mark the active conversation as read up to the latest message. */
  async markActiveConvReadLive(): Promise<void> {
    if (!this.liveData) return;
    const id = this.activeConv();
    if (!id) return;
    const msgs = this.messagesByConv()[id];
    const last = msgs?.[msgs.length - 1];
    if (!last) return;
    await this.liveData.markRead(id, last.id);
  }

  /** Force-refresh one conversation's metadata + messages. Wired by the
   *  FCM listener when a `message.created` payload arrives for a channel
   *  the user is in. */
  async refreshConv(convId: string): Promise<void> {
    if (!this.liveData) return;
    const { messages } = await this.liveData.refresh(convId);
    if (messages.length > 0) {
      this.messagesByConv.update((m) => ({ ...m, [convId]: messages }));
    }
  }

  /* ============================================================
   *   ACTIONS — methods called by components/event handlers
   * ============================================================ */

  setView(v: ViewKey): void {
    this.view.set(v);
    if (v === "home") this.selectedSection.set("all");
    else this.activeConv.set(null);
    this.closeAllSidePanels();
  }

  setSection(sec: SectionId): void {
    this.view.set("home");
    this.selectedSection.set(sec);
    // If the active conv doesn't belong to the new section, drop it.
    const id = this.activeConv();
    if (id) {
      const c = this.conversations().find((x) => x.id === id);
      if (c && c.section !== sec) this.activeConv.set(null);
    }
    this.closeAllSidePanels();
  }

  setActiveConv(id: string | null): void {
    this.activeConv.set(id);
    this.view.set("home");
    this.closeAllSidePanels();
    // Multi-select state is per-conversation — clear when switching.
    this.clearSelection();
    if (id) {
      // Mark conv read on open
      this.markConvRead(id);
      // Live mode: lazily load this conv's messages from the backend on
      // first open. Without this, switching conv flips the active id but
      // the bubble list shows whatever was last cached (or empty for a
      // never-opened conv). The load is async + signal-based — bubbles
      // re-render automatically when messagesByConv updates.
      if (this.live() && this.liveData) {
        const cached = this.messagesByConv()[id];
        if (!cached || cached.length === 0) {
          void this.liveData.loadMessages(id).then((msgs) => {
            this.messagesByConv.update((m) => ({ ...m, [id]: msgs }));
          });
        }
        // Same lazy pattern for channel info — drives the header (member
        // list, phase, active handoff, counts). Refetches if the cached
        // entry is stale (older than 60s) so the header reflects state
        // changes that happened in another tab. The TTL is conservative:
        // FCM `phase.changed` payloads invalidate the cache instantly
        // when the user is online.
        const cachedInfo = this.channelInfoByConv()[id];
        if (!cachedInfo) {
          void this.liveData.loadChannelInfo(id).then((info) => {
            if (info) {
              this.channelInfoByConv.update((m) => ({ ...m, [id]: info }));
            }
          });
        }
      }
    }
  }

  /** Force-refresh the cached ChannelInfo for a channel. Wired by the
   *  FCM subscription so phase / membership changes that happen on the
   *  backend (e.g. someone else claimed the handoff) push into the
   *  header within seconds without a manual reload. */
  async refreshChannelInfo(convId: string): Promise<void> {
    if (!this.liveData) return;
    const info = await this.liveData.loadChannelInfo(convId);
    if (info) {
      this.channelInfoByConv.update((m) => ({ ...m, [convId]: info }));
    }
  }

  /** Close every conversation-scoped side panel — used by navigation helpers
   *  so switching view / section / conversation never leaves a stale panel
   *  hanging from a previous context. */
  closeAllSidePanels(): void {
    this.showThread.set(null);
    this.showBoard.set(false);
    this.showFollowing.set(false);
    this.showTasks.set(false);
    this.showPinned.set(false);
    this.showSharedMedia.set(false);
  }

  setUserRole(r: UserRole): void { this.userRole.set(r); }

  /* ----- Conversations ----- */

  markConvRead(id: string): void {
    this.conversations.update((list) =>
      list.map((c) => (c.id === id ? { ...c, unread: false, unreadStartMsgId: undefined } : c))
    );
  }

  markAllRead(): void {
    this.conversations.update((list) =>
      list.map((c) => (c.unread ? { ...c, unread: false, unreadStartMsgId: undefined } : c))
    );
  }

  togglePinConv(id: string): void {
    this.conversations.update((list) =>
      list.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c))
    );
  }

  moveConvSection(id: string, section: SectionId): void {
    this.conversations.update((list) =>
      list.map((c) => (c.id === id ? { ...c, section } : c))
    );
  }

  addCustomSection(label: string): void {
    const id = `custom-${Date.now()}`;
    const palette = [
      "bg-pink-500", "bg-violet-500", "bg-cyan-500", "bg-indigo-500",
      "bg-emerald-500", "bg-orange-500", "bg-blue-500",
    ];
    const color = palette[this.customSections().length % palette.length];
    this.customSections.update((list) => [...list, { id, label, color }]);
    // Append to the persisted order so the new section shows up at the
    // bottom of the sidebar list rather than wherever the default order
    // would place it.
    this.sectionOrder.update((order) =>
      order.includes(id) ? order : [...order, id]
    );
    void this.savePrefsLive();
  }

  /** Reorder a section by moving it from `from` to `to` (both indices into
   *  `sectionOrder`). No-op if either index is out of range. */
  moveSection(from: number, to: number): void {
    let changed = false;
    this.sectionOrder.update((order) => {
      if (from < 0 || from >= order.length) return order;
      if (to < 0 || to >= order.length) return order;
      if (from === to) return order;
      const next = order.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      changed = true;
      return next;
    });
    if (changed) void this.savePrefsLive();
  }

  /** Mirror current sectionOrder + customSections to chat-service.
   *  Quiet on failure — localStorage is still the immediate source of
   *  truth on next page load even if the round-trip fails. */
  private async savePrefsLive(): Promise<void> {
    if (!this.live() || !this.liveData) return;
    await this.liveData.setPreferences({
      section_order: this.sectionOrder(),
      custom_sections: this.customSections(),
    });
  }

  /** Pull sidebar prefs from the backend and overwrite local state.
   *  Called on connect() so a section the user added on another device
   *  shows up here. localStorage gets refreshed in the same pass via
   *  the existing effects that watch sectionOrder. */
  async loadPreferencesLive(): Promise<void> {
    if (!this.liveData) return;
    const remote = await this.liveData.loadPreferences();
    if (!remote) return;
    if (Array.isArray(remote.section_order) && remote.section_order.length > 0) {
      this.sectionOrder.set(remote.section_order);
    }
    if (Array.isArray(remote.custom_sections)) {
      this.customSections.set(remote.custom_sections.map((s) => ({
        id: s.id,
        label: s.label,
        color: s.color ?? "bg-blue-500",
      })));
    }
  }

  /** Convenience for the rearrange-mode up/down arrows. */
  moveSectionUp(id: string): void {
    const order = this.sectionOrder();
    const i = order.indexOf(id);
    if (i > 0) this.moveSection(i, i - 1);
  }
  moveSectionDown(id: string): void {
    const order = this.sectionOrder();
    const i = order.indexOf(id);
    if (i >= 0 && i < order.length - 1) this.moveSection(i, i + 1);
  }

  /* ----- Messages ----- */

  appendMessage(convId: string, msg: Message): void {
    this.messagesByConv.update((map) => ({
      ...map,
      [convId]: [...(map[convId] ?? []), msg],
    }));
    // Bump conv snippet/time. Strip HTML so rich-text messages don't show
    // raw tags in the list snippet. Truncate at 40 with an ellipsis.
    const raw = msg.text || (msg.html
      ? msg.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : "");
    const truncated = raw.slice(0, 40) + (raw.length > 40 ? "…" : "");
    const prefix = msg.sender === "me"
      ? "You: "
      : msg.sender === "airliftai"
        ? "Airlift Intelligence: "
        : "";
    const snippet = msg.sender === "airliftai" && !raw
      ? "Airlift Intelligence responded"
      : `${prefix}${truncated}`;
    this.conversations.update((list) =>
      list.map((c) => (c.id === convId ? {
        ...c, lastSnippet: snippet, lastTime: "now",
      } : c))
    );
  }

  editMessage(convId: string, msgId: string, patch: Partial<Message>): void {
    this.messagesByConv.update((map) => ({
      ...map,
      [convId]: (map[convId] ?? []).map((m) =>
        m.id === msgId ? { ...m, ...patch, edited: true } : m
      ),
    }));
  }

  deleteMessage(convId: string, msgId: string): void {
    this.messagesByConv.update((map) => ({
      ...map,
      [convId]: (map[convId] ?? []).filter((m) => m.id !== msgId),
    }));
  }

  /* ----- Multi-select / bulk actions ----- */

  toggleMsgSelection(msgId: string): void {
    this.selectedMsgs.update((s) => {
      const next = new Set(s);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  }
  clearSelection(): void {
    this.selectedMsgs.set(new Set());
    this.pendingBulkAction.set(null);
  }
  isMsgSelected(msgId: string): boolean { return this.selectedMsgs().has(msgId); }

  /** Enter bulk-action mode for a specific action with one message
   *  pre-selected. Called when the user picks Save / Forward / Delete
   *  from a message's More menu. */
  enterBulkMode(action: "save" | "forward" | "delete", msgId: string): void {
    this.pendingBulkAction.set(action);
    this.selectedMsgs.set(new Set([msgId]));
  }

  /** Delete all currently selected messages — but only the user's own ones.
   *  Other senders' messages in the selection are silently ignored, so
   *  hostile selection (somehow getting another sender's id into the set)
   *  can't accidentally delete content. */
  bulkDeleteSelected(): number {
    const ids = this.selectedMsgs();
    const convId = this.activeConv();
    if (!convId || ids.size === 0) return 0;
    const msgs = this.messagesByConv()[convId] ?? [];
    const ownIds = new Set(msgs.filter((m) => this.isOwnMessage(m) && ids.has(m.id)).map((m) => m.id));
    if (ownIds.size === 0) { this.clearSelection(); return 0; }
    // Optimistic local removal so the UI feels snappy.
    this.messagesByConv.update((map) => ({
      ...map,
      [convId]: (map[convId] ?? []).filter((m) => !ownIds.has(m.id)),
    }));
    // Live mode: fire DELETE /messages/:id for each id in parallel.
    // Quiet on per-message failure — the optimistic removal stays.
    if (this.live() && this.liveData) {
      for (const id of ownIds) {
        void this.liveData.deleteMessage(id);
      }
    }
    this.clearSelection();
    return ownIds.size;
  }

  /** Save (bookmark) every selected message at once. */
  bulkSaveSelected(): number {
    const ids = this.selectedMsgs();
    if (ids.size === 0) return 0;
    const count = ids.size;
    // Optimistic local set so the Saved view reflects the change instantly.
    this.savedMsgs.update((map) => {
      const next = { ...map };
      ids.forEach((id) => { next[id] = true; });
      return next;
    });
    // Live mode: PUT /messages/:id/star for each. Per-message failures
    // get logged via lastError but don't block the bulk operation.
    if (this.live() && this.liveData) {
      for (const id of ids) {
        void this.liveData.setStarred(id, true);
      }
    }
    this.clearSelection();
    return count;
  }

  /** Helper: was this message authored by the current user? Treats both
   *  the legacy mock sender ("me") and the live namespaced ref as
   *  matching the caller. Used by bulk-delete to avoid silently dropping
   *  someone else's selected message. */
  private isOwnMessage(m: Message): boolean {
    if (!m.sender) return false;
    if (m.sender === "me") return true;
    return m.sender === this.identity.userRef();
  }

  /** Forward selected messages — stub for now. Real forwarding would open
   *  a conv picker; we just clear the selection and let the caller toast. */
  bulkForwardSelected(): number {
    const count = this.selectedMsgs().size;
    this.clearSelection();
    return count;
  }

  /* ----- Reactions / Pins / Saves ----- */

  toggleReaction(msgId: string, emoji: string): void {
    this.reactions.update((map) => {
      const existing = map[msgId] ?? [];
      const found = existing.find((r) => r.emoji === emoji);
      let next: Reaction[];
      if (found) {
        // Toggle: count===1 means remove; >1 means decrement
        next = found.count <= 1
          ? existing.filter((r) => r.emoji !== emoji)
          : existing.map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1 } : r));
      } else {
        next = [...existing, { emoji, count: 1 }];
      }
      return { ...map, [msgId]: next };
    });
  }

  togglePin(convId: string, msgId: string): void {
    this.pinnedMsgs.update((map) => {
      const list = map[convId] ?? [];
      const next = list.includes(msgId)
        ? list.filter((id) => id !== msgId)
        : [...list, msgId];
      return { ...map, [convId]: next };
    });
  }

  toggleSave(msgId: string): void {
    this.savedMsgs.update((map) => {
      const next = { ...map };
      if (next[msgId]) delete next[msgId];
      else next[msgId] = true;
      return next;
    });
  }

  unpin(convId: string, msgId: string): void {
    this.pinnedMsgs.update((map) => ({
      ...map,
      [convId]: (map[convId] ?? []).filter((id) => id !== msgId),
    }));
  }

  /* ----- Drafts -----
   *  Drafts have a hot path (every keystroke fires setDraft) — we
   *  debounce the cross-device mirror to avoid one PUT per character.
   *  300ms is the sweet spot for "feels saved" without burying the
   *  backend in writes from a fast typer. */

  private draftSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

  setDraft(convId: string, draft: DraftState): void {
    this.drafts.update((map) => ({ ...map, [convId]: draft }));
    if (!this.live() || !this.liveData) return;
    const existing = this.draftSaveTimers.get(convId);
    if (existing) clearTimeout(existing);
    this.draftSaveTimers.set(convId, setTimeout(() => {
      this.draftSaveTimers.delete(convId);
      void this.liveData!.setDraft(convId, { text: draft.text, html: draft.html });
    }, 300));
  }

  clearDraft(convId: string): void {
    this.drafts.update((map) => {
      const next = { ...map };
      delete next[convId];
      return next;
    });
    const existing = this.draftSaveTimers.get(convId);
    if (existing) {
      clearTimeout(existing);
      this.draftSaveTimers.delete(convId);
    }
    if (this.live() && this.liveData) {
      void this.liveData.clearDraft(convId);
    }
  }

  /** Hydrate the drafts map from the backend. Called on connect() so
   *  drafts written on another device land here without a manual reload. */
  async loadDraftsLive(): Promise<void> {
    if (!this.liveData) return;
    const remote = await this.liveData.loadDrafts();
    if (Object.keys(remote).length === 0) return;
    this.drafts.set(remote);
  }

  /** Mark a specific message (and everything after) as unread for the
   *  caller. Optimistically flips the conv unread badge AND fires
   *  POST /channels/:id/unread. */
  async markUnreadFromMessageLive(convId: string, messageID: string): Promise<void> {
    // Optimistic — flag the conv as unread so the badge appears
    // immediately. The actual unread_count is computed server-side
    // and will land via the next channel-info / FCM refresh.
    this.conversations.update((list) =>
      list.map((c) => (c.id === convId ? { ...c, unread: true, unreadStartMsgId: messageID } : c)),
    );
    if (!this.live() || !this.liveData) return;
    await this.liveData.markChannelUnread(convId, messageID);
  }

  /* ----- Tasks ----- */

  toggleTask(convId: string, taskId: string): void {
    this.convTasks.update((map) => ({
      ...map,
      [convId]: (map[convId] ?? []).map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)),
    }));
  }

  addTask(convId: string, task: ConvTask): void {
    this.convTasks.update((map) => ({
      ...map,
      [convId]: [...(map[convId] ?? []), task],
    }));
  }

  /** Toggle the `done` flag on a task — optimistic flip + PATCH. */
  async toggleTaskLive(convId: string, taskId: string): Promise<void> {
    if (!this.liveData) return;
    // Find current state for the optimistic flip + rollback.
    const list = this.convTasks()[convId] ?? [];
    const current = list.find((t) => t.id === taskId);
    if (!current) return;
    this.toggleTask(convId, taskId);
    const updated = await this.liveData.updateTask(taskId, { done: !current.done });
    if (!updated) this.toggleTask(convId, taskId); // rollback
  }

  /** Create a task through the backend, then append the persisted row. */
  async addTaskLive(convId: string, body: { title: string; assignee?: string; due?: string }): Promise<void> {
    if (!this.liveData) return;
    const persisted = await this.liveData.createTask(convId, {
      title: body.title,
      assignee_ref: body.assignee,
      due: body.due,
    });
    if (!persisted) return;
    this.convTasks.update((map) => ({
      ...map,
      [convId]: [...(map[convId] ?? []), {
        id: persisted.id,
        title: persisted.title,
        done: !!persisted.done,
        assignee: persisted.assignee_ref,
        due: persisted.due,
      }],
    }));
  }

  /** Hydrate the per-channel task list from chat-service for one
   *  channel. Called by the Tasks side panel on open. */
  async loadTasksLive(convId: string): Promise<void> {
    if (!this.liveData) return;
    const remote = await this.liveData.loadTasks(convId);
    this.convTasks.update((map) => ({
      ...map,
      [convId]: remote.map((t) => ({
        id: t.id,
        title: t.title,
        done: !!t.done,
        assignee: t.assignee_ref,
        due: t.due,
      })),
    }));
  }

  /** Hydrate "tasks assigned to me" across all channels — drives the
   *  dashboard's "My open tasks" KPI. Called on connect(). */
  async loadMyTasksLive(): Promise<void> {
    if (!this.liveData) return;
    const remote = await this.liveData.loadMyTasks();
    // Group by channel for the existing convTasks signal shape.
    const byConv: Record<string, ConvTask[]> = {};
    for (const t of remote) {
      const arr = byConv[t.channel_id] ?? [];
      arr.push({
        id: t.id,
        title: t.title,
        done: !!t.done,
        assignee: t.assignee_ref,
        due: t.due,
      });
      byConv[t.channel_id] = arr;
    }
    // Merge into existing map (don't blow away convs that have local
    // additions). Existing entries for a conv get replaced; convs not
    // in the response stay untouched.
    this.convTasks.update((map) => ({ ...map, ...byConv }));
  }

  /** Soft-remove a task locally + DELETE on the backend. */
  async deleteTaskLive(convId: string, taskId: string): Promise<void> {
    if (!this.liveData) return;
    this.convTasks.update((map) => ({
      ...map,
      [convId]: (map[convId] ?? []).filter((t) => t.id !== taskId),
    }));
    await this.liveData.deleteTask(taskId);
  }

  /* ----- Side-panel toggles (mutually exclusive — opening one closes the others, mirroring React) */

  openThread(msgId: string): void {
    this.closeAllSidePanels();
    this.showThread.set(msgId);
  }
  openBoard(): void { this.closeAllSidePanels(); this.showBoard.set(true); }
  openFollowing(): void { this.closeAllSidePanels(); this.showFollowing.set(true); }
  openTasks(): void { this.closeAllSidePanels(); this.showTasks.set(true); }
  openPinned(): void { this.closeAllSidePanels(); this.showPinned.set(true); }
  openSharedMedia(): void { this.closeAllSidePanels(); this.showSharedMedia.set(true); }
  openSearch(): void { this.showSearch.set(true); }
  openStatusEditor(): void { this.showStatusEditor.set(true); }
  closeStatusEditor(): void { this.showStatusEditor.set(false); }

  /** Open the message-fullscreen viewer for a single message. */
  openMessageFullscreen(msg: Message): void { this.expandedMessage.set(msg); }
  closeMessageFullscreen(): void { this.expandedMessage.set(null); }

  /* ----- Floating conversation popups (Gmail/GChat-style) ----- */

  /** Pop a conversation out into a floating card at the bottom-right.
   *  No-op if the conv is already a popup (we focus/restore it instead). */
  openConvAsPopup(convId: string): void {
    this.popupConvs.update((list) => {
      const existing = list.find((p) => p.convId === convId);
      if (existing) {
        // Already popped out — just un-minimize so the user notices.
        return list.map((p) => (p.convId === convId ? { ...p, minimized: false } : p));
      }
      return [...list, { convId, minimized: false }];
    });
  }

  closeConvPopup(convId: string): void {
    this.popupConvs.update((list) => list.filter((p) => p.convId !== convId));
  }

  toggleConvPopupMinimized(convId: string): void {
    this.popupConvs.update((list) =>
      list.map((p) => (p.convId === convId ? { ...p, minimized: !p.minimized } : p))
    );
  }

  /** Close the popup and switch the main window to that conversation. */
  restoreConvPopupToMain(convId: string): void {
    this.closeConvPopup(convId);
    this.setActiveConv(convId);
  }

  closeThread(): void { this.showThread.set(null); }
  closeBoard(): void { this.showBoard.set(false); }
  closeFollowing(): void { this.showFollowing.set(false); }
  closeTasks(): void { this.showTasks.set(false); }
  closePinned(): void { this.showPinned.set(false); }
  closeSharedMedia(): void { this.showSharedMedia.set(false); }
  closeSearch(): void { this.showSearch.set(false); }

  /* ----- Reply ----- */

  setReplyingTo(msgId: string | null, convId: string | null): void {
    if (msgId && convId) this.replyingTo.set({ msgId, convId });
    else this.replyingTo.set(null);
  }

  /* ----- Threads view ----- */

  followThread(key: string): void {
    this.manuallyFollowedThreads.update((s) => { const n = new Set(s); n.add(key); return n; });
    this.manuallyUnfollowedThreads.update((s) => { const n = new Set(s); n.delete(key); return n; });
  }

  unfollowThread(key: string): void {
    this.manuallyUnfollowedThreads.update((s) => { const n = new Set(s); n.add(key); return n; });
    this.manuallyFollowedThreads.update((s) => { const n = new Set(s); n.delete(key); return n; });
  }

  markThreadRead(key: string): void {
    this.readThreads.update((s) => { const n = new Set(s); n.add(key); return n; });
  }

  markAllThreadsRead(keys: string[]): void {
    this.readThreads.update((s) => {
      const n = new Set(s);
      for (const k of keys) n.add(k);
      return n;
    });
  }
}
