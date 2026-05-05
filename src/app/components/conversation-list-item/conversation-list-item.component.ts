import {
  ChangeDetectionStrategy, Component, EventEmitter, HostListener,
  Input, OnChanges, OnDestroy, Output, SimpleChanges, computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { Conversation, CustomSection } from "../../models/types";
import { BreakpointService } from "../../services/breakpoint.service";
import { ChatStateService } from "../../services/chat-state.service";
import { IconComponent } from "../icon/icon.component";
import { AvatarComponent } from "../avatar/avatar.component";

/**
 * Single row in the conversation list (HomeList second pane).
 * Mirrors React `<ConversationListItem>` 1:1.
 *
 * Features:
 *  - Avatar with unread blue dot
 *  - Pin/Calendar/AI/Customer badges next to name
 *  - Action toolbar reveals on hover (or while expanded)
 *  - "Summarize with AI" button if `meetingSummary` exists; toggles inline summary
 *  - "More" menu with Mute / Pin / Mark read / Move-to-section / Hide
 */
@Component({
  selector: "app-conversation-list-item",
  standalone: true,
  imports: [CommonModule, IconComponent, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./conversation-list-item.component.html",
})
export class ConversationListItemComponent implements OnChanges, OnDestroy {
  bp = inject(BreakpointService);
  readonly state = inject(ChatStateService);

  @Input({ required: true }) c!: Conversation;
  @Input() isActive = false;
  @Input() expanded = false;
  @Input() customSections: CustomSection[] = [];
  @Output() picked = new EventEmitter<string>();
  @Output() toggleSummary = new EventEmitter<string>();
  @Output() moveSection = new EventEmitter<{ id: string; section: string | null }>();
  /** Pop the conv out into a floating Gmail/GChat-style window. */
  @Output() openInPopup = new EventEmitter<string>();

  /** True while the AI-summary RPC is in flight for this conv. The
   *  expanded card renders a "Summarizing…" spinner when this is true
   *  and there's nothing cached yet. */
  aiSummaryLoading = computed<boolean>(() => {
    const entry = this.state.aiSummaryByConv()[this.c?.id];
    return !!entry?.loading;
  });

  /** Parsed bullets from the cached AI summary — feeds the expanded
   *  card's <ul>. Falls back to the mock `c.meetingSummary` when the
   *  LLM hasn't returned anything (offline/demo mode). */
  aiSummaryBullets = computed<string[]>(() => {
    const entry = this.state.aiSummaryByConv()[this.c?.id];
    if (entry && entry.summary && !entry.loading) {
      return entry.summary
        .split(/\n+/)
        .map((l) => l.trim().replace(/^[-*]\s+/, ""))
        .filter((l) => l.length > 0);
    }
    return this.c.meetingSummary ?? [];
  });

  /** Show the sparkles button when the AI is reachable (live mode) OR
   *  when there's mock summary data on the conv. Hides on convs that
   *  have neither — e.g. an offline-mode conv with no mock recap. */
  get canSummarize(): boolean {
    if (this.state.live()) return true;
    return !!this.c.meetingSummary;
  }

  ngOnChanges(_changes: SimpleChanges): void {
    // No auto-load — summaries are on-demand via the sparkles button
    // (see onToggleSummary). This avoids firing 50 LLM calls when the
    // sidebar mounts.
  }

  /** Click handler for the sparkles button. Toggles the row's expanded
   *  state via the parent (so other rows can collapse) AND, when
   *  expanding in live mode, kicks off the AI-summary load if it
   *  isn't cached. The cached entry's loading flag drives the
   *  spinner in the expanded card. */
  onToggleSummary(ev: MouseEvent): void {
    ev.stopPropagation();
    this.toggleSummary.emit(this.c.id);
    // If we're expanding (i.e. it was collapsed before this click),
    // and live mode is on, load the summary unless already cached.
    if (!this.expanded && this.state.live()) {
      const cached = this.state.aiSummaryByConv()[this.c.id];
      if (!cached || (!cached.summary && !cached.loading)) {
        void this.state.loadAISummaryLive(this.c.id);
      }
    }
  }

  feedback = signal<"up" | "down" | null>(null);
  menuOpen = signal(false);
  private offClick: ((e: MouseEvent) => void) | null = null;

  get hasSummary(): boolean { return !!this.c.meetingSummary; }

  /** Live unread count for this row, pulled from cached ChannelInfo
   *  (populated by setActiveConv → loadChannelInfo and refreshed via FCM
   *  phase.changed). Falls back to the legacy boolean `c.unread` for
   *  mock-data conversations.
   *
   *  Returns:
   *    - 0 / undefined → no badge, regular weight
   *    - 1+ → bold name + numeric badge in the row
   *    - mock unread true with no count → just bold + dot (legacy look) */
  get unreadCount(): number {
    const info = this.state.channelInfoByConv()[this.c.id];
    return info?.my_member?.unread_count ?? 0;
  }

  get hasUnread(): boolean {
    return this.unreadCount > 0 || !!this.c.unread;
  }

  get unreadMentionCount(): number {
    const info = this.state.channelInfoByConv()[this.c.id];
    return info?.my_member?.unread_mention_count ?? 0;
  }

  get rootClass(): string {
    const base = "group";
    const active = this.isActive ? "bg-blue-50/60" : "";
    const exp = this.expanded ? "bg-blue-50/40" : "";
    return `${base} ${active} ${exp}`;
  }

  get nameClass(): string {
    return this.hasUnread
      ? "text-[14px] truncate font-semibold text-gray-900"
      : "text-[14px] truncate font-medium text-gray-900";
  }

  get snippetClass(): string {
    const base = "text-[13px] truncate mt-0.5";
    if (this.expanded) return `${base} italic text-gray-700`;
    if (this.hasUnread) return `${base} text-gray-800 font-medium`;
    return `${base} text-gray-600`;
  }

  get summaryBtnClass(): string {
    const base = "h-7 w-7 rounded-full flex items-center justify-center transition";
    if (this.expanded) return `${base} bg-white shadow-sm text-gray-700 hover:bg-gray-50`;
    return `${base} bg-white shadow-sm text-purple-700 hover:bg-purple-50 ring-1 ring-gray-200`;
  }

  setFeedback(v: "up" | "down"): void {
    this.feedback.set(this.feedback() === v ? null : v);
  }

  toggleMenu(): void {
    const next = !this.menuOpen();
    this.menuOpen.set(next);
    // Outside-click handler
    if (next) {
      setTimeout(() => {
        this.offClick = (e: MouseEvent) => this.menuOpen.set(false);
        document.addEventListener("click", this.offClick);
      }, 0);
    } else if (this.offClick) {
      document.removeEventListener("click", this.offClick);
      this.offClick = null;
    }
  }

  moveToSection(secId: string | null): void {
    this.moveSection.emit({ id: this.c.id, section: secId });
    this.menuOpen.set(false);
  }

  /** Pop the chat out into a floating window. Stops propagation so the
   *  click doesn't also bubble up to the row's row-level click handler
   *  (which would activate the conv in the main pane). */
  onOpenInPopup(e: Event): void {
    e.stopPropagation();
    this.openInPopup.emit(this.c.id);
    this.menuOpen.set(false);
  }

  isInCustomSection(): boolean {
    return this.customSections?.some((s) => s.id === this.c.section) ?? false;
  }

  ngOnDestroy(): void {
    if (this.offClick) document.removeEventListener("click", this.offClick);
  }
}
