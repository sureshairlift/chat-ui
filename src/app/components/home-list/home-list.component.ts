import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, EventEmitter,
  HostBinding, Input, OnDestroy, Output, ViewChild, ViewChildren, QueryList,
  computed, effect, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { Conversation, CustomSection } from "../../models/types";
import { SECTION_TITLES } from "../../data/section-titles";
import { IconComponent } from "../icon/icon.component";
import { ConversationListItemComponent } from "../conversation-list-item/conversation-list-item.component";
import { ResizeHandleComponent } from "../resize-handle/resize-handle.component";
import { NotoEmojiPipe, notoWebpFallback } from "../../services/noto-emoji.pipe";
import { AiSpinnerComponent } from "../ai-spinner/ai-spinner.component";

/**
 * HomeList — second pane (between sidebar and message panel).
 *
 * Behaviour mirrors React `<HomeList>`:
 *  - `section === "ai"`     → AI sessions list with "New chat" hero button
 *  - `section === "customers"` → banner + filter pills (All/Direct/Groups) + customer rows
 *  - everything else        → standard list filtered by section + unread toggle
 *
 *  Pinned conversations float to the top of any section.
 *  Hidden / archived / blocked are filtered out globally.
 *
 *  Also renders the right-edge resize handle and supports a fullWidth mode for
 *  mobile (used by Turn 7 layout shell).
 */
@Component({
  selector: "app-home-list",
  standalone: true,
  imports: [CommonModule, IconComponent, ConversationListItemComponent, ResizeHandleComponent, NotoEmojiPipe, AiSpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./home-list.component.html",
  styleUrl: "./home-list.component.css",
})
export class HomeListComponent implements AfterViewInit, OnDestroy {
  state = inject(ChatStateService);

  @Input() width = 420;
  @Input() fullWidth = false;
  @Output() picked = new EventEmitter<string>();
  @Output() startResize = new EventEmitter<MouseEvent>();
  @Output() openDrawer = new EventEmitter<void>();
  /** Bubbles up the convId when a row's "Open in popup" menu item is clicked. */
  @Output() popOut = new EventEmitter<string>();

  /** Tracks the in-flight createChannel RPC so the user can't
   *  double-click the New AI chat button and end up with two empty
   *  channels. */
  creatingAIChat = signal(false);

  async onStartNewAIChat(): Promise<void> {
    if (this.creatingAIChat()) return;
    if (!this.state.live()) {
      // Mock mode: pick the seed "ai-new" if present, else no-op.
      const seed = this.aiNew();
      if (seed) this.picked.emit(seed.id);
      return;
    }
    this.creatingAIChat.set(true);
    try {
      const id = await this.state.startNewAIChatLive();
      if (id) this.picked.emit(id);
    } finally {
      this.creatingAIChat.set(false);
    }
  }

  expandedSummaries = signal<Set<string>>(new Set());
  customerFilter = signal<"all" | "direct" | "groups">("all");

  /** Sentinel divs at the bottom of each list. The IntersectionObserver
   *  watches every match — only one renders at a time depending on
   *  selectedSection, so this is fine. Triggers loadMoreConvsLive
   *  when the active sentinel scrolls into view. */
  @ViewChildren("loadMoreSentinel") loadMoreSentinels!: QueryList<ElementRef<HTMLElement>>;
  private observer?: IntersectionObserver;

  /** Filtered + pin-sorted base list */
  private baseConvs = computed<Conversation[]>(() => {
    const list = this.state.conversations();
    return list
      .filter((c: any) => !c.hidden && !c.archived && !c.blocked)
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  });

  /** Header emoji + label split so the template can render the emoji
   *  as a Noto image (PNG at rest, WebP on hover) instead of plain
   *  text. titleLabel is what the <h1> shows; titleEmoji is null when
   *  the current section is a built-in (no custom emoji). */
  titleEmoji = computed<string | null>(() => {
    const sec = this.state.selectedSection();
    const custom = this.state.customSections().find((s) => s.id === sec);
    return custom?.emoji || null;
  });
  titleLabel = computed<string>(() => {
    const sec = this.state.selectedSection();
    const custom = this.state.customSections().find((s) => s.id === sec);
    if (custom) return custom.label;
    return SECTION_TITLES[sec] || "Home";
  });
  /** Kept for any external callers (mobile drawer, breadcrumbs) that
   *  still want a single plain-text string. */
  title = computed<string>(() => {
    const e = this.titleEmoji();
    const l = this.titleLabel();
    return e ? `${e}  ${l}` : l;
  });

  notoWebpFallback = notoWebpFallback;

  showFilters = computed<boolean>(() => {
    const sec = this.state.selectedSection();
    return sec !== "ai" && sec !== "pinned" && sec !== "unread";
  });

  /* ----- AI section computeds ----- */
  aiNew = computed(() => this.baseConvs().find((c) => c.id === "ai-new") || null);
  aiSessions = computed(() =>
    this.baseConvs().filter((c) => c.section === "ai" && !c.isNewChat)
  );

  /* ----- Customer section computeds ----- */
  customerCounts = computed(() => {
    const all = this.baseConvs().filter((c) => c.section === "customers");
    const filtered = this.state.unreadOnly() ? all.filter((c) => c.unread) : all;
    return {
      total: filtered.length,
      direct: filtered.filter((c) => c.type === "external").length,
      groups: filtered.filter((c) => c.type === "external-group").length,
    };
  });
  customerVisible = computed(() => {
    const all = this.baseConvs().filter((c) => c.section === "customers");
    const filtered = this.state.unreadOnly() ? all.filter((c) => c.unread) : all;
    const f = this.customerFilter();
    if (f === "direct") return filtered.filter((c) => c.type === "external");
    if (f === "groups") return filtered.filter((c) => c.type === "external-group");
    return filtered;
  });

  /* ----- Default section computeds ----- */
  defaultVisible = computed(() => {
    const sec = this.state.selectedSection();
    const convs = this.baseConvs();
    const builtIn = new Set(["direct", "spaces", "ai", "customers"]);

    let items: Conversation[];
    if (sec === "pinned") {
      items = convs.filter((c) => c.pinned && !c.isNewChat);
    } else if (sec === "unread") {
      items = convs.filter((c) => c.unread && !c.isNewChat);
    } else if (sec === "all") {
      if (this.state.unreadOnly()) {
        items = convs.filter((c) => c.unread && !c.isNewChat);
      } else {
        items = convs.filter(
          (c) => builtIn.has(c.section) && c.section !== "ai" && c.section !== "customers"
        );
      }
    } else {
      items = convs.filter((c) => c.section === sec);
    }
    return this.state.unreadOnly() && sec !== "unread" && sec !== "all"
      ? items.filter((c) => c.unread)
      : items;
  });

  emptyMsg = computed(() => {
    const sec = this.state.selectedSection();
    if (sec === "pinned") return "No pinned chats yet. Pin one from the more menu (⋯) to keep it accessible here.";
    if (sec === "unread") return "All caught up! No unread conversations.";
    return "No conversations in this section yet.";
  });

  /** Icon to show next to the empty-state message — matches the section's
   *  vibe so the centered illustration tells the user immediately why
   *  nothing's there. */
  emptyIcon = computed(() => {
    const sec = this.state.selectedSection();
    if (sec === "pinned") return "pin";
    if (sec === "unread") return "check-circle";
    return "message-square";
  });

  get rootClass(): string {
    // h-full so the inner panel fills the host's full viewport height —
    // this is what lets `flex-1 overflow-y-auto` on the body scroll properly
    // instead of growing past the viewport. w-full on mobile so the panel
    // fills the host's flex-1 width; on desktop the inline pixel width
    // (set via [style.width.px]) takes over.
    const w = this.fullWidth ? "w-full" : "";
    return `group/panel h-full ${w} flex flex-col border-r border-gray-200 bg-white relative`;
  }

  /** Width sizing lives on the HOST element so HomeList itself behaves
   *  correctly as a flex item of the page-level container:
   *  - mobile (fullWidth): take remaining space, allow shrinking via min-w-0
   *  - desktop:            stay at the resizable explicit width (shrink-0) */
  @HostBinding("class") get hostClass(): string {
    const w = this.fullWidth ? "flex-1 min-w-0" : "shrink-0";
    return `block h-full ${w}`;
  }

  aiNewBtnClass(): string {
    const active = this.state.activeConv() === "ai-new";
    const base = "w-full flex items-center gap-3 mx-3 mt-3 px-3 py-2.5 rounded-2xl text-left transition";
    if (active) {
      return `${base} bg-gradient-to-r from-blue-100 via-purple-100 to-pink-100 text-purple-900`;
    }
    return `${base} bg-gradient-to-r from-blue-50 via-purple-50 to-pink-50 hover:from-blue-100 hover:via-purple-100 hover:to-pink-100 text-purple-800`;
  }

  filterPillClass(v: string): string {
    const active = this.customerFilter() === v;
    const base = "text-[12px] px-3 py-1 rounded-full border transition flex items-center gap-1.5";
    return active
      ? `${base} bg-amber-100 border-amber-300 text-amber-900 font-medium`
      : `${base} bg-white border-gray-200 text-gray-700 hover:bg-gray-50`;
  }

  toggleSummary(id: string): void {
    this.expandedSummaries.update((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  onMove(e: { id: string; section: string | null }): void {
    if (e.section === null) {
      // Remove from custom section — move back to "direct"
      this.state.moveConvSection(e.id, "direct");
    } else {
      this.state.moveConvSection(e.id, e.section);
    }
  }

  ngAfterViewInit(): void {
    if (typeof IntersectionObserver === "undefined") return;
    // Threshold 0 + scroll-root rootMargin: trigger as soon as the
    // sentinel hits the bottom edge of any scrollable ancestor. We
    // re-observe whenever the *ngSwitch flips and the sentinel id
    // changes (handled by the QueryList changes subscription below).
    this.observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        // Live mode: paginate. Mock-data lists ignore — local lists
        // don't have a "next page" semantic.
        if (this.state.live() && this.state.hasMoreConvs() && !this.state.loadingMoreConvs()) {
          void this.state.loadMoreConvsLive();
        }
      }
    });
    const observe = () => {
      this.observer?.disconnect();
      this.loadMoreSentinels.forEach((el) => this.observer?.observe(el.nativeElement));
    };
    observe();
    this.loadMoreSentinels.changes.subscribe(observe);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
