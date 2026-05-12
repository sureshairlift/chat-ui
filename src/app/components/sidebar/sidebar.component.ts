import {
  ChangeDetectionStrategy, Component, ElementRef, QueryList,
  ViewChildren, computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ChatStateService } from "../../services/chat-state.service";
import { BreakpointService } from "../../services/breakpoint.service";
import { ConfirmService } from "../../services/confirm.service";
import { ToastService } from "../../services/toast.service";
import { SectionDragService } from "../../services/section-drag.service";
import { sectionAllowedForType } from "../../services/section-rules";
import { CustomSection } from "../../models/types";
import { IconComponent } from "../icon/icon.component";
import { SidebarItemComponent } from "../sidebar-item/sidebar-item.component";
import { SectionHeaderComponent } from "../section-header/section-header.component";
import { NotoEmojiPipe, notoWebpFallback } from "../../services/noto-emoji.pipe";

/** A row in the sidebar's reorderable section list. Built-ins and custom
 *  sections are normalized into this shape so the template renders a single
 *  *ngFor and rearrange logic doesn't need to special-case anything. */
export interface SectionRow {
  id: string;
  kind: "customers" | "ai" | "direct" | "spaces" | "custom";
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
  imports: [CommonModule, FormsModule, IconComponent, SidebarItemComponent, SectionHeaderComponent, NotoEmojiPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block shrink-0 h-full" },
  templateUrl: "./sidebar.component.html",
  styleUrl: "./sidebar.component.css",
})
export class SidebarComponent {
  state = inject(ChatStateService);
  bp    = inject(BreakpointService);
  private confirm = inject(ConfirmService);
  private toast   = inject(ToastService);
  readonly dragSvc = inject(SectionDragService);

  /** Template-bound: swap a 404'd WebP to its PNG sibling so the user
   *  sees the static sticker instead of a broken image icon. Noto
   *  only ships animated WebPs for a subset of emojis; everything
   *  else falls through to PNG. */
  notoWebpFallback = notoWebpFallback;

  shortcutsOpen = signal(true);
  addingSection = signal(false);
  newSectionName = signal("");
  /** Emoji selected for the new section being created. Empty string =
   *  fall back to the colored # chip. */
  newSectionEmoji = signal<string>("");

  /** Id of the custom section currently in edit mode (rename + change
   *  emoji). Null when no row is being edited. The edit popover renders
   *  inline below the row. */
  editingSectionId = signal<string | null>(null);
  editingLabel = signal<string>("");
  editingEmoji = signal<string>("");

  /** Curated set of Noto Color Emoji codepoints that read well as
   *  section icons AND are present in Google's *animated* emoji
   *  catalog (≈470 emojis total) — so the hover swap to the WebP
   *  always plays back instead of 404'ing to the PNG fallback.
   *
   *  Each entry carries searchable keywords (`k`) so the picker's
   *  search box can match by name. To verify a new candidate is in
   *  the animated set: https://googlefonts.github.io/noto-emoji-animation/
   */
  readonly SECTION_EMOJIS: ReadonlyArray<{ c: string; k: string }> = [
    // Pins / targets
    { c: "📌", k: "pin pushpin" },
    { c: "📍", k: "pin location map" },
    { c: "🎯", k: "target bullseye goal dart" },
    // State / signals (office-appropriate — no heart emojis)
    { c: "⭐", k: "star" },
    { c: "🌟", k: "star glowing shiny" },
    { c: "✨", k: "sparkles magic shine" },
    { c: "💫", k: "dizzy star spin" },
    { c: "⚡", k: "lightning bolt zap power energy" },
    { c: "🔥", k: "fire hot trending lit flame" },
    { c: "💥", k: "explosion boom impact collision" },
    { c: "💯", k: "hundred 100 perfect score" },
    { c: "💎", k: "gem diamond crystal jewel" },
    // Awards
    { c: "🏆", k: "trophy winner award" },
    { c: "🥇", k: "medal gold first place" },
    // Communication
    { c: "💬", k: "speech bubble chat message comment" },
    { c: "💭", k: "thought bubble idea" },
    { c: "📣", k: "megaphone announce loud" },
    { c: "🔔", k: "bell notification alert" },
    { c: "🎤", k: "microphone mic speak sing" },
    // Celebrations / fun
    { c: "🎉", k: "party popper celebrate" },
    { c: "🎊", k: "confetti party celebrate" },
    { c: "🎁", k: "gift present box" },
    { c: "🎂", k: "birthday cake celebration" },
    { c: "🎈", k: "balloon party" },
    { c: "🎆", k: "fireworks celebrate sparkler" },
    { c: "🎮", k: "game controller play gaming" },
    { c: "🎬", k: "movie clapper film cinema" },
    { c: "🎲", k: "dice game" },
    { c: "🪄", k: "magic wand spell wizard" },
    { c: "🔮", k: "crystal ball magic future fortune" },
    { c: "🪩", k: "mirror ball disco party" },
    { c: "🪅", k: "pinata party celebrate" },
    { c: "🪔", k: "diya lamp light diwali" },
    { c: "🎃", k: "pumpkin halloween jack" },
    // Travel
    { c: "🚀", k: "rocket launch space fast" },
    { c: "✈️", k: "airplane flight travel" },
    { c: "🚗", k: "car automobile" },
    { c: "🌍", k: "globe earth world" },
    { c: "🗺️", k: "map travel" },
    { c: "🧭", k: "compass navigate direction" },
    // Nature / weather
    { c: "🌱", k: "seedling plant growth grow" },
    { c: "🌿", k: "herb plant leaf" },
    { c: "🍀", k: "four leaf clover luck irish" },
    { c: "🌳", k: "tree green nature" },
    { c: "🌷", k: "tulip flower" },
    { c: "🌹", k: "rose flower love" },
    { c: "🌻", k: "sunflower flower" },
    { c: "🌸", k: "cherry blossom flower sakura" },
    { c: "🌈", k: "rainbow pride colorful" },
    { c: "☀️", k: "sun sunny weather" },
    { c: "🌙", k: "moon crescent night" },
    { c: "🪐", k: "planet saturn space ringed" },
    { c: "🌊", k: "wave water ocean sea" },
    { c: "❄️", k: "snowflake cold winter" },
    { c: "🌪️", k: "tornado wind storm" },
    { c: "💧", k: "droplet water" },
    // Animals
    { c: "🐶", k: "dog puppy pet" },
    { c: "🐱", k: "cat kitten pet" },
    { c: "🐭", k: "mouse" },
    { c: "🐰", k: "rabbit bunny" },
    { c: "🦊", k: "fox" },
    { c: "🐻", k: "bear" },
    { c: "🐼", k: "panda" },
    { c: "🦁", k: "lion" },
    { c: "🐯", k: "tiger" },
    { c: "🐸", k: "frog" },
    { c: "🐵", k: "monkey" },
    { c: "🐔", k: "chicken hen bird" },
    { c: "🦄", k: "unicorn magic" },
    { c: "🐉", k: "dragon mythical" },
    // Food / drink
    { c: "☕", k: "coffee hot drink cafe" },
    { c: "🍵", k: "tea green hot drink" },
    { c: "🍷", k: "wine glass red" },
    { c: "🍺", k: "beer mug" },
    { c: "🍕", k: "pizza food" },
    { c: "🍔", k: "burger hamburger food" },
    { c: "🍜", k: "ramen noodles bowl food" },
    { c: "🍣", k: "sushi food japanese" },
    { c: "🍩", k: "donut sweet" },
    { c: "🍰", k: "cake slice dessert sweet" },
    { c: "🍪", k: "cookie sweet" },
    // Faces (smileys — whole set animated in Noto)
    { c: "😀", k: "grinning happy smile face" },
    { c: "😄", k: "smile eyes happy face" },
    { c: "🤣", k: "rolling laugh lol face" },
    { c: "🤩", k: "star struck wow excited face" },
    { c: "🤔", k: "thinking face" },
    { c: "😎", k: "cool sunglasses face" },
    { c: "🥳", k: "party hat celebrate face" },
    { c: "🤓", k: "nerd glasses face" },
    { c: "🧐", k: "monocle face curious investigate" },
    { c: "😴", k: "sleep zzz face tired" },
    { c: "🤯", k: "exploding head mind blown wow face" },
    { c: "😱", k: "scream shock face" },
    { c: "🥵", k: "hot sweat face" },
    { c: "🥸", k: "disguise glasses moustache face" },
    { c: "👻", k: "ghost halloween boo" },
    { c: "💀", k: "skull dead bones" },
    // Body / hands
    { c: "👋", k: "wave hello hi hand" },
    { c: "👍", k: "thumbs up yes good like" },
    { c: "👏", k: "clap applause hands" },
    { c: "🙏", k: "pray thanks namaste hands" },
    { c: "🤝", k: "handshake deal agreement" },
    { c: "💪", k: "muscle strong flex" },
    { c: "👀", k: "eyes look watch peek" },
    // Work / brain
    { c: "💼", k: "briefcase work business" },
    { c: "💰", k: "money bag cash" },
    { c: "💡", k: "lightbulb idea" },
    { c: "🧠", k: "brain mind smart" },
    // Settings / developer
    { c: "⚙️", k: "gear settings config cog" },
    { c: "🛠️", k: "tools hammer wrench build" },
    { c: "💻", k: "laptop computer code developer dev" },
    { c: "🐛", k: "bug debug error" },
    { c: "🤖", k: "robot bot ai" },
    { c: "👾", k: "alien invader game retro" },
    { c: "📊", k: "bar chart analytics graph data" },
    { c: "📈", k: "chart up growth metrics trend" },
  ];

  /** Search query for the create / edit emoji pickers. Separate
   *  signals so opening both forms simultaneously doesn't share
   *  search state (rare but possible). */
  readonly createSearch = signal<string>("");
  readonly editSearch = signal<string>("");

  /** Apply the search filter. Empty query returns the full list. */
  private filterEmojis(q: string): ReadonlyArray<{ c: string; k: string }> {
    const term = q.trim().toLowerCase();
    if (!term) return this.SECTION_EMOJIS;
    return this.SECTION_EMOJIS.filter(
      (e) => e.k.toLowerCase().includes(term) || e.c.includes(term),
    );
  }
  filteredCreateEmojis = computed(() => this.filterEmojis(this.createSearch()));
  filteredEditEmojis = computed(() => this.filterEmojis(this.editSearch()));

  /** Index of the row currently being dragged. Null when no drag is in
   *  flight. Used to apply a "dragging" visual style and to resolve the
   *  drop index on pointerup. */
  dragIndex = signal<number | null>(null);
  /** Index of the row currently hovered during a drag — receives the drop
   *  indicator and is the destination on release. */
  dragOverIndex = signal<number | null>(null);

  /** Section id currently being hovered with a CONV drag (cross-pane
   *  HTML5 DnD, distinct from the internal section-reorder pointer
   *  drag). Drives the highlight ring on the drop target. */
  convDropTargetId = signal<string | null>(null);
  /** Section id currently being hovered by a CONV drag whose type
   *  the section refuses (cross-type rule). Drives the red ring +
   *  inline "Can't move here" pill so the user knows why the drop
   *  cursor flipped to no-entry. */
  invalidDropTargetId = signal<string | null>(null);

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
        // "test" is no longer a built-in — users who want a Test
        // bucket create it as a custom section and move convs in.
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
      // Resolve row indices to section ids before persisting. Row
      // indices in `orderedSections` can diverge from sectionOrder
      // indices when the persisted order has phantom entries (e.g.
      // legacy "test" with no matching custom section), so passing
      // ids keeps the reorder accurate.
      const rows = this.orderedSections();
      const fromRow = rows[from];
      const toRow   = rows[to];
      if (fromRow && toRow) this.state.moveSectionByIds(fromRow.id, toRow.id);
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
   *  moving. Two drag flavours converge on this class:
   *    - Internal section reorder (pointer events; from/to indices).
   *    - Cross-pane conv-onto-section (HTML5 DnD; convDropTargetId). */
  rowDragClass(i: number, rowId: string): string {
    if (this.invalidDropTargetId() === rowId) return "ring-2 ring-red-300 bg-red-50/60";
    if (this.convDropTargetId() === rowId) return "ring-2 ring-blue-400 bg-blue-50";
    if (this.dragIndex() === i) return "opacity-40";
    if (this.dragOverIndex() === i && this.dragIndex() !== null) {
      return "ring-2 ring-blue-400 ring-offset-1";
    }
    return "";
  }

  /* ============== HTML5 DnD — accept a conv drag ==============
   * The ConversationListItem's outer div has draggable=true and
   * publishes {convId, convType} into SectionDragService on
   * dragstart. We accept the drop here if the section id permits
   * this conv's type (sectionAllowedForType — same rule the
   * Move-to-section menu uses). */

  onConvDragOver(e: DragEvent, sectionId: string): void {
    const drag = this.dragSvc.dragging();
    if (!drag) return; // not our drag (file drop, etc.)
    if (!sectionAllowedForType(sectionId, drag.convType)) {
      // Show the "not allowed" cursor and flag the row red so the
      // user sees WHY their drop is being rejected. preventDefault
      // is intentionally skipped — without it, the browser refuses
      // the drop and the source's dragend cleans up.
      if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
      if (this.convDropTargetId() === sectionId) this.convDropTargetId.set(null);
      if (this.invalidDropTargetId() !== sectionId) this.invalidDropTargetId.set(sectionId);
      return;
    }
    e.preventDefault(); // calling preventDefault is what enables drop
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    if (this.convDropTargetId() !== sectionId) this.convDropTargetId.set(sectionId);
    if (this.invalidDropTargetId()) this.invalidDropTargetId.set(null);
  }

  onConvDragLeave(e: DragEvent, sectionId: string): void {
    // dragleave fires when the pointer crosses into a child element
    // too. Only clear the highlight when the related target is
    // outside the row entirely — otherwise the ring flickers as the
    // user moves over the inner # chip / count badge.
    const row = e.currentTarget as HTMLElement;
    const next = e.relatedTarget as Node | null;
    if (next && row.contains(next)) return;
    if (this.convDropTargetId() === sectionId) this.convDropTargetId.set(null);
    if (this.invalidDropTargetId() === sectionId) this.invalidDropTargetId.set(null);
  }

  onConvDrop(e: DragEvent, sectionId: string): void {
    e.preventDefault();
    const drag = this.dragSvc.dragging();
    this.convDropTargetId.set(null);
    this.invalidDropTargetId.set(null);
    this.dragSvc.end();
    if (!drag) return;
    if (!sectionAllowedForType(sectionId, drag.convType)) return;
    this.state.moveConvSection(drag.convId, sectionId);
  }

  /** Per-section channel counts. Prefer the server-aggregated payload
   *  from GET /me/section-counts (cached in state.sectionCounts) so
   *  the badges reflect real workspace totals — not just the local
   *  client cache. Falls back to filtering the loaded conversations
   *  list for the offline/mock path and during the first connect
   *  before the counts endpoint resolves.
   *
   */
  counts = computed(() => {
    const convs = this.state.conversations();
    const server = this.state.sectionCounts();
    if (server) {
      return {
        direct:    server.direct,
        spaces:    server.spaces,
        ai:        server.ai,
        customers: server.customers,
      };
    }
    return {
      direct:    convs.filter((c) => c.section === "direct").length,
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
    // Prefer the server-aggregated count (mirrors the built-in
    // sections, so a custom section with many channels doesn't read
    // smaller than reality due to pagination). Falls back to a local
    // filter when /me/section-counts hasn't resolved yet or this id
    // isn't present in the map.
    const server = this.state.sectionCounts()?.custom?.[id];
    if (typeof server === "number") return server;
    return this.state.conversations().filter((c) => c.section === id).length;
  }

  confirmAddSection(): void {
    const name = this.newSectionName().trim();
    if (!name) return;
    this.state.addCustomSection(name, this.newSectionEmoji() || undefined);
    this.newSectionName.set("");
    this.newSectionEmoji.set("");
    this.createSearch.set("");
    this.addingSection.set(false);
  }

  toggleEmojiPick(emoji: string): void {
    // Tap-again to deselect — falls back to the colored # chip.
    this.newSectionEmoji.update((v) => (v === emoji ? "" : emoji));
  }

  /** Open the inline edit popover for an existing custom section.
   *  Seeds the form state from the current section so the user sees
   *  what they're editing. */
  startEditSection(row: SectionRow): void {
    if (!row.custom) return;
    this.editingSectionId.set(row.id);
    this.editingLabel.set(row.label);
    this.editingEmoji.set(row.custom.emoji ?? "");
  }

  toggleEditEmoji(emoji: string): void {
    this.editingEmoji.update((v) => (v === emoji ? "" : emoji));
  }

  saveEdit(): void {
    const id = this.editingSectionId();
    if (!id) return;
    this.state.updateCustomSection(id, {
      label: this.editingLabel(),
      emoji: this.editingEmoji() || null,
    });
    this.cancelEdit();
  }

  cancelEdit(): void {
    this.editingSectionId.set(null);
    this.editingLabel.set("");
    this.editingEmoji.set("");
    this.editSearch.set("");
  }

  /** Trash-icon click on a custom section row. Asks the confirm
   *  modal with the count of convs that will be demoted, then runs
   *  removeCustomSection which clears section_id on the backend
   *  and drops the section from local prefs. Toasts the result so
   *  the user gets feedback even if the section disappeared off-screen. */
  async onDeleteSection(id: string, label: string): Promise<void> {
    const n = this.state.countConvsInSection(id);
    const message = n === 0
      ? `"${label}" will be removed from your sidebar.`
      : n === 1
        ? `1 conversation will move back to its default section.`
        : `${n} conversations will move back to their default sections.`;
    const ok = await this.confirm.ask({
      title: `Delete "${label}"?`,
      message,
      confirmLabel: "Delete section",
      cancelLabel: "Cancel",
      danger: true,
    });
    if (!ok) return;
    const demoted = await this.state.removeCustomSection(id);
    this.toast.show(
      demoted === 0
        ? "Section deleted"
        : `Section deleted · ${demoted} ${demoted === 1 ? "conversation" : "conversations"} moved`,
    );
  }
  cancelAddSection(): void {
    this.newSectionName.set("");
    this.newSectionEmoji.set("");
    this.createSearch.set("");
    this.addingSection.set(false);
  }
}
