import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ChatStateService } from "../../services/chat-state.service";
import { BreakpointService } from "../../services/breakpoint.service";
import { IconComponent } from "../icon/icon.component";
import { SidebarItemComponent } from "../sidebar-item/sidebar-item.component";
import { SectionHeaderComponent } from "../section-header/section-header.component";

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
  template: `
    <aside [class]="asideClass">
      <!-- Search box + New chat button -->
      <div class="p-3 space-y-2">
        <button
          (click)="state.openSearch()"
          class="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 text-[13px] transition"
        >
          <app-icon name="search" [size]="14"></app-icon>
          <span class="flex-1 text-left">Search</span>
          <kbd class="hidden md:inline-flex text-[10px] px-1.5 py-0.5 bg-gray-100 rounded border border-gray-200 text-gray-500">⌘K</kbd>
        </button>
        <button
          (click)="state.setView('home')"
          class="flex items-center gap-3 bg-blue-50 hover:bg-blue-100 transition rounded-2xl px-4 py-2.5 text-blue-900 shadow-sm w-full"
        >
          <app-icon name="message-square" [size]="18"></app-icon>
          <span class="text-[14px] font-medium">New chat</span>
        </button>
      </div>

      <!-- Body — scrollable -->
      <div class="flex-1 overflow-y-auto px-2 pb-4 scrollable">
        <!-- Shortcuts group toggle -->
        <button
          (click)="shortcutsOpen.set(!shortcutsOpen())"
          class="group flex w-full items-center gap-1 px-3 py-1.5 text-[13px] text-gray-700 hover:bg-gray-100 rounded-md mt-1"
        >
          <app-icon
            [name]="shortcutsOpen() ? 'chevron-down' : 'chevron-right'"
            [size]="14"
            class="text-gray-500"
          ></app-icon>
          <span class="flex-1 text-left font-medium">Shortcuts</span>
        </button>

        <div *ngIf="shortcutsOpen()" class="space-y-0.5 mb-2">
          <app-sidebar-item
            label="Dashboard"
            [active]="state.view() === 'dashboard'"
            (clicked)="state.setView('dashboard')"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="9" rx="1.5"/>
              <rect x="14" y="3" width="7" height="5" rx="1.5"/>
              <rect x="14" y="12" width="7" height="9" rx="1.5"/>
              <rect x="3" y="16" width="7" height="5" rx="1.5"/>
            </svg>
          </app-sidebar-item>

          <app-sidebar-item
            label="Home"
            [active]="state.view() === 'home' && state.selectedSection() === 'all'"
            (clicked)="state.setView('home')"
          >
            <app-icon name="home" [size]="18"></app-icon>
          </app-sidebar-item>

          <app-sidebar-item
            label="Mentions"
            [active]="state.view() === 'mentions'"
            (clicked)="state.setView('mentions')"
          >
            <app-icon name="at-sign" [size]="18"></app-icon>
          </app-sidebar-item>

          <app-sidebar-item
            label="Threads"
            [active]="state.view() === 'threads'"
            (clicked)="state.setView('threads')"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              <line x1="8" y1="9" x2="16" y2="9"/>
              <line x1="8" y1="13" x2="13" y2="13"/>
            </svg>
          </app-sidebar-item>

          <app-sidebar-item
            label="Unread"
            [active]="state.view() === 'home' && state.selectedSection() === 'unread'"
            (clicked)="state.setSection('unread')"
            [count]="unreadCount()"
          >
            <app-icon name="inbox" [size]="18"></app-icon>
          </app-sidebar-item>

          <app-sidebar-item
            label="Pinned chats"
            [active]="state.view() === 'home' && state.selectedSection() === 'pinned'"
            (clicked)="state.setSection('pinned')"
            [count]="pinnedCount()"
          >
            <app-icon name="pin" [size]="18"></app-icon>
          </app-sidebar-item>

          <app-sidebar-item
            label="Saved messages"
            [active]="state.view() === 'starred'"
            (clicked)="state.setView('starred')"
          >
            <app-icon name="bookmark" [size]="18"></app-icon>
          </app-sidebar-item>

          <app-sidebar-item
            label="Sent"
            [active]="state.view() === 'sent'"
            (clicked)="state.setView('sent')"
          >
            <app-icon name="send" [size]="18"></app-icon>
          </app-sidebar-item>
        </div>

        <!-- Divider -->
        <div class="mx-3 my-2 border-t border-gray-200"></div>

        <!-- Customer Conversations (special amber-styled) -->
        <button
          (click)="state.setSection('customers')"
          [class]="customersBtnClass()"
        >
          <span class="shrink-0 w-6 h-6 flex items-center justify-center rounded-md bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm">
            <app-icon name="globe" [size]="12" class="text-white"></app-icon>
          </span>
          <span class="flex-1 text-left truncate">Customer Conversations</span>
          <span *ngIf="counts().customers > 0"
                [class]="customersBadgeClass()">
            {{ counts().customers }}
          </span>
          <app-icon name="chevron-right" [size]="14"
                    [class]="state.selectedSection() === 'customers' ? 'text-amber-700' : 'text-gray-400'">
          </app-icon>
        </button>

        <!-- Airlift Intelligence (gradient) -->
        <button
          (click)="state.setSection('ai')"
          [class]="aiBtnClass()"
        >
          <span class="shrink-0 w-6 h-6 flex items-center justify-center rounded-md bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500">
            <app-icon name="sparkles" [size]="12" class="text-white"></app-icon>
          </span>
          <span class="flex-1 text-left truncate">Airlift Intelligence</span>
          <span *ngIf="counts().ai > 0" [class]="aiBadgeClass()">{{ counts().ai }}</span>
          <app-icon name="chevron-right" [size]="14"
                    [class]="state.selectedSection() === 'ai' ? 'text-purple-700' : 'text-gray-400'">
          </app-icon>
        </button>

        <!-- Built-in section headers -->
        <app-section-header
          label="Direct messages"
          [count]="counts().direct"
          [active]="state.selectedSection() === 'direct'"
          (clicked)="state.setSection('direct')"
        >
          <app-icon name="message-square" [size]="18"></app-icon>
        </app-section-header>

        <app-section-header
          label="Test Section"
          [count]="counts().test"
          [active]="state.selectedSection() === 'test'"
          (clicked)="state.setSection('test')"
        >
          <app-icon name="folder-open" [size]="18"></app-icon>
        </app-section-header>

        <app-section-header
          label="Spaces"
          [count]="counts().spaces"
          [active]="state.selectedSection() === 'spaces'"
          (clicked)="state.setSection('spaces')"
        >
          <app-icon name="hash" [size]="18"></app-icon>
        </app-section-header>

        <!-- Custom sections -->
        <app-section-header
          *ngFor="let s of state.customSections()"
          [label]="s.label"
          [count]="customSectionCount(s.id)"
          [active]="state.selectedSection() === s.id"
          (clicked)="state.setSection(s.id)"
        >
          <span [class]="'w-5 h-5 rounded-md flex items-center justify-center ' + s.color">
            <app-icon name="hash" [size]="12" class="text-white"></app-icon>
          </span>
        </app-section-header>

        <!-- New section creator -->
        <div *ngIf="addingSection(); else addBtn"
             class="flex items-center gap-2 px-3 py-1.5 mt-1">
          <app-icon name="plus" [size]="14" class="text-gray-500 shrink-0"></app-icon>
          <input
            #sectionInput
            [ngModel]="newSectionName()"
            (ngModelChange)="newSectionName.set($event)"
            (keydown.enter)="confirmAddSection()"
            (keydown.escape)="cancelAddSection()"
            placeholder="Section name..."
            class="flex-1 text-[13px] bg-transparent outline-none border-b border-gray-300 focus:border-blue-500 pb-0.5"
            autofocus
          />
          <button (click)="cancelAddSection()" class="text-gray-400 hover:text-gray-600">
            <app-icon name="x" [size]="14"></app-icon>
          </button>
        </div>
        <ng-template #addBtn>
          <button
            (click)="addingSection.set(true)"
            class="group flex w-full items-center gap-3 px-3 py-1.5 rounded-md text-[13px] text-gray-500 hover:text-gray-800 hover:bg-gray-50 mt-1 transition"
          >
            <app-icon name="plus" [size]="14" class="shrink-0"></app-icon>
            <span class="flex-1 text-left">New section</span>
          </button>
        </ng-template>
      </div>

      <!-- Footer: status pill + collapse button -->
      <div class="border-t border-gray-100 p-2 space-y-1">
        <!-- Status pill — shows current emoji+text or a "Set status" prompt.
             Click opens the modal editor. -->
        <button
          (click)="state.openStatusEditor()"
          class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition text-left"
          [title]="state.userStatus() ? 'Update status' : 'Set a status'"
        >
          <span class="w-7 h-7 shrink-0 flex items-center justify-center text-[16px] rounded-full bg-gray-50 ring-1 ring-gray-200">
            {{ state.userStatus()?.emoji || '😶' }}
          </span>
          <span class="flex-1 min-w-0">
            <span *ngIf="state.userStatus(); else noStatus"
                  class="block text-[13px] text-gray-900 truncate">
              {{ state.userStatus()?.text }}
            </span>
            <ng-template #noStatus>
              <span class="block text-[13px] text-gray-500">Set a status</span>
            </ng-template>
          </span>
        </button>
        <button
          *ngIf="!bp.isMobile()"
          (click)="state.sidebarCollapsed.set(true)"
          class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[13px] text-gray-600 hover:bg-gray-100 transition"
          title="Collapse sidebar"
        >
          <app-icon name="chevron-left" [size]="16"></app-icon>
          <span>Collapse sidebar</span>
        </button>
      </div>
    </aside>
  `,
})
export class SidebarComponent {
  state = inject(ChatStateService);
  bp    = inject(BreakpointService);

  shortcutsOpen = signal(true);
  addingSection = signal(false);
  newSectionName = signal("");

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
