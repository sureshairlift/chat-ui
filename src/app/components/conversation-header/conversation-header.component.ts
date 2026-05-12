import {
  ChangeDetectionStrategy, Component, ElementRef, EventEmitter, HostListener,
  Input, OnDestroy, Output, ViewChild, computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { LiveDataService } from "../../services/live-data.service";
import { ToastService } from "../../services/toast.service";
import { SENDERS } from "../../data/senders";
import { Conversation } from "../../models/types";
import type { LiveConversation } from "../../services/adapters";
import type { AIPhase, ChannelInfo, ChannelMember } from "../../models/api-types";
import { IconComponent } from "../icon/icon.component";
import { AvatarComponent } from "../avatar/avatar.component";

interface MenuItem {
  divider?: boolean;
  icon?: string;     // Icon name OR special "threads-svg" for the custom svg
  iconCustom?: "threads";
  label?: string;
  subtext?: string;
  shortcut?: string;
  chevron?: boolean;
  submenu?: boolean;
  danger?: boolean;
  onClick?: () => void;
}

type NotifLevel = "all" | "mentions" | "important" | "none";

/**
 * ConversationHeader — title bar across the message panel.
 * Mirrors React `<ConversationHeader>` 1:1 (~390 lines original).
 *
 * Features:
 *  - Avatar + name + AI/Customer chips + chevron-down dropdown trigger
 *  - Subtitle (members count, org, "Powered by AI", etc.)
 *  - Header dropdown (Google-Chat-style menu with Notifications submenu)
 *  - Right-side action icons (Search, Focus, Board, Tasks, Following, Pinned)
 *    that progressively collapse into a More menu as paneWidth shrinks
 *  - Close button (in split-pane mode)
 */
@Component({
  selector: "app-conversation-header",
  standalone: true,
  imports: [CommonModule, IconComponent, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./conversation-header.component.html",
  styleUrl: "./conversation-header.component.css",
})
export class ConversationHeaderComponent implements OnDestroy {
  state = inject(ChatStateService);
  private readonly liveData = inject(LiveDataService, { optional: true });
  private readonly toast = inject(ToastService);

  @Input({ required: true }) conv!: Conversation;
  @Input() splitPane = true;

  /** While the AI auto-title SSE is streaming, the in-flight text
   *  for this conv (or empty when nothing is streaming). Drives the
   *  "typing" effect in the title header.
   *  Must be a `computed` signal (not a plain method) so the
   *  OnPush change detector re-renders the template on every delta
   *  — methods that read signals from the template don't propagate
   *  invalidations the same way. */
  streamingTitle = computed<string>(() => {
    const id = this.conv?.id;
    if (!id) return "";
    const entry = this.state.autoTitleByConv()[id];
    return entry?.streamed || "";
  });

  /** True once the auto-title SSE has emitted title.end. Used to
   *  fade the blinking caret next to the streamed text. */
  streamingTitleDone = computed<boolean>(() => {
    const id = this.conv?.id;
    if (!id) return false;
    const entry = this.state.autoTitleByConv()[id];
    return !!entry?.done;
  });
  @Input() isTablet = false;
  @Input() tasksActive = false;
  @Input() pinnedActive = false;
  @Input() searchActive = false;
  @Input() sharedMediaActive = false;

  // paneWidth and isMobile drive reactive computeds (showSearchInline, etc.).
  // We back them with internal signals so width changes from the parent
  // actually trigger re-evaluation of the inline-vs-overflow icon visibility.
  // Without this, the computeds capture the initial 9999 / false and never
  // update — leaving all six action icons inline regardless of pane width.
  private _paneWidth = signal(9999);
  private _isMobile  = signal(false);
  @Input() set paneWidth(v: number)  { this._paneWidth.set(v ?? 9999); }
  @Input() set isMobile(v: boolean)  { this._isMobile.set(!!v); }
  get paneWidth(): number { return this._paneWidth(); }
  get isMobile(): boolean { return this._isMobile(); }

  @Output() back = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();
  @Output() toggleFocus = new EventEmitter<void>();
  @Output() togglePinConv = new EventEmitter<void>();
  @Output() markUnread = new EventEmitter<void>();
  @Output() markAllRead = new EventEmitter<void>();
  @Output() hideConv = new EventEmitter<void>();
  @Output() archiveConv = new EventEmitter<void>();
  @Output() leaveSpace = new EventEmitter<void>();
  @Output() blockReport = new EventEmitter<void>();
  @Output() clearHistory = new EventEmitter<void>();
  @Output() newAIChat = new EventEmitter<void>();
  /** Edit channel metadata (name / description / icon). Owner+admin only. */
  @Output() editConv = new EventEmitter<void>();
  /** Hard-delete the channel. Owner only. */
  @Output() deleteConv = new EventEmitter<void>();
  /** Pop the conversation out into its own browser window (Google-Chat-style). */
  @Output() openInPopup = new EventEmitter<void>();
  /** Toggle the in-conversation search bar (distinct from the global Cmd+K modal). */
  @Output() toggleConvSearch = new EventEmitter<void>();

  showMore = signal(false);
  showHeaderMenu = signal(false);
  showNotifMenu = signal(false);
  notifLevel = signal<NotifLevel>("all");

  @ViewChild("moreRef") moreRef?: ElementRef<HTMLElement>;
  @ViewChild("headerMenuRef") headerMenuRef?: ElementRef<HTMLElement>;

  readonly NOTIF_OPTIONS = [
    { key: "all" as NotifLevel,       label: "All messages",      desc: "Every message in this conversation",    danger: false },
    { key: "mentions" as NotifLevel,  label: "@mentions only",    desc: "When someone @mentions me or my team",   danger: false },
    { key: "important" as NotifLevel, label: "Important only",    desc: "Decisions, deadlines, and customer escalations", danger: false },
    { key: "none" as NotifLevel,      label: "Mute conversation", desc: "No notifications",                       danger: true  },
  ];

  /* =================== Subtitle text for the dropdown header =================== */
  get subtitleText(): string {
    const c = this.conv;
    if (c.type === "dm") return c.presence === "active" ? "Active now" : "Direct message";
    if (c.type === "space") return `${c.members || ""} members${c.org ? ` · ${c.org}` : ""}`;
    if (c.type === "external") return c.org || "External customer";
    if (c.type === "external-group") return `${c.members || ""} members · ${c.org || ""}`;
    if (c.type === "meeting") return "Meeting room";
    if (c.isAI) return "Airlift Intelligence";
    return "";
  }

  /* =================== Live ChannelInfo accessors =================== */
  //
  // ChatStateService.activeChannelInfo() exposes the rich payload from
  // GET /channels/:id/info — populated lazily on conv switch and
  // refreshed by FCM phase.changed payloads. The helpers below let the
  // template read individual pieces without unwrapping the optional in
  // every binding.

  /** Cached info for the active channel, or null while still loading. */
  get info(): ChannelInfo | null { return this.state.activeChannelInfo(); }

  /** Live member count — overrides the snapshot on `conv.members` once
   *  the info payload arrives. */
  get liveMemberCount(): number {
    return this.info?.channel.members_summary.count ?? this.conv.members ?? 0;
  }

  /** First five members for the avatar pile under the channel name. */
  get memberPile(): ChannelMember[] {
    return (this.info?.members ?? []).slice(0, 5);
  }

  /** Look up a sender record by user_ref so the avatar component can
   *  render the right tint + initials. SENDERS is pre-populated with
   *  every seeded ref → mock-data record (data/senders.ts). */
  senderForRef(ref: string): { name: string; color: string; initials: string } | null {
    return SENDERS[ref] ?? null;
  }

  /** Minimal avatar input for the member-pile chips. AvatarComponent
   *  derives color + initials from `id` (the user_ref) when the
   *  explicit fields are empty — so the same person renders the
   *  same hue/initials here as in their bubble and in the sidebar
   *  conversation row. Uses the API member row's `user_name` when
   *  present; falls back to the legacy SENDERS map name. */
  memberPileUser(m: ChannelMember): { id: string; name: string; color: string; initials: string } {
    const cached = SENDERS[m.user_ref];
    return {
      id: m.user_ref,
      name: m.user_name || cached?.name || m.user_ref,
      color: "",
      initials: "",
    };
  }

  /** True for 1:1 channels (direct + ai_direct) — these don't get an
   *  avatar pile because there's only one other party; the header
   *  subtitle covers their identity already. Reads the API channel type
   *  rather than the legacy `conv.type` because the legacy mapper
   *  collapses direct + group_dm into the same "dm" bucket. */
  get isDirectChat(): boolean {
    const apiType = (this.conv as LiveConversation).api?.type;
    if (apiType === 'direct' || apiType === 'ai_direct') return true;
    // Mock-data fallback: legacy type "dm" with no API doc was always 1:1.
    if (!apiType && this.conv.type === 'dm') return true;
    return false;
  }

  /** Last-activity stamp for direct chats — replaces the avatar pile.
   *  Returns the relative time of the channel's last_message, or empty
   *  when no activity yet. */
  get lastActivityLabel(): string {
    const ts = this.info?.channel.last_activity_at ?? this.info?.channel.last_message?.created_on;
    if (!ts) return '';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    const diff = Date.now() - d.getTime();
    const min = Math.floor(diff / 60_000);
    if (min < 1) return 'Active now';
    if (min < 60) return `Last seen ${min}m ago`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `Last seen ${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'Last seen yesterday';
    if (days < 7) return `Last seen ${days}d ago`;
    return `Last seen ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  }

  /** Banner shown above the action row when the channel has an active
   *  handoff. Customer sees the "agent claimed" state; agents see who
   *  beat them to it (or the urgency pill when still pending). */
  get handoffNotice(): { kind: 'pending' | 'claimed' | null; label: string; agent?: string } {
    const h = this.info?.active_handoff;
    if (!h) return { kind: null, label: '' };
    if (h.status === 'pending') {
      return { kind: 'pending', label: 'Awaiting agent' };
    }
    if (h.status === 'claimed' && h.claimed_by) {
      const sender = SENDERS[h.claimed_by];
      const name = sender?.name ?? h.claimed_by;
      return { kind: 'claimed', label: `Claimed by ${name}`, agent: h.claimed_by };
    }
    return { kind: null, label: '' };
  }

  /* =================== Phase-aware controls (live channels) =================== */
  //
  // When the channel is backed by a live AI session (LiveConversation with
  // .api.ai_session_state), surface a context button row in the header
  // matching the current phase:
  //
  //   ai_only          [Take over]
  //   handoff_pending  [Take over]    (urgent — this is the queue case)
  //   human_active     [Return to AI] [Resolve]
  //   ai_assist        [Return to AI] [Resolve]
  //   resolved         [Re-open]
  //   reopened         (no buttons — auto-flips on next msg)
  //
  // Customer (ext:*) callers see only [Talk to a human] in ai_only/ai_assist.

  /** Phase string when this conv is a live ai_assisted/ai_direct channel,
   *  null otherwise. Drives which buttons appear. */
  get phase(): AIPhase | null {
    const apiCh = (this.conv as LiveConversation).api;
    return apiCh?.ai_session_state?.phase ?? null;
  }

  get phaseControlsVisible(): boolean { return this.phase !== null; }

  /** Take over surfaces ONLY when there's an actual handoff to claim:
   *
   *   - Channel is ai_assisted (ai_direct is the operator's own assistant —
   *     no customer to take over from, ever).
   *   - Phase is handoff_pending (the customer pressed "Talk to a human"
   *     OR the queue routed it here). In plain ai_only there's nothing
   *     waiting and the AI is doing the work; ops shouldn't see a
   *     speculative claim button.
   *   - No-one else has already claimed it (defensive — the backend would
   *     409 anyway, but hiding the button avoids the round-trip).
   */
  get canTakeOver(): boolean {
    const apiCh = (this.conv as LiveConversation).api;
    if (!apiCh) return false;
    if (apiCh.type !== 'ai_assisted') return false;
    if (this.phase !== 'handoff_pending') return false;
    const h = this.info?.active_handoff;
    if (h && h.status === 'claimed') return false;
    return true;
  }

  async onTakeOver(): Promise<void> {
    if (!this.liveData) return;
    const apiCh = (this.conv as LiveConversation).api;
    if (!apiCh) return;
    const res = await this.liveData.takeOver(apiCh.id);
    if (res?.ok) this.toast.show(`Phase → ${res.phase ?? 'unknown'}`);
  }

  async onReturnToAI(): Promise<void> {
    if (!this.liveData) return;
    const apiCh = (this.conv as LiveConversation).api;
    if (!apiCh) return;
    const res = await this.liveData.returnToAI(apiCh.id);
    if (res?.ok) this.toast.show(`Phase → ${res.phase ?? 'unknown'}`);
  }

  async onResolveChannel(): Promise<void> {
    if (!this.liveData) return;
    const apiCh = (this.conv as LiveConversation).api;
    if (!apiCh) return;
    const res = await this.liveData.resolveChannel(apiCh.id);
    if (res?.ok) this.toast.show('Resolved.');
  }

  async onRequestHuman(): Promise<void> {
    if (!this.liveData) return;
    const apiCh = (this.conv as LiveConversation).api;
    if (!apiCh) return;
    const res = await this.liveData.requestHuman(apiCh.id);
    if (res?.ok) this.toast.show('Bringing in our support team.');
  }

  /* =================== Inline-vs-overflow icon visibility =================== */

  /** Each action icon takes ~36px. We progressively collapse low-priority
   *  icons into the More menu as the conv pane shrinks. Mobile always
   *  collapses everything except the More button + Close.
   *  Priority (most → least essential): Search > Focus > Tasks > Pinned > Following > Board */
  fitsInline(key: "search" | "focus" | "tasks" | "pinned" | "following" | "board"): boolean {
    if (this.isMobile) return false;
    const thresholds: Record<typeof key, number> = {
      search: 360, focus: 480, tasks: 580, pinned: 680, following: 780, board: 880,
    };
    return this.paneWidth >= thresholds[key];
  }

  showSearchInline    = computed(() => this.fitsInline("search"));
  showFocusInline     = computed(() => this.fitsInline("focus") && !this.state.sidebarCollapsed());
  showTasksInline     = computed(() => this.fitsInline("tasks"));
  showPinnedInline    = computed(() => this.fitsInline("pinned"));
  showFollowingInline = computed(() => this.fitsInline("following"));
  showBoardInline     = computed(() => this.fitsInline("board"));

  moreItems = computed<MenuItem[]>(() => {
    const m: MenuItem[] = [];
    const isAI = !!this.conv?.isAI;
    if (!this.showBoardInline() && !isAI)     m.push({ icon: "folder-open",    label: "Open board",       onClick: () => this.state.openBoard() });
    if (!this.showTasksInline() && !isAI)     m.push({ icon: "check-circle-2", label: "Tasks",            onClick: () => this.state.openTasks() });
    if (!this.showFollowingInline() && !isAI) m.push({ iconCustom: "threads",  label: "Following",        onClick: () => this.state.openFollowing() });
    // Pinned messages are now hosted inside the Board panel — drop
    // the standalone entry since "Open board" above already gets
    // you there.
    if (!this.showSearchInline())    m.push({ icon: "search",         label: "Search",           onClick: () => this.toggleConvSearch.emit() });
    if (!this.showFocusInline() && !this.state.sidebarCollapsed())
                                     m.push({ icon: "maximize-2",     label: "Focus mode",       onClick: () => this.toggleFocus.emit() });
    return m;
  });

  /* ================== Header dropdown menu ================== */

  menuItems = computed<MenuItem[]>(() => {
    const c = this.conv;
    const items: MenuItem[] = [];

    if (c.type === "space" || c.type === "external-group") {
      items.push({
        icon: "users", label: "View members", subtext: `${c.members || "—"} people`,
        onClick: () => alert(`Members of ${c.name}\n(${c.members || "—"} people)`),
      });
      items.push({ divider: true });
    }
    if (c.type === "external" || c.isExternal) {
      items.push({
        icon: "building-2", label: `View ${c.org || "customer"} profile`,
        onClick: () => alert(`Open profile for ${c.org || c.name}`),
      });
      items.push({ divider: true });
    }
    if (c.type === "meeting") {
      items.push({ icon: "calendar", label: "View on calendar", onClick: () => alert(`Open ${c.name} on calendar`) });
      items.push({ icon: "video",    label: "Join meeting",     onClick: () => alert("Joining meeting…") });
      items.push({ divider: true });
    }

    items.push({
      icon: "bell", label: "Notifications",
      subtext: this.notifLevel() === "all" ? "All messages"
              : this.notifLevel() === "mentions" ? "@mentions only"
              : this.notifLevel() === "important" ? "Important only" : "Muted",
      chevron: true,
      submenu: true,
      onClick: () => this.showNotifMenu.set(!this.showNotifMenu()),
    });
    items.push({ icon: "search", label: "Search in conversation", shortcut: "⌘F",
                 onClick: () => this.toggleConvSearch.emit() });
    items.push({ divider: true });

    items.push({ icon: "pin", label: c.pinned ? "Unpin from top of list" : "Pin to top of list",
                 onClick: () => this.togglePinConv.emit() });
    items.push({ icon: "folder-open", label: "Shared files & media",
                 onClick: () => this.state.openSharedMedia() });
    items.push({ icon: "check", label: "Mark all as read",
                 onClick: () => this.markAllRead.emit() });
    items.push({ icon: "bookmark", label: "Mark as unread",
                 onClick: () => this.markUnread.emit() });
    // Open in popup — hidden for AI sessions (popping the AI out doesn't add
    // value, it's the same instance everywhere) and for any conv that's
    // already popped out (no point popping it from itself).
    const alreadyPopped = this.state.popupConvs().some((p) => p.convId === c.id);
    if (!alreadyPopped && !c.isAI && !this.isMobile) {
      items.push({ icon: "external-link", label: "Open in popup",
                   onClick: () => this.openInPopup.emit() });
    }
    items.push({ divider: true });

    if (c.type === "dm") {
      items.push({ icon: "inbox", label: "Hide conversation", onClick: () => this.hideConv.emit() });
      items.push({ divider: true });
      items.push({ icon: "shield-alert", label: "Block & report", danger: true, onClick: () => this.blockReport.emit() });
    } else if (c.type === "space") {
      items.push({ icon: "plus",            label: "Add people to space", onClick: () => alert(`Add people to ${c.name}`) });
      // Edit + delete are owner/admin-only — the backend gates the
      // request, so we surface the entry universally and let the toast
      // + 403 path handle the not-allowed case. Cheaper than a
      // membership check on every menu render.
      items.push({ icon: "settings",        label: "Edit space",          onClick: () => this.editConv.emit() });
      items.push({ divider: true });
      items.push({ icon: "external-link", label: "Leave space", danger: true, onClick: () => this.leaveSpace.emit() });
      items.push({ icon: "trash-2",       label: "Delete space", danger: true, onClick: () => this.deleteConv.emit() });
    } else if (c.type === "external" || c.type === "external-group") {
      items.push({ icon: "inbox", label: "Archive conversation", onClick: () => this.archiveConv.emit() });
      items.push({ divider: true });
      items.push({ icon: "shield-alert", label: "Report customer", danger: true, onClick: () => this.blockReport.emit() });
    } else if (c.isAI) {
      items.push({ icon: "refresh-cw", label: "Start a new chat", onClick: () => this.newAIChat.emit() });
      items.push({ divider: true });
      items.push({ icon: "trash-2", label: "Clear chat history", danger: true, onClick: () => this.clearHistory.emit() });
    } else if (c.type === "meeting") {
      items.push({ icon: "inbox", label: "Hide from list", onClick: () => this.hideConv.emit() });
    }
    return items;
  });

  /* =================== Action handlers =================== */

  toggleHeaderMenu(): void { this.showHeaderMenu.set(!this.showHeaderMenu()); this.showNotifMenu.set(false); }
  toggleMore(): void { this.showMore.set(!this.showMore()); }

  onMenuItemClick(e: MouseEvent, item: MenuItem): void {
    e.stopPropagation();
    if (!item.submenu) this.showHeaderMenu.set(false);
    item.onClick?.();
  }

  onMoreItemClick(item: MenuItem): void {
    this.showMore.set(false);
    item.onClick?.();
  }

  setNotif(e: MouseEvent, key: NotifLevel): void {
    e.stopPropagation();
    this.notifLevel.set(key);
    this.showNotifMenu.set(false);
  }

  actionBtnClass(active: boolean): string {
    // Explicit w-9 h-9 + shrink-0 so the button stays a perfect 36×36 circle
    // even when the flex header gets crowded — `p-2` alone lets the box
    // compress horizontally and renders as an ellipse.
    return `w-9 h-9 shrink-0 flex items-center justify-center rounded-full hover:bg-gray-100 ${active ? "text-blue-700 bg-blue-50" : "text-gray-700"}`;
  }

  /* =================== Click-away =================== */

  @HostListener("document:mousedown", ["$event"]) onDocClick(e: MouseEvent): void {
    if (this.showMore() && this.moreRef?.nativeElement && !this.moreRef.nativeElement.contains(e.target as Node)) {
      this.showMore.set(false);
    }
    if (this.showHeaderMenu() && this.headerMenuRef?.nativeElement &&
        !this.headerMenuRef.nativeElement.contains(e.target as Node)) {
      this.showHeaderMenu.set(false);
      this.showNotifMenu.set(false);
    }
  }

  ngOnDestroy(): void {}
}
