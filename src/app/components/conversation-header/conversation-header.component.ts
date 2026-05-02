import {
  ChangeDetectionStrategy, Component, ElementRef, EventEmitter, HostListener,
  Input, OnDestroy, Output, ViewChild, computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { Conversation } from "../../models/types";
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
})
export class ConversationHeaderComponent implements OnDestroy {
  state = inject(ChatStateService);

  @Input({ required: true }) conv!: Conversation;
  @Input() splitPane = true;
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
  @Output() hideConv = new EventEmitter<void>();
  @Output() archiveConv = new EventEmitter<void>();
  @Output() leaveSpace = new EventEmitter<void>();
  @Output() blockReport = new EventEmitter<void>();
  @Output() clearHistory = new EventEmitter<void>();
  @Output() newAIChat = new EventEmitter<void>();
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
    if (!this.showBoardInline())     m.push({ icon: "folder-open",    label: "Open board",       onClick: () => this.state.openBoard() });
    if (!this.showTasksInline())     m.push({ icon: "check-circle-2", label: "Tasks",            onClick: () => this.state.openTasks() });
    if (!this.showFollowingInline()) m.push({ iconCustom: "threads",  label: "Following",        onClick: () => this.state.openFollowing() });
    if (!this.showPinnedInline())    m.push({ icon: "pin",            label: "Pinned messages",  onClick: () => this.state.openPinned() });
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
      items.push({ icon: "more-horizontal", label: "Space settings",      onClick: () => alert(`${c.name} — settings`) });
      items.push({ divider: true });
      items.push({ icon: "external-link", label: "Leave space", danger: true, onClick: () => this.leaveSpace.emit() });
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
