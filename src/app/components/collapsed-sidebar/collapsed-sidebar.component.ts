import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { IconComponent } from "../icon/icon.component";
import { SectionId, ViewKey } from "../../models/types";

interface CollapsedItem {
  key: string;
  iconName: string;
  iconCustom?: "dashboard" | "threads";
  tip: string;
  info: string;
  active: boolean;
  onClick: () => void;
  external?: boolean;
  gradient?: boolean;
}

/**
 * CollapsedSidebar — 60px wide rail with icon-only navigation.
 * Mirrors React `<CollapsedSidebar>` 1:1.
 *
 * Sections are taken straight from React's items[] array.
 * Custom sections appear as colored Hash chips below a divider.
 * Tooltip shows on hover via the `group` Tailwind pattern.
 */
@Component({
  selector: "app-collapsed-sidebar",
  standalone: true,
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block shrink-0 h-full" },
  template: `
    <aside
      class="w-[60px] h-full shrink-0 flex flex-col bg-white border-r border-gray-200 items-center"
      style="overflow: visible;"
    >
      <div class="flex-1 flex flex-col items-center py-2 gap-1 w-full">
        <!-- Search -->
        <div class="relative group">
          <button
            (click)="state.openSearch()"
            class="h-9 w-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-600"
          >
            <app-icon name="search" [size]="16"></app-icon>
          </button>
          <ng-container *ngTemplateOutlet="tip; context: { label: 'Search', info: '⌘K to open from anywhere' }"></ng-container>
        </div>

        <!-- New chat (Plus) -->
        <div class="relative group">
          <button
            (click)="state.setView('home')"
            class="h-9 w-9 rounded-full bg-blue-50 hover:bg-blue-100 flex items-center justify-center text-blue-700 mb-1"
          >
            <app-icon name="plus" [size]="18"></app-icon>
          </button>
          <ng-container *ngTemplateOutlet="tip; context: { label: 'New chat', info: 'Start a new conversation' }"></ng-container>
        </div>

        <div class="w-7 h-px bg-gray-200 my-1"></div>

        <!-- Items -->
        <div *ngFor="let it of items()" class="relative group">
          <button (click)="it.onClick()" [class]="btnClassFor(it)">
            <!-- Custom dashboard icon (4-tile grid) -->
            <svg *ngIf="it.iconCustom === 'dashboard'"
                 width="18" height="18" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="9" rx="1.5"/>
              <rect x="14" y="3" width="7" height="5" rx="1.5"/>
              <rect x="14" y="12" width="7" height="9" rx="1.5"/>
              <rect x="3" y="16" width="7" height="5" rx="1.5"/>
            </svg>
            <!-- Custom threads icon -->
            <svg *ngIf="it.iconCustom === 'threads'"
                 width="18" height="18" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              <line x1="8" y1="9" x2="16" y2="9"/>
              <line x1="8" y1="13" x2="13" y2="13"/>
            </svg>
            <app-icon *ngIf="!it.iconCustom" [name]="it.iconName" [size]="18"></app-icon>
          </button>
          <ng-container *ngTemplateOutlet="tip; context: { label: it.tip, info: it.info }"></ng-container>
        </div>

        <!-- Custom sections divider + entries -->
        <ng-container *ngIf="state.customSections().length > 0">
          <div class="w-7 h-px bg-gray-200 my-1"></div>
          <div *ngFor="let s of state.customSections()" class="relative group">
            <button
              (click)="state.setSection(s.id)"
              [class]="'h-9 w-9 rounded-full flex items-center justify-center transition ' +
                (state.selectedSection() === s.id ? 'bg-blue-100' : 'hover:bg-gray-100')"
            >
              <span [class]="'w-6 h-6 rounded-md flex items-center justify-center ' + s.color">
                <app-icon name="hash" [size]="12" class="text-white"></app-icon>
              </span>
            </button>
            <ng-container *ngTemplateOutlet="tip; context: { label: s.label, info: 'Custom section' }"></ng-container>
          </div>
        </ng-container>
      </div>

      <!-- Bottom: expand button -->
      <div class="w-full border-t border-gray-100 p-2 flex justify-center">
        <div class="relative group">
          <button
            (click)="state.sidebarCollapsed.set(false)"
            class="h-9 w-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-600"
          >
            <app-icon name="chevron-right" [size]="18"></app-icon>
          </button>
          <ng-container *ngTemplateOutlet="tip; context: { label: 'Expand sidebar', info: 'Show full labels' }"></ng-container>
        </div>
      </div>
    </aside>

    <!-- Tooltip template (right of button) -->
    <ng-template #tip let-label="label" let-info="info">
      <span class="absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap">
        <span class="block bg-gray-900 text-white text-[12px] font-medium rounded-md shadow-lg px-2.5 py-1.5">
          {{ label }}
          <span *ngIf="info" class="block text-[10.5px] font-normal text-gray-300 mt-0.5">{{ info }}</span>
        </span>
      </span>
    </ng-template>
  `,
})
export class CollapsedSidebarComponent {
  state = inject(ChatStateService);

  /** Item list, computed reactively from current state. */
  items = computed<CollapsedItem[]>(() => {
    const convs = this.state.conversations();
    const view = this.state.view();
    const sec = this.state.selectedSection();

    const unreadCount    = convs.filter((c) => c.unread).length;
    const pinnedCount    = convs.filter((c) => c.pinned).length;
    const customerCount  = convs.filter((c) => c.section === "customers").length;
    const directCount    = convs.filter((c) => c.section === "direct").length;
    const spacesCount    = convs.filter((c) => c.section === "spaces").length;

    return [
      { key: "dashboard", iconName: "", iconCustom: "dashboard",
        tip: "Dashboard", info: "Today's overview, handoffs, and tasks",
        active: view === "dashboard",
        onClick: () => this.state.setView("dashboard") },
      { key: "home", iconName: "home",
        tip: "Home", info: "All conversations",
        active: view === "home" && sec === "all",
        onClick: () => this.state.setView("home") },
      { key: "mentions", iconName: "at-sign",
        tip: "Mentions", info: "Where someone @mentioned you",
        active: view === "mentions",
        onClick: () => this.state.setView("mentions") },
      { key: "threads", iconName: "", iconCustom: "threads",
        tip: "Threads", info: "Threads you've replied to or been mentioned in",
        active: view === "threads",
        onClick: () => this.state.setView("threads") },
      { key: "unread", iconName: "inbox",
        tip: "Unread",
        info: unreadCount > 0 ? `${unreadCount} unread conversation${unreadCount === 1 ? "" : "s"}` : "All caught up",
        active: view === "home" && sec === "unread",
        onClick: () => this.state.setSection("unread") },
      { key: "pinned", iconName: "pin",
        tip: "Pinned chats",
        info: pinnedCount > 0 ? `${pinnedCount} pinned` : "Pin chats to keep them on top",
        active: view === "home" && sec === "pinned",
        onClick: () => this.state.setSection("pinned") },
      { key: "starred", iconName: "bookmark",
        tip: "Saved messages", info: "Bookmarked messages for later",
        active: view === "starred",
        onClick: () => this.state.setView("starred") },
      { key: "sent", iconName: "send",
        tip: "Sent", info: "Your messages, newest first",
        active: view === "sent",
        onClick: () => this.state.setView("sent") },
      { key: "external", iconName: "globe",
        tip: "Customer Conversations",
        info: customerCount > 0 ? `${customerCount} customer chats` : "Chats with external customers",
        active: sec === "customers", external: true,
        onClick: () => this.state.setSection("customers") },
      { key: "ai", iconName: "sparkles",
        tip: "Airlift Intelligence", info: "AI assistant powered by your data",
        active: sec === "ai", gradient: true,
        onClick: () => this.state.setSection("ai") },
      { key: "direct", iconName: "message-square",
        tip: "Direct messages", info: `${directCount} 1:1 conversation${directCount === 1 ? "" : "s"}`,
        active: sec === "direct",
        onClick: () => this.state.setSection("direct") },
      { key: "test", iconName: "folder-open",
        tip: "Test Section", info: "Test conversations",
        active: sec === "test",
        onClick: () => this.state.setSection("test") },
      { key: "spaces", iconName: "hash",
        tip: "Spaces", info: `${spacesCount} group space${spacesCount === 1 ? "" : "s"}`,
        active: sec === "spaces",
        onClick: () => this.state.setSection("spaces") },
    ];
  });

  btnClassFor(it: CollapsedItem): string {
    const base = "h-9 w-9 rounded-full flex items-center justify-center transition";
    if (it.active) {
      if (it.gradient) return `${base} bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100 text-purple-700`;
      if (it.external) return `${base} bg-amber-100 text-amber-700`;
      return `${base} bg-blue-100 text-blue-700`;
    }
    if (it.gradient) return `${base} text-purple-500 hover:bg-purple-50`;
    if (it.external) return `${base} text-amber-600 hover:bg-amber-50`;
    return `${base} text-gray-600 hover:bg-gray-100`;
  }
}
