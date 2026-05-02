import {
  ChangeDetectionStrategy, Component, EventEmitter, HostListener,
  Input, OnDestroy, Output, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { Conversation, CustomSection } from "../../models/types";
import { BreakpointService } from "../../services/breakpoint.service";
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
export class ConversationListItemComponent implements OnDestroy {
  bp = inject(BreakpointService);

  @Input({ required: true }) c!: Conversation;
  @Input() isActive = false;
  @Input() expanded = false;
  @Input() customSections: CustomSection[] = [];
  @Output() picked = new EventEmitter<string>();
  @Output() toggleSummary = new EventEmitter<string>();
  @Output() moveSection = new EventEmitter<{ id: string; section: string | null }>();
  /** Pop the conv out into a floating Gmail/GChat-style window. */
  @Output() openInPopup = new EventEmitter<string>();

  feedback = signal<"up" | "down" | null>(null);
  menuOpen = signal(false);
  private offClick: ((e: MouseEvent) => void) | null = null;

  get hasSummary(): boolean { return !!this.c.meetingSummary; }

  get rootClass(): string {
    const base = "group";
    const active = this.isActive ? "bg-blue-50/60" : "";
    const exp = this.expanded ? "bg-blue-50/40" : "";
    return `${base} ${active} ${exp}`;
  }

  get nameClass(): string {
    return this.c.unread
      ? "text-[14px] truncate font-semibold text-gray-900"
      : "text-[14px] truncate font-medium text-gray-900";
  }

  get snippetClass(): string {
    const base = "text-[13px] truncate mt-0.5";
    if (this.expanded) return `${base} italic text-gray-700`;
    if (this.c.unread) return `${base} text-gray-800 font-medium`;
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
