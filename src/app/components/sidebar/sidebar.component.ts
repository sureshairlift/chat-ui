import {
  ChangeDetectionStrategy, Component, ElementRef, QueryList,
  ViewChildren, computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ChatStateService } from "../../services/chat-state.service";
import { BreakpointService } from "../../services/breakpoint.service";
import { CustomSection } from "../../models/types";
import { IconComponent } from "../icon/icon.component";
import { SidebarItemComponent } from "../sidebar-item/sidebar-item.component";
import { SectionHeaderComponent } from "../section-header/section-header.component";

/** A row in the sidebar's reorderable section list. Built-ins and custom
 *  sections are normalized into this shape so the template renders a single
 *  *ngFor and rearrange logic doesn't need to special-case anything. */
export interface SectionRow {
  id: string;
  kind: "customers" | "ai" | "direct" | "test" | "spaces" | "custom";
  label: string;
  count: number;
  /** Only set when kind === "custom" — used by the template for the color chip. */
  custom?: CustomSection;
}

/**
 * Full Sidebar — 260px wide. Search box + New chat button + shortcuts group +
 * collapsible sections + custom section creator. Mirrors React `<Sidebar>` 1:1.
 */
@Component({
  selector: "app-sidebar",
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, SidebarItemComponent, SectionHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block shrink-0 h-full" },
  templateUrl: "./sidebar.component.html",
})
export class SidebarComponent {
  state = inject(ChatStateService);
  bp    = inject(BreakpointService);

  shortcutsOpen = signal(true);
  addingSection = signal(false);
  newSectionName = signal("");

  /** Index of the row currently being dragged. Null when no drag is in
   *  flight. Used to apply a "dragging" visual style and to resolve the
   *  drop index on pointerup. */
  dragIndex = signal<number | null>(null);
  /** Index of the row currently hovered during a drag — receives the drop
   *  indicator and is the destination on release. */
  dragOverIndex = signal<number | null>(null);

  /** Live element refs for every section row, used to map a pointer's Y
   *  position back to a row index during a drag. The query stays in sync
   *  via signals — Angular updates the QueryList as rows mount/unmount. */
  @ViewChildren("sectionRowEl") sectionRowEls?: QueryList<ElementRef<HTMLElement>>;

  private pointerMoveHandler?: (e: PointerEvent) => void;
  private pointerUpHandler?: (e: PointerEvent) => void;

  /** State for the threshold-gated drag. We record pointerdown position
   *  and the row index, then wait until movement crosses the threshold
   *  before classifying the gesture as a drag (vs. a tap-to-navigate). */
  private dragStartPos: { x: number; y: number } | null = null;
  private dragStartRowIndex = -1;
  /** Pixels of movement before a press becomes a drag. Tuned a bit higher
   *  for touch since fingers are imprecise and a stationary tap often
   *  jitters by 2-3px. */
  private static readonly DRAG_THRESHOLD_MOUSE = 6;
  private static readonly DRAG_THRESHOLD_TOUCH = 10;

  /** Floating "ghost" element shown under the cursor during a drag — a
   *  cloned copy of the row that tracks the pointer. Created when drag
   *  activates, removed on pointerup. The original row stays in the list
   *  at 40% opacity as a visual placeholder. */
  private dragGhostEl: HTMLElement | null = null;
  /** Cursor offset from the row's top-left at drag start, so the ghost
   *  doesn't jump to be cursor-centered — it stays anchored to wherever
   *  the user originally pressed. */
  private dragGrabOffset = { x: 0, y: 0 };

  /** Unified, ordered list of section rows for the *ngFor in the template.
   *  Walks `state.sectionOrder()` and resolves each id to a SectionRow.
   *  Unknown ids (e.g., a custom section that's been renamed but the order
   *  array still references the old id) are skipped silently. */
  orderedSections = computed<SectionRow[]>(() => {
    const order   = this.state.sectionOrder();
    const customs = this.state.customSections();
    const c       = this.counts();
    const rows: SectionRow[] = [];
    for (const id of order) {
      switch (id) {
        case "customers":
          rows.push({ id, kind: "customers", label: "Customer Conversations", count: c.customers });
          break;
        case "ai":
          rows.push({ id, kind: "ai", label: "Airlift Intelligence", count: c.ai });
          break;
        case "direct":
          rows.push({ id, kind: "direct", label: "Direct messages", count: c.direct });
          break;
        case "test":
          rows.push({ id, kind: "test", label: "Test Section", count: c.test });
          break;
        case "spaces":
          rows.push({ id, kind: "spaces", label: "Spaces", count: c.spaces });
          break;
        default: {
          const cs = customs.find((s) => s.id === id);
          if (cs) rows.push({
            id, kind: "custom", label: cs.label,
            count: this.customSectionCount(id), custom: cs,
          });
        }
      }
    }
    // Append any custom sections missing from the persisted order — happens
    // after the user creates a new section in this session and the saved
    // order pre-dates it.
    for (const cs of customs) {
      if (!order.includes(cs.id)) {
        rows.push({
          id: cs.id, kind: "custom", label: cs.label,
          count: this.customSectionCount(cs.id), custom: cs,
        });
      }
    }
    return rows;
  });

  /* ============== Drag-and-drop (Pointer Events) ==============
   *
   * Why Pointer Events:
   * - HTML5 dnd doesn't fire reliably on touch devices.
   * - Pointer Events normalize mouse + touch + pen with one set of handlers.
   *
   * Whole-row drag with a movement threshold:
   * - pointerdown records start position but doesn't activate drag yet.
   * - pointermove activates drag only after the pointer has travelled past
   *   the threshold (6px for mouse, 10px for touch). Below the threshold,
   *   the gesture is still a tap and click-to-navigate fires normally.
   * - When drag activates, we install a one-shot capture-phase click
   *   listener that swallows the synthesized click after pointerup —
   *   otherwise releasing the drag would also fire the row's click and
   *   navigate to the (now reordered) section. */

  onRowPointerDown(i: number, e: PointerEvent): void {
    // Only react to primary mouse button. Touch reports button 0 always.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Ignore presses on interactive children where this would steal a
    // legitimate click (e.g., the grip svg itself is fine, but if the
    // row ever sprouts a toolbar button we want it to keep working).
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea")) return;

    this.dragStartPos = { x: e.clientX, y: e.clientY };
    this.dragStartRowIndex = i;

    const pointerType = e.pointerType || "mouse";
    const move = (ev: PointerEvent) => this.handlePointerMove(ev, pointerType);
    const up   = (ev: PointerEvent) => this.handlePointerUp(ev);
    this.pointerMoveHandler = move;
    this.pointerUpHandler   = up;
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup",     up);
    document.addEventListener("pointercancel", up);
  }

  private handlePointerMove(e: PointerEvent, pointerType: string): void {
    if (!this.dragStartPos) return;
    const dx = e.clientX - this.dragStartPos.x;
    const dy = e.clientY - this.dragStartPos.y;

    // Promote tap → drag once movement exceeds the threshold.
    if (this.dragIndex() === null) {
      const threshold = pointerType === "mouse"
        ? SidebarComponent.DRAG_THRESHOLD_MOUSE
        : SidebarComponent.DRAG_THRESHOLD_TOUCH;
      if (Math.hypot(dx, dy) < threshold) return;
      this.dragIndex.set(this.dragStartRowIndex);
      this.dragOverIndex.set(this.dragStartRowIndex);
      this.spawnDragGhost(this.dragStartRowIndex);
      // Lock body cursor + disable text selection while a drag is active
      // so the user gets clear visual feedback even if their pointer
      // strays off the row mid-gesture.
      document.body.classList.add("is-dragging-section");
    }

    // Drag active — prevent default so touch scrolling doesn't fight us,
    // update the floating ghost to follow the cursor, then hit-test
    // against the live row rects to find the drop target.
    e.preventDefault();
    if (this.dragGhostEl) {
      this.dragGhostEl.style.left = `${e.clientX - this.dragGrabOffset.x}px`;
      this.dragGhostEl.style.top  = `${e.clientY - this.dragGrabOffset.y}px`;
    }
    const rows = this.sectionRowEls?.toArray() ?? [];
    let bestIdx = this.dragOverIndex() ?? this.dragStartRowIndex;
    let bestDist = Infinity;
    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx].nativeElement.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      const dist = Math.abs(e.clientY - mid);
      if (dist < bestDist) { bestDist = dist; bestIdx = idx; }
    }
    if (this.dragOverIndex() !== bestIdx) this.dragOverIndex.set(bestIdx);
  }

  /** Clone the source row into a fixed-position floating element appended
   *  to <body>. The clone tracks the cursor on every pointermove so the
   *  user sees their selection lift off and follow their finger / mouse,
   *  matching the Trello / Slack / Notion dnd feel. */
  private spawnDragGhost(rowIndex: number): void {
    const rowEl = this.sectionRowEls?.toArray()[rowIndex]?.nativeElement;
    if (!rowEl || !this.dragStartPos) return;
    const rect = rowEl.getBoundingClientRect();

    // Anchor offset = where inside the row the user originally pressed.
    this.dragGrabOffset = {
      x: this.dragStartPos.x - rect.left,
      y: this.dragStartPos.y - rect.top,
    };

    const ghost = rowEl.cloneNode(true) as HTMLElement;
    // Strip Angular state classes that would carry over from the source —
    // the ghost should never look "drop-target" or "dragging" itself.
    ghost.classList.remove("opacity-40");
    ghost.querySelectorAll("[ring-blue-400], [ring-2]").forEach((el) =>
      el.classList.remove("ring-2", "ring-blue-400", "ring-offset-1"),
    );
    Object.assign(ghost.style, {
      position: "fixed",
      left: `${rect.left}px`,
      top:  `${rect.top}px`,
      width: `${rect.width}px`,
      pointerEvents: "none",
      zIndex: "9999",
      opacity: "0.95",
      transform: "rotate(1deg)",
      boxShadow: "0 12px 32px rgba(15, 23, 42, 0.22)",
      borderRadius: "8px",
      background: "white",
      transition: "transform 80ms ease-out",
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(ghost);
    this.dragGhostEl = ghost;
  }

  private removeDragGhost(): void {
    if (this.dragGhostEl) {
      this.dragGhostEl.remove();
      this.dragGhostEl = null;
    }
  }

  private handlePointerUp(_e: PointerEvent): void {
    const from = this.dragIndex();
    const to   = this.dragOverIndex();
    if (from !== null && to !== null && from !== to) {
      this.state.moveSection(from, to);
    }

    if (from !== null) {
      // A drag actually activated → swallow the synthesized click that
      // follows pointerup, otherwise the row's button would fire and the
      // user would be navigated to the reordered section. Capture phase
      // + stopImmediatePropagation beats Angular's bubbling listener.
      // 200ms safety net in case no click ever comes (e.g. drop on empty
      // space) — leaving the listener attached would swallow the next
      // legit click anywhere in the page.
      const swallow = (ev: MouseEvent) => {
        ev.stopImmediatePropagation();
        ev.preventDefault();
        document.removeEventListener("click", swallow, true);
      };
      document.addEventListener("click", swallow, true);
      setTimeout(() => document.removeEventListener("click", swallow, true), 200);
    }

    this.dragIndex.set(null);
    this.dragOverIndex.set(null);
    this.dragStartPos = null;
    this.dragStartRowIndex = -1;
    this.removeDragGhost();
    document.body.classList.remove("is-dragging-section");
    if (this.pointerMoveHandler) {
      document.removeEventListener("pointermove", this.pointerMoveHandler);
      this.pointerMoveHandler = undefined;
    }
    if (this.pointerUpHandler) {
      document.removeEventListener("pointerup",     this.pointerUpHandler);
      document.removeEventListener("pointercancel", this.pointerUpHandler);
      this.pointerUpHandler = undefined;
    }
  }

  /** Stable identity for the section *ngFor — avoids re-creating row DOM
   *  on every reorder, which would otherwise reset focus / cancel an
   *  in-flight drag. */
  trackBySection = (_: number, row: SectionRow) => row.id;

  /** Visual class for a row during drag — highlights the drop target and
   *  fades the row currently being dragged so the user can see what's
   *  moving. */
  rowDragClass(i: number): string {
    if (this.dragIndex() === i) return "opacity-40";
    if (this.dragOverIndex() === i && this.dragIndex() !== null) {
      return "ring-2 ring-blue-400 ring-offset-1";
    }
    return "";
  }

  counts = computed(() => {
    const convs = this.state.conversations();
    return {
      direct:    convs.filter((c) => c.section === "direct").length,
      test:      convs.filter((c) => c.section === "test").length,
      spaces:    convs.filter((c) => c.section === "spaces").length,
      ai:        convs.filter((c) => c.section === "ai" && !c.isNewChat).length,
      customers: convs.filter((c) => c.section === "customers").length,
    };
  });
  unreadCount = computed(() => this.state.conversations().filter((c) => c.unread).length);
  pinnedCount = computed(() => this.state.conversations().filter((c) => c.pinned).length);

  get asideClass(): string {
    const w = (this.state.sidebarFullScreen() || this.bp.isMobile()) ? "w-full" : "w-[260px]";
    // h-full so the inner aside stretches across the host's full height —
    // this is what lets `flex-1` on the scrollable body push the footer
    // (Collapse button) to the bottom.
    return `${w} h-full shrink-0 flex flex-col bg-white border-r border-gray-200`;
  }

  customersBtnClass(): string {
    const active = this.state.selectedSection() === "customers";
    return "group flex w-full items-center gap-3 px-3 py-2 rounded-r-full text-[14px] mt-2 transition " +
      (active ? "bg-amber-100 text-amber-900 font-medium" : "text-gray-800 hover:bg-gray-100");
  }
  customersBadgeClass(): string {
    const active = this.state.selectedSection() === "customers";
    return "text-[11px] px-1.5 rounded-full " +
      (active ? "bg-amber-200 text-amber-900" : "bg-gray-200 text-gray-700");
  }

  aiBtnClass(): string {
    const active = this.state.selectedSection() === "ai";
    return "group flex w-full items-center gap-3 px-3 py-2 rounded-r-full text-[14px] mt-2 transition " +
      (active
        ? "bg-gradient-to-r from-blue-100 via-purple-100 to-pink-100 text-purple-900 font-medium"
        : "text-gray-800 hover:bg-gray-100");
  }
  aiBadgeClass(): string {
    const active = this.state.selectedSection() === "ai";
    return "text-[11px] px-1.5 rounded-full " +
      (active ? "bg-purple-200 text-purple-900" : "bg-gray-200 text-gray-700");
  }

  customSectionCount(id: string): number {
    return this.state.conversations().filter((c) => c.section === id).length;
  }

  confirmAddSection(): void {
    const name = this.newSectionName().trim();
    if (!name) return;
    this.state.addCustomSection(name);
    this.newSectionName.set("");
    this.addingSection.set(false);
  }
  cancelAddSection(): void {
    this.newSectionName.set("");
    this.addingSection.set(false);
  }
}
