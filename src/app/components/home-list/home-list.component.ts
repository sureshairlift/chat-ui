import {
  ChangeDetectionStrategy, Component, EventEmitter, HostBinding, Input, Output,
  computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { Conversation, CustomSection } from "../../models/types";
import { SECTION_TITLES } from "../../data/section-titles";
import { IconComponent } from "../icon/icon.component";
import { ConversationListItemComponent } from "../conversation-list-item/conversation-list-item.component";
import { ResizeHandleComponent } from "../resize-handle/resize-handle.component";

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
  imports: [CommonModule, IconComponent, ConversationListItemComponent, ResizeHandleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="rootClass" [style.width.px]="fullWidth ? null : (width || 420)">
      <!-- ============== Header ============== -->
      <ng-container *ngIf="fullWidth; else desktopHeader">
        <div class="border-b border-gray-100">
          <!-- Top row: hamburger + search -->
          <div class="flex items-center gap-2 px-3 pt-3 pb-2">
            <button
              (click)="openDrawer.emit()"
              class="w-9 h-9 shrink-0 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-700"
              title="Open menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            </button>
            <button
              (click)="state.openSearch()"
              class="flex-1 flex items-center gap-2 bg-gray-100 rounded-full px-4 py-2 text-[14px] text-gray-500 hover:bg-gray-200 transition"
            >
              <app-icon name="search" [size]="15"></app-icon>
              <span>Search in chat</span>
            </button>
          </div>
          <!-- Title row: home + saved messages icon -->
          <div class="flex items-center justify-between px-4 pb-3 pt-1">
            <h1 class="text-[22px] font-normal text-gray-900 truncate">{{ title() }}</h1>
            <div class="flex items-center gap-2">
              <button
                *ngIf="showFilters()"
                (click)="state.setView('starred')"
                class="w-9 h-9 shrink-0 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600"
                title="Saved messages"
              >
                <app-icon name="bookmark" [size]="18"></app-icon>
              </button>
            </div>
          </div>
        </div>
      </ng-container>
      <ng-template #desktopHeader>
        <div class="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
          <div class="flex items-center gap-2 min-w-0">
            <h1 class="text-[22px] font-normal text-gray-900 truncate">{{ title() }}</h1>
          </div>
          <div *ngIf="showFilters()" class="flex items-center gap-2">
            <label class="flex items-center gap-2 text-[13px] text-gray-700 cursor-pointer select-none">
              <span>Unread</span>
              <button
                (click)="state.unreadOnly.set(!state.unreadOnly())"
                [class]="'relative w-9 h-5 rounded-full transition ' + (state.unreadOnly() ? 'bg-blue-600' : 'bg-gray-300')"
              >
                <span [class]="'absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow ' +
                  (state.unreadOnly() ? 'left-4' : 'left-0.5')"></span>
              </button>
            </label>
          </div>
        </div>
      </ng-template>

      <!-- ============== Body ============== -->
      <ng-container [ngSwitch]="state.selectedSection()">

        <!-- AI section -->
        <div *ngSwitchCase="'ai'" class="flex-1 overflow-y-auto scrollable">
          <button
            *ngIf="aiNew()"
            (click)="picked.emit(aiNew()!.id)"
            [class]="aiNewBtnClass()"
            style="width: calc(100% - 24px);"
          >
            <span class="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-sm shrink-0">
              <app-icon name="plus" [size]="16" class="text-white"></app-icon>
            </span>
            <div class="flex-1 min-w-0">
              <div class="text-[14px] font-medium">New chat</div>
              <div class="text-[12px] text-purple-700/80 mt-0.5">Start a fresh session</div>
            </div>
            <app-icon name="sparkles" [size]="14" class="text-purple-500"></app-icon>
          </button>

          <div *ngIf="aiSessions().length > 0"
               class="px-5 mt-4 mb-1 text-[11px] font-medium text-gray-500 uppercase tracking-wider">
            Recent sessions
          </div>

          <div *ngIf="aiSessions().length === 0"
               class="flex flex-col items-center justify-center text-center px-5 py-12 min-h-[40vh] text-[13px] text-gray-500">
            <app-icon name="sparkles" [size]="32" class="text-gray-300 mb-2"></app-icon>
            No previous sessions yet.
          </div>

          <button
            *ngFor="let c of aiSessions()"
            (click)="picked.emit(c.id)"
            [class]="'w-full flex items-start gap-3 px-5 py-2.5 text-left hover:bg-gray-50 ' +
              (state.activeConv() === c.id ? 'bg-blue-50/60' : '')"
          >
            <div class="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shrink-0 shadow-sm">
              <app-icon name="sparkles" [size]="14" class="text-white"></app-icon>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-[14px] font-medium text-gray-900 truncate">{{ c.name }}</span>
                <span class="text-[11px] text-gray-500 shrink-0">{{ c.lastTime }}</span>
              </div>
              <div class="text-[13px] text-gray-600 truncate mt-0.5">
                <ng-container *ngIf="c.lastSnippet; else emptyAi">{{ c.lastSnippet }}</ng-container>
                <ng-template #emptyAi><span class="italic text-gray-400">No messages yet</span></ng-template>
              </div>
            </div>
          </button>
        </div>

        <!-- Customers section -->
        <div *ngSwitchCase="'customers'" class="flex-1 overflow-y-auto scrollable">
          <!-- Banner -->
          <div class="mx-3 mt-3 mb-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
            <app-icon name="globe" [size]="14" class="text-amber-700 mt-0.5 shrink-0"></app-icon>
            <div class="text-[12px] text-amber-900 leading-relaxed">
              <span class="font-medium">Customer Conversations</span> — chats with people outside your organization, accessed via the customer portal.
            </div>
          </div>
          <!-- Filter pills -->
          <div class="px-3 pb-2 pt-1 flex items-center gap-1.5 overflow-x-auto scrollable">
            <button
              *ngFor="let f of [
                { v: 'all', label: 'All', count: customerCounts().total },
                { v: 'direct', label: 'Direct', count: customerCounts().direct },
                { v: 'groups', label: 'Groups', count: customerCounts().groups }
              ]"
              (click)="customerFilter.set(f.v)"
              [class]="filterPillClass(f.v)"
            >
              {{ f.label }}
              <span [class]="'text-[10px] ' + (customerFilter() === f.v ? 'text-amber-700' : 'text-gray-400')">{{ f.count }}</span>
            </button>
          </div>

          <div *ngIf="customerVisible().length === 0"
               class="flex flex-col items-center justify-center text-center px-5 py-12 min-h-[40vh] text-[13px] text-gray-500">
            <app-icon name="globe" [size]="32" class="text-gray-300 mb-2"></app-icon>
            No conversations match this filter.
          </div>

          <app-conversation-list-item
            *ngFor="let c of customerVisible()"
            [c]="c"
            [isActive]="state.activeConv() === c.id"
            [expanded]="expandedSummaries().has(c.id)"
            [customSections]="state.customSections()"
            (picked)="picked.emit($event)"
            (toggleSummary)="toggleSummary($event)"
            (moveSection)="onMove($event)"
            (openInPopup)="popOut.emit($event)"
          ></app-conversation-list-item>
        </div>

        <!-- Default (built-in & custom sections) -->
        <div *ngSwitchDefault class="flex-1 overflow-y-auto scrollable">
          <div *ngIf="defaultVisible().length === 0"
               class="flex flex-col items-center justify-center text-center px-5 py-12 min-h-[40vh] text-[13px] text-gray-500">
            <app-icon [name]="emptyIcon()" [size]="32" class="text-gray-300 mb-2"></app-icon>
            {{ emptyMsg() }}
          </div>

          <app-conversation-list-item
            *ngFor="let c of defaultVisible()"
            [c]="c"
            [isActive]="state.activeConv() === c.id"
            [expanded]="expandedSummaries().has(c.id)"
            [customSections]="state.customSections()"
            (picked)="picked.emit($event)"
            (toggleSummary)="toggleSummary($event)"
            (moveSection)="onMove($event)"
            (openInPopup)="popOut.emit($event)"
          ></app-conversation-list-item>
        </div>
      </ng-container>

      <!-- Resize handle (only when not fullWidth) -->
      <app-resize-handle
        *ngIf="!fullWidth"
        side="right"
        groupName="resize"
        [isResizing]="state.sidebarResizing()"
        (mouseDown)="startResize.emit($event)"
      ></app-resize-handle>
    </div>
  `,
})
export class HomeListComponent {
  state = inject(ChatStateService);

  @Input() width = 420;
  @Input() fullWidth = false;
  @Output() picked = new EventEmitter<string>();
  @Output() startResize = new EventEmitter<MouseEvent>();
  @Output() openDrawer = new EventEmitter<void>();
  /** Bubbles up the convId when a row's "Open in popup" menu item is clicked. */
  @Output() popOut = new EventEmitter<string>();

  expandedSummaries = signal<Set<string>>(new Set());
  customerFilter = signal<"all" | "direct" | "groups">("all");

  /** Filtered + pin-sorted base list */
  private baseConvs = computed<Conversation[]>(() => {
    const list = this.state.conversations();
    return list
      .filter((c: any) => !c.hidden && !c.archived && !c.blocked)
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  });

  title = computed<string>(() => {
    const sec = this.state.selectedSection();
    const custom = this.state.customSections().find((s) => s.id === sec);
    if (custom) return custom.label;
    return SECTION_TITLES[sec] || "Home";
  });

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
    const builtIn = new Set(["direct", "test", "spaces", "ai", "customers"]);

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
}
