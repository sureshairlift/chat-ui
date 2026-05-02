import { Injectable, signal, computed, effect } from "@angular/core";
import {
  Conversation, Message, MessagesByConv, CustomSection, ConvTasksMap, ConvTask,
  DraftsMap, DraftState, ReactionsMap, PinnedMap, SavedMap, ViewKey, UserRole,
  SectionId, Reaction, PortalSession,
} from "../models/types";
import { INITIAL_CONVERSATIONS } from "../data/conversations";
import { INITIAL_MESSAGES }      from "../data/messages";
import { CUSTOMER_PORTAL_SESSIONS } from "../data/dashboard";

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

  readonly conversations  = signal<Conversation[]>(INITIAL_CONVERSATIONS);
  readonly messagesByConv = signal<MessagesByConv>(structuredClone(INITIAL_MESSAGES));

  /* ---------------------- View / selection ---------------------- */

  readonly view            = signal<ViewKey>("home");
  readonly selectedSection = signal<SectionId>("all");
  readonly activeConv      = signal<string | null>("origin-software");
  readonly userRole        = signal<UserRole>("customer_support");

  /* ---------------------- Per-message state ---------------------- */

  readonly reactions = signal<ReactionsMap>({});
  readonly pinnedMsgs = signal<PinnedMap>({});
  readonly savedMsgs  = signal<SavedMap>({});
  readonly drafts     = signal<DraftsMap>({});
  readonly editingMsgId = signal<string | null>(null);

  /* ---------------------- Tasks ---------------------- */

  readonly convTasks = signal<ConvTasksMap>({
    "origin-software": [
      { id: "task-1", title: "Review rate revision PR",         done: false, assignee: "me",  due: "Today" },
      { id: "task-2", title: "Reply to Ashwath on Zeplin spec", done: false, assignee: "me",  due: "Today" },
      { id: "task-3", title: "Untouched > 3 weeks filter",      done: true,  assignee: "rajkumar" },
    ],
    "ext-acme": [
      { id: "task-acme-1", title: "Send revised quote with seasonal flex tier", done: false, assignee: "me", due: "Today" },
      { id: "task-acme-2", title: "Schedule follow-up call",                    done: false, assignee: "me" },
    ],
  });

  /* ---------------------- Custom sections ---------------------- */

  readonly customSections = signal<CustomSection[]>([]);

  /* ---------------------- Side panels (top-level booleans, mirror React) --------- */

  readonly showSearch       = signal(false);
  readonly showThread       = signal<string | null>(null);
  readonly showBoard        = signal(false);
  readonly showFollowing    = signal(false);
  readonly showTasks        = signal(false);
  readonly showPinned       = signal(false);
  readonly showSharedMedia  = signal(false);

  /* ---------------------- Layout / resizable ---------------------- */

  readonly sidebarCollapsed   = signal(false);
  readonly sidebarFullScreen  = signal(false);
  readonly sidePanelFullscreen = signal(false);

  /** Panel widths persist to localStorage so the user's resize preference
   *  survives reloads. Initial values come from the loaders below; the
   *  constructor wires an effect that writes back on every change. */
  private readonly SIDEBAR_WIDTH_KEY = "airlift-chat:sidebar-width";
  private readonly THREAD_WIDTH_KEY  = "airlift-chat:thread-width";
  readonly sidebarWidth   = signal(this.loadWidth(this.SIDEBAR_WIDTH_KEY, 320, 280, 620));
  readonly threadWidth    = signal(this.loadWidth(this.THREAD_WIDTH_KEY,  420, 320, 640));
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

  /** Live state of customer-facing AI sessions. Mutated by takeOver/continueAI/
   *  resolve/reassign so the dashboard reflects operator decisions in real-time. */
  readonly portalSessions = signal<PortalSession[]>([...CUSTOMER_PORTAL_SESSIONS]);

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
    if (id) {
      // Mark conv read on open
      this.markConvRead(id);
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

  /* ----- Drafts ----- */

  setDraft(convId: string, draft: DraftState): void {
    this.drafts.update((map) => ({ ...map, [convId]: draft }));
  }

  clearDraft(convId: string): void {
    this.drafts.update((map) => {
      const next = { ...map };
      delete next[convId];
      return next;
    });
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

  /* ----- Side-panel toggles (mutually exclusive — opening one closes the others, mirroring React) */

  openThread(msgId: string): void {
    this.closeAllSidePanels();
    this.showThread.set(msgId);
  }
  openBoard():       void { this.closeAllSidePanels(); this.showBoard.set(true); }
  openFollowing():   void { this.closeAllSidePanels(); this.showFollowing.set(true); }
  openTasks():       void { this.closeAllSidePanels(); this.showTasks.set(true); }
  openPinned():      void { this.closeAllSidePanels(); this.showPinned.set(true); }
  openSharedMedia(): void { this.closeAllSidePanels(); this.showSharedMedia.set(true); }
  openSearch():      void { this.showSearch.set(true); }

  closeThread():       void { this.showThread.set(null); }
  closeBoard():        void { this.showBoard.set(false); }
  closeFollowing():    void { this.showFollowing.set(false); }
  closeTasks():        void { this.showTasks.set(false); }
  closePinned():       void { this.showPinned.set(false); }
  closeSharedMedia():  void { this.showSharedMedia.set(false); }
  closeSearch():       void { this.showSearch.set(false); }

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
