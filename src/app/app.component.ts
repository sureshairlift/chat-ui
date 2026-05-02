import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, HostListener,
  OnDestroy, ViewChild, computed, effect, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router, RouterOutlet, NavigationEnd, ActivatedRoute } from "@angular/router";
import { filter } from "rxjs/operators";
import { ChatStateService } from "./services/chat-state.service";
import { ToastService } from "./services/toast.service";
import { BreakpointService } from "./services/breakpoint.service";
import { IdMapperService } from "./services/id-mapper.service";
import { BUILTIN_SECTIONS } from "./app.routes";
import { Message } from "./models/types";
import { SENDERS } from "./data/senders";
import { getDayKey, formatDayLabel } from "./services/helpers";

import { SidebarComponent } from "./components/sidebar/sidebar.component";
import { CollapsedSidebarComponent } from "./components/collapsed-sidebar/collapsed-sidebar.component";
import { HomeListComponent } from "./components/home-list/home-list.component";
import { MentionsViewComponent } from "./components/mentions-view/mentions-view.component";
import { ThreadsViewComponent } from "./components/threads-view/threads-view.component";
import { SentViewComponent } from "./components/sent-view/sent-view.component";
import { StarredViewComponent } from "./components/starred-view/starred-view.component";
import { ConversationHeaderComponent } from "./components/conversation-header/conversation-header.component";
import { MessageBubbleComponent } from "./components/message-bubble/message-bubble.component";
import { ComposerComponent } from "./components/composer/composer.component";

import { ThreadPanelComponent } from "./components/thread-panel/thread-panel.component";
import { BoardPanelComponent } from "./components/board-panel/board-panel.component";
import { FollowingPanelComponent } from "./components/following-panel/following-panel.component";
import { TasksPanelComponent } from "./components/tasks-panel/tasks-panel.component";
import { PinnedPanelComponent } from "./components/pinned-panel/pinned-panel.component";
import { SharedMediaPanelComponent } from "./components/shared-media-panel/shared-media-panel.component";
import { SearchModalComponent } from "./components/search-modal/search-modal.component";
import { HomeDashboardComponent } from "./components/home-dashboard/home-dashboard.component";

interface DayGroup { key: string; label: string; messages: Message[]; }

/**
 * Final shell — full 3-column layout with:
 *  - NavRail (lg+ only)
 *  - Sidebar (collapsed/expanded) OR Mobile drawer
 *  - Content list pane (HomeList/Mentions/Threads/Sent/Starred/Dashboard)
 *  - Right message pane (ConversationHeader + messages + Composer)
 *  - Conditional side panels stacked at the right (Thread/Board/Following/Tasks/Pinned/SharedMedia)
 *  - Search modal overlay (Cmd+K)
 *  - Toast layer
 *
 * Resize behaviour:
 *  - Drag right-edge of HomeList → resizes the list pane (260–520px clamped)
 *  - Drag left-edge of ThreadPanel → resizes the thread pane (320–640px clamped)
 *  - Body gets `is-resizing` class during drag (locks cursor)
 *  - paneWidth computed via ResizeObserver on the right pane element so
 *    ConversationHeader's icon-collapse thresholds work correctly
 *
 * Mobile (< 768px):
 *  - NavRail hidden
 *  - Sidebar lives in a slide-out drawer toggled by a hamburger
 *  - When a conversation is active, only the right pane shows full-width
 *  - HomeList renders in fullWidth mode
 */
@Component({
  selector: "app-root",
  standalone: true,
  imports: [
    CommonModule, RouterOutlet,
    SidebarComponent, CollapsedSidebarComponent,
    HomeListComponent, MentionsViewComponent, ThreadsViewComponent,
    SentViewComponent, StarredViewComponent,
    ConversationHeaderComponent, MessageBubbleComponent, ComposerComponent,
    ThreadPanelComponent, BoardPanelComponent, FollowingPanelComponent,
    TasksPanelComponent, PinnedPanelComponent, SharedMediaPanelComponent,
    SearchModalComponent, HomeDashboardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="h-screen w-full flex bg-white overflow-hidden text-gray-900"
         style="font-family: 'DM Sans', 'Public Sans', system-ui, -apple-system, sans-serif;">

      <!-- ============== Mobile drawer overlay ============== -->
      <ng-container *ngIf="bp.isMobile() && drawerOpen()">
        <div (click)="drawerOpen.set(false)"
             class="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"></div>
        <div class="fixed left-0 top-0 bottom-0 z-50 w-[300px] bg-white shadow-2xl flex flex-col side-panel-in">
          <div class="flex items-center justify-between px-3 py-3 border-b border-gray-100">
            <h2 class="text-[16px] font-semibold">Menu</h2>
            <button (click)="drawerOpen.set(false)"
                    class="p-1.5 rounded-full hover:bg-gray-100 text-gray-600">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="flex-1 overflow-y-auto" (click)="drawerOpen.set(false)">
            <app-sidebar></app-sidebar>
          </div>
        </div>
      </ng-container>

      <!-- ============== Sidebar (tablet/desktop, not mobile) ==============
           On tablet, force the icon-rail regardless of the user's collapse
           preference — there isn't enough horizontal room for the full 260px
           sidebar AND the conv list AND the message pane. -->
      <ng-container *ngIf="!bp.isMobile() && !state.sidebarFullScreen()">
        <app-collapsed-sidebar *ngIf="effectiveSidebarCollapsed()"></app-collapsed-sidebar>
        <app-sidebar *ngIf="!effectiveSidebarCollapsed()"></app-sidebar>
      </ng-container>

      <!-- ============== Content list pane ==============
           On mobile: hidden if a conversation is active (right pane takes over). -->
      <ng-container *ngIf="showListPane()">
        <ng-container [ngSwitch]="state.view()">
          <!-- Home list (resizable on desktop, fullWidth on mobile) -->
          <app-home-list
            *ngSwitchCase="'home'"
            [width]="state.sidebarWidth()"
            [fullWidth]="bp.isMobile()"
            (picked)="state.setActiveConv($event)"
            (startResize)="onStartListResize($event)"
            (openDrawer)="drawerOpen.set(true)"
          ></app-home-list>

          <app-mentions-view
            *ngSwitchCase="'mentions'"
            [showBack]="bp.isMobile()"
            (openConv)="state.setActiveConv($event)"
            (back)="state.setView('home')"
          ></app-mentions-view>

          <app-threads-view
            *ngSwitchCase="'threads'"
            [showBack]="bp.isMobile()"
            (openThread)="onOpenThreadFromList($event)"
            (back)="state.setView('home')"
          ></app-threads-view>

          <app-sent-view
            *ngSwitchCase="'sent'"
            [showBack]="bp.isMobile()"
            (openConv)="state.setActiveConv($event)"
            (back)="state.setView('home')"
          ></app-sent-view>

          <app-starred-view
            *ngSwitchCase="'starred'"
            [showBack]="bp.isMobile()"
            (openConv)="state.setActiveConv($event)"
            (back)="state.setView('home')"
          ></app-starred-view>

          <app-home-dashboard
            *ngSwitchCase="'dashboard'"
            [isMobile]="bp.isMobile()"
            (back)="state.setView('home')"
            (openConv)="onPickFromSearch($event)"
            (markConvRead)="onMarkConvRead($event)"
            (markAllRead)="state.markAllRead()"
            (goToMentions)="state.setView('mentions')"
            (goToTasks)="onGoToTasks()"
            (takeOver)="onTakeOverSession($event)"
            (continueAI)="onContinueAI($event)"
            (resolveSession)="onResolveSession($event)"
            (reassign)="onReassignSession($event)"
          ></app-home-dashboard>
        </ng-container>
      </ng-container>

      <!-- ============== Right pane: message panel ============== -->
      <div *ngIf="showRightPane()"
           #rightPane
           class="flex-1 flex flex-col border-l border-gray-200 min-w-0 bg-white">
        <ng-container *ngIf="state.currentConv() as conv; else emptyState">
          <app-conversation-header
            [conv]="conv"
            [splitPane]="true"
            [isMobile]="bp.isMobile()"
            [isTablet]="bp.isTablet()"
            [paneWidth]="paneWidth()"
            [tasksActive]="state.showTasks()"
            [pinnedActive]="state.showPinned()"
            [searchActive]="convSearchOpen()"
            [sharedMediaActive]="state.showSharedMedia()"
            (back)="onHeaderBack()"
            (close)="state.setActiveConv(null)"
            (toggleFocus)="state.sidebarCollapsed.set(!state.sidebarCollapsed())"
            (togglePinConv)="state.togglePinConv(conv.id)"
            (markUnread)="markUnread(conv.id)"
            (newAIChat)="onNewAIChat()"
            (hideConv)="onHideConv(conv.id)"
            (archiveConv)="onArchiveConv(conv.id)"
            (leaveSpace)="onLeaveSpace(conv.id)"
            (blockReport)="onBlockReport()"
            (clearHistory)="onClearHistory(conv.id)"
            (toggleConvSearch)="toggleConvSearch()"
          ></app-conversation-header>

          <!-- In-conversation search bar — slides in below the header when active.
               Distinct from the global Cmd+K modal: this filters the current conv only. -->
          <div *ngIf="convSearchOpen()"
               class="px-4 py-2 border-b border-gray-200 bg-blue-50/40 flex items-center gap-2 side-panel-in">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-gray-500 shrink-0">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <input
              #convSearchInput
              type="text"
              [placeholder]="'Search in ' + conv.name + '…'"
              [value]="convSearchQuery()"
              (input)="convSearchQuery.set($any($event.target).value)"
              (keydown.escape)="closeConvSearch()"
              class="flex-1 bg-transparent border-0 outline-none text-[13px] placeholder-gray-500"
            />
            <span *ngIf="convSearchQuery()" class="text-[11px] text-gray-600 tabular-nums shrink-0">
              {{ convSearchMatchCount() }} {{ convSearchMatchCount() === 1 ? 'match' : 'matches' }}
            </span>
            <button (click)="closeConvSearch()"
                    class="p-1 hover:bg-gray-200 rounded shrink-0"
                    title="Close search (Esc)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-gray-600">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div #messagesScroll
               (scroll)="onMessagesScroll()"
               class="flex-1 overflow-y-auto scrollable bg-white py-2 relative">
            <ng-container *ngFor="let group of dayGroups()">
              <div class="flex items-center justify-center py-3">
                <div class="text-[11px] font-medium text-gray-500 bg-gray-100 rounded-full px-3 py-0.5">
                  {{ group.label }}
                </div>
              </div>
              <ng-container *ngFor="let msg of group.messages; let i = index">
                <!-- "New" unread divider — rendered just before the first unread message -->
                <div *ngIf="conv.unreadStartMsgId && conv.unreadStartMsgId === msg.id"
                     class="flex items-center gap-3 px-6 my-2 select-none">
                  <div class="flex-1 h-px bg-red-300"></div>
                  <span class="text-[11px] font-semibold text-red-600 uppercase tracking-wider">New</span>
                  <div class="flex-1 h-px bg-red-300"></div>
                </div>
                <div [attr.data-msg-id]="msg.id">
                  <app-message-bubble
                    [msg]="msg"
                    [prevMsg]="i > 0 ? group.messages[i - 1] : null"
                    [convId]="conv.id"
                    [highlight]="focusedMsgId() === msg.id"
                    [highlightQuery]="!!convSearchQuery()"
                    (openThread)="state.openThread($event)"
                    (reply)="onReply($event)"
                  ></app-message-bubble>
                </div>
              </ng-container>
            </ng-container>

            <!-- Scroll-to-bottom floating button — appears when scrolled up -->
            <button *ngIf="!isAtBottom()"
                    (click)="scrollToBottom()"
                    title="Scroll to latest"
                    class="sticky bottom-4 ml-auto mr-4 mt-2 flex items-center justify-center w-9 h-9 rounded-full bg-white border border-gray-200 shadow-md hover:bg-gray-50 text-gray-700 transition z-10"
                    style="float: right;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M19 12l-7 7-7-7"/>
              </svg>
            </button>
          </div>

          <app-composer
            [convId]="conv.id"
            [isAI]="!!conv.isAI"
            [isMobile]="bp.isMobile()"
            [lastMessageFromOther]="lastMessageFromOther()"
            [replyingTo]="replyingTo()"
            [draft]="state.drafts()[conv.id]?.html || ''"
            (send)="onSend($event)"
            (cancelReply)="state.setReplyingTo(null, null)"
            (draftChange)="onDraftChange($event)"
          ></app-composer>
        </ng-container>
        <ng-template #emptyState>
          <!-- When no conversation is selected, the right pane shows the operations
               dashboard (handoffs, AI insights, tasks) instead of an empty illustration. -->
          <app-home-dashboard
            [isMobile]="bp.isMobile()"
            (back)="state.setView('home')"
            (openConv)="onPickFromSearch($event)"
            (markConvRead)="onMarkConvRead($event)"
            (markAllRead)="state.markAllRead()"
            (goToMentions)="state.setView('mentions')"
            (goToTasks)="onGoToTasks()"
            (takeOver)="onTakeOverSession($event)"
            (continueAI)="onContinueAI($event)"
            (resolveSession)="onResolveSession($event)"
            (reassign)="onReassignSession($event)"
          ></app-home-dashboard>
        </ng-template>
      </div>

      <!-- ============== Side panels (only when a conv is active) ============== -->
      <ng-container *ngIf="state.currentConv() as conv">
        <app-thread-panel
          *ngIf="threadParent() as parent"
          [parent]="parent"
          [width]="state.threadWidth()"
          [fullscreen]="state.sidePanelFullscreen() || bp.isMobile()"
          (closed)="state.closeThread()"
          (startResize)="onStartThreadResize($event)"
        ></app-thread-panel>

        <app-board-panel
          *ngIf="state.showBoard()"
          [fullscreen]="state.sidePanelFullscreen() || bp.isMobile()"
          (closed)="state.closeBoard()"
        ></app-board-panel>

        <app-following-panel
          *ngIf="state.showFollowing()"
          [fullscreen]="state.sidePanelFullscreen() || bp.isMobile()"
          (closed)="state.closeFollowing()"
          (openThread)="onOpenThreadFromList($event)"
        ></app-following-panel>

        <app-tasks-panel
          *ngIf="state.showTasks()"
          [conv]="conv"
          [fullscreen]="state.sidePanelFullscreen() || bp.isMobile()"
          (closed)="state.closeTasks()"
        ></app-tasks-panel>

        <app-pinned-panel
          *ngIf="state.showPinned()"
          [conv]="conv"
          [fullscreen]="state.sidePanelFullscreen() || bp.isMobile()"
          (closed)="state.closePinned()"
        ></app-pinned-panel>

        <app-shared-media-panel
          *ngIf="state.showSharedMedia()"
          [conv]="conv"
          [fullscreen]="state.sidePanelFullscreen() || bp.isMobile()"
          (closed)="state.closeSharedMedia()"
        ></app-shared-media-panel>
      </ng-container>

      <!-- Search modal -->
      <app-search-modal
        *ngIf="state.showSearch()"
        (closed)="state.closeSearch()"
        (pickConvId)="onPickFromSearch($event)"
      ></app-search-modal>

      <!-- Toast -->
      <div *ngIf="toast.toast() as t"
           class="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] bg-gray-900 text-white text-[13px] px-4 py-2 rounded-full shadow-lg side-panel-in">
        {{ t.message }}
      </div>

      <!-- Router outlet — invisible. The router exists purely to keep the URL
           in sync with state for deep-linking and bookmarks. The visible UI
           is rendered by everything above; route components are empty stubs. -->
      <router-outlet style="display: none"></router-outlet>
    </div>
  `,
})
export class AppComponent implements AfterViewInit, OnDestroy {
  state = inject(ChatStateService);
  toast = inject(ToastService);
  bp    = inject(BreakpointService);
  private router = inject(Router);
  private activatedRoute = inject(ActivatedRoute);
  private idMapper = inject(IdMapperService);

  /** Suppresses the URL → state sync while we're applying state → URL — without
   *  this flag, a state change triggers a navigate, which fires NavigationEnd,
   *  which would re-apply the same value to state and risk an infinite loop. */
  private syncingFromState = false;
  /** Symmetric flag — suppresses state → URL while we're applying URL → state. */
  private syncingFromUrl = false;
  /** True once the first NavigationEnd has fired and applyUrlToState has run.
   *  Until then, the state → URL effect must not fire — otherwise it boots
   *  with the default `activeConv = "origin-software"` and rewrites whatever
   *  URL the user actually loaded (the symptom: every refresh resets to
   *  `/c/<origin-software-hash>`). */
  private hasAppliedInitialUrl = false;

  drawerOpen = signal(false);
  paneWidth  = signal<number>(9999);

  /** True when the messages scroller is within ~60px of the bottom. Drives
   *  the visibility of the scroll-to-bottom floating button. */
  isAtBottom = signal(true);

  /** Message id to briefly highlight + scroll into view (set when navigating
   *  from Threads/Mentions/Search). Auto-clears after ~2s. */
  focusedMsgId = signal<string | null>(null);
  private focusedClearTimer?: ReturnType<typeof setTimeout>;

  /** In-conversation search bar (distinct from the global Cmd+K modal).
   *  When `convSearchOpen` is true, an input row appears below the conv
   *  header and `dayGroups()` filters messages by `convSearchQuery`. */
  convSearchOpen  = signal(false);
  convSearchQuery = signal("");

  @ViewChild("convSearchInput") convSearchInput?: ElementRef<HTMLInputElement>;

  @ViewChild("rightPane") rightPane?: ElementRef<HTMLElement>;
  @ViewChild("messagesScroll") messagesScroll?: ElementRef<HTMLElement>;
  private resizeObserver?: ResizeObserver;

  /* =================== Visibility flags =================== */

  /** True when any conversation-scoped side panel is open. When true, the
   *  HomeList collapses out so the layout is Sidebar → Conversation → Panel. */
  showSidePanel = computed<boolean>(() =>
    !!this.state.showThread() ||
    this.state.showBoard() ||
    this.state.showFollowing() ||
    this.state.showTasks() ||
    this.state.showPinned() ||
    this.state.showSharedMedia()
  );

  /** Whether the sidebar should render in its collapsed (icon-rail) form.
   *  Tablet and below force-collapses regardless of the user's preference —
   *  there isn't enough horizontal room for the full 260px sidebar plus
   *  conv list plus message pane. Desktop honors `state.sidebarCollapsed`. */
  effectiveSidebarCollapsed = computed<boolean>(() =>
    this.bp.isTablet() || this.state.sidebarCollapsed()
  );

  /** Whether the list pane (HomeList / MentionsView / ThreadsView / etc.) shows.
   *  - For view === "home": hidden whenever a side panel is open. On mobile,
   *    also hidden whenever a conversation is active. On desktop, shown when
   *    splitPane is on OR no conv is selected.
   *  - For other views (dashboard/mentions/threads/sent/starred): always shown
   *    since they occupy this pane exclusively. */
  showListPane = computed<boolean>(() => {
    if (this.state.view() !== "home") return true;
    if (this.showSidePanel()) return false;
    if (this.bp.isMobile()) return !this.state.activeConv();
    return true;
  });

  /** Whether the right (conversation) pane shows.
   *  - Desktop: always shown.
   *  - Mobile: only when a conv is active AND no side panel is open (the panel
   *    takes over full-screen on mobile, so the conv would be hidden behind). */
  showRightPane = computed<boolean>(() => {
    if (this.state.view() !== "home") return false;
    if (!this.bp.isMobile()) return true;
    return !!this.state.activeConv() && !this.showSidePanel();
  });

  /* =================== Lifecycle =================== */

  constructor() {
    // When sidebar collapsed/expanded changes, re-measure paneWidth on next tick
    effect(() => {
      this.state.sidebarCollapsed();
      this.state.sidebarWidth();
      this.state.threadWidth();
      this.state.showThread();
      this.state.showBoard();
      this.state.showFollowing();
      this.state.showTasks();
      this.state.showPinned();
      this.state.showSharedMedia();
      this.bp.width();
      // Defer to next frame so layout is settled
      requestAnimationFrame(() => this.measurePaneWidth());
    });

    // Auto-scroll the messages pane to the bottom whenever the active conv
    // changes or a new message lands. Without this, sending a message leaves
    // the viewport scrolled to wherever the user last was.
    effect(() => {
      this.state.activeConv();
      const msgs = this.state.currentMessages();
      // Touch length so the effect fires on append
      void msgs.length;
      requestAnimationFrame(() => this.scrollToBottom("auto"));
    });

    // Close the mobile drawer whenever the user navigates from inside the
    // sidebar (picks a view, section, or conversation). Without this, the
    // drawer stays open after a tap which feels broken on mobile.
    // `allowSignalWrites: true` because the effect's whole purpose is to
    // reset state in response to navigation signal changes.
    effect(() => {
      this.state.view();
      this.state.activeConv();
      this.state.selectedSection();
      if (this.bp.isMobile() && this.drawerOpen()) {
        this.drawerOpen.set(false);
      }
    }, { allowSignalWrites: true });

    // Reset in-conversation search when the active conversation changes,
    // so query state doesn't leak across conversations.
    effect(() => {
      this.state.activeConv();
      this.convSearchOpen.set(false);
      this.convSearchQuery.set("");
    }, { allowSignalWrites: true });

    /* ---------------- URL ↔ state sync ----------------
     *
     * The app has two sources of truth that must stay aligned:
     *   - State signals (view / activeConv / selectedSection / showThread)
     *   - URL (deep-linkable, bookmarkable)
     *
     * Two pumps:
     *   (a) URL  → state: NavigationEnd subscription below
     *   (b) State → URL: effect that calls Router.navigate
     *
     * `syncingFromState` and `syncingFromUrl` flags break what would otherwise
     * be an infinite reactive loop (state change → navigate → NavigationEnd
     * → state change → ...).
     */

    // (a) URL → state. After the first NavigationEnd, mark the flag so the
    //     state → URL effect is allowed to run.
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => {
        this.applyUrlToState();
        this.hasAppliedInitialUrl = true;
      });

    // (b) State → URL. Gated on `hasAppliedInitialUrl` — without that gate,
    //     the effect runs once at boot with the default state values
    //     (e.g. `activeConv = "origin-software"`) and overwrites whatever
    //     URL the user actually loaded, making every refresh snap back to
    //     the default conversation.
    effect(() => {
      const view = this.state.view();
      const activeConv = this.state.activeConv();
      const section = this.state.selectedSection();
      const thread = this.state.showThread();
      if (!this.hasAppliedInitialUrl) return;
      if (this.syncingFromUrl) return;
      this.syncingFromState = true;
      const url = this.buildUrlForState(view, activeConv, section, thread);
      // Avoid re-navigating to the same URL — saves an extra NavigationEnd.
      if (url !== this.router.url) {
        this.router.navigateByUrl(url);
      }
      // Release the flag on the next microtask so NavigationEnd handlers see false.
      Promise.resolve().then(() => { this.syncingFromState = false; });
    });
  }

  /* =================== URL parsing + building =================== */

  /** Walk to the deepest matching route and merge all params + data. */
  private leafSnapshot(): { params: Record<string, string>; data: Record<string, unknown> } {
    let route = this.activatedRoute.snapshot;
    while (route.firstChild) route = route.firstChild;
    return { params: route.params as Record<string, string>, data: route.data as Record<string, unknown> };
  }

  /** Read the current URL and update state to match. Called on every
   *  NavigationEnd. Skipped when state itself just triggered the nav. */
  private applyUrlToState(): void {
    if (this.syncingFromState) return;
    const { params, data } = this.leafSnapshot();
    const view = (data["view"] as string | undefined) ?? "home";

    this.syncingFromUrl = true;
    try {
      // View
      if (view === "home") {
        this.state.view.set("home");
      } else if (view === "dashboard" || view === "mentions" || view === "threads"
                 || view === "sent" || view === "starred") {
        this.state.view.set(view as any);
      }

      // Section / conversation / thread (only meaningful when view === home)
      if (view === "home") {
        const sectionKind = data["sectionKind"] as string | undefined;
        if (params["sectionId"] && sectionKind === "builtin") {
          // Built-in section IDs are human-readable and used as-is.
          this.state.selectedSection.set(params["sectionId"] as any);
          this.state.activeConv.set(null);
          this.state.showThread.set(null);
        } else if (params["customId"] && sectionKind === "custom") {
          // Custom section URL token → look up the real internal id.
          const realSection = this.idMapper.sectionIdForUrl(params["customId"]);
          if (realSection) {
            this.state.selectedSection.set(realSection as any);
            this.state.activeConv.set(null);
            this.state.showThread.set(null);
          }
        } else if (params["convId"]) {
          // URL holds opaque tokens — resolve back to internal IDs via the
          // mapper. If lookup fails (e.g. someone hand-typed a bad URL),
          // fall back to clearing the active conv.
          const realConv = this.idMapper.convIdForUrl(params["convId"]);
          this.state.activeConv.set(realConv);
          if (params["msgId"]) {
            this.state.showThread.set(this.idMapper.msgIdForUrl(params["msgId"]));
          } else {
            this.state.showThread.set(null);
          }
        } else {
          // Bare /main/internal-memo — clear conv and thread, default section.
          this.state.activeConv.set(null);
          this.state.showThread.set(null);
          this.state.selectedSection.set("all");
        }
      }
    } finally {
      Promise.resolve().then(() => { this.syncingFromUrl = false; });
    }
  }

  /** Build the canonical URL for a given state shape. */
  private buildUrlForState(
    view: string,
    activeConv: string | null,
    section: string,
    thread: string | null,
  ): string {
    const BASE = "/main/internal-memo";
    if (view === "dashboard") return `${BASE}/dashboard`;
    if (view === "mentions")  return `${BASE}/mentions`;
    if (view === "threads")   return `${BASE}/threads`;
    if (view === "sent")      return `${BASE}/sent`;
    if (view === "starred")   return `${BASE}/saved`;
    // home view — encode internal IDs as opaque URL tokens
    if (activeConv) {
      const convToken = this.idMapper.urlIdForConv(activeConv);
      if (thread) {
        const msgToken = this.idMapper.urlIdForMsg(thread);
        return `${BASE}/c/${convToken}/thread/${msgToken}`;
      }
      return `${BASE}/c/${convToken}`;
    }
    if (section && section !== "all") {
      // Section URL splits two ways:
      //  - Built-in (customers, ai, direct, spaces, test, pinned, unread)
      //    → /section/:id with the readable id intact
      //  - Custom user-created sections (anything else)
      //    → /custom/:id with the id hashed via IdMapperService
      if (BUILTIN_SECTIONS.has(section)) {
        return `${BASE}/section/${section}`;
      }
      const customToken = this.idMapper.urlIdForSection(section);
      return `${BASE}/section/custom/${customToken}`;
    }
    return BASE;
  }

  /* =================== In-conversation search =================== */

  toggleConvSearch(): void {
    const next = !this.convSearchOpen();
    this.convSearchOpen.set(next);
    if (!next) this.convSearchQuery.set("");
    else setTimeout(() => this.convSearchInput?.nativeElement?.focus(), 0);
  }

  closeConvSearch(): void {
    this.convSearchOpen.set(false);
    this.convSearchQuery.set("");
  }

  ngAfterViewInit(): void {
    // ResizeObserver for the right pane so paneWidth tracks layout changes
    if (this.rightPane?.nativeElement && typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.measurePaneWidth());
      this.resizeObserver.observe(this.rightPane.nativeElement);
    }
    this.measurePaneWidth();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.cleanupResize();
    if (this.focusedClearTimer) clearTimeout(this.focusedClearTimer);
  }

  /* =================== Messages scroll wiring =================== */

  onMessagesScroll(): void {
    const el = this.messagesScroll?.nativeElement;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    this.isAtBottom.set(dist < 60);
  }

  scrollToBottom(behavior: ScrollBehavior = "smooth"): void {
    const el = this.messagesScroll?.nativeElement;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    this.isAtBottom.set(true);
  }

  /** Briefly highlight + scroll a message into view. Called when navigating
   *  from Threads / Mentions / Search rows. The highlight auto-clears after
   *  ~2 seconds so the row goes back to normal. */
  focusMessage(msgId: string): void {
    if (this.focusedClearTimer) clearTimeout(this.focusedClearTimer);
    this.focusedMsgId.set(msgId);
    // Wait a frame so the message-bubble exists in the DOM, then scroll.
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(msgId)}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    this.focusedClearTimer = setTimeout(() => this.focusedMsgId.set(null), 2200);
  }

  private measurePaneWidth(): void {
    const el = this.rightPane?.nativeElement;
    if (!el) { this.paneWidth.set(9999); return; }
    const w = el.getBoundingClientRect().width;
    if (w > 0) this.paneWidth.set(w);
  }

  /* =================== Resize wiring =================== */

  private resizeMode: "list" | "thread" | null = null;
  private resizeStartX = 0;
  private resizeStartW = 0;

  /** Start dragging the LIST pane resize handle (right edge). */
  onStartListResize(e: MouseEvent): void {
    e.preventDefault();
    this.resizeMode = "list";
    this.resizeStartX = e.clientX;
    this.resizeStartW = this.state.sidebarWidth();
    this.state.sidebarResizing.set(true);
    document.body.classList.add("is-resizing");
  }

  /** Start dragging the THREAD panel resize handle (left edge). */
  onStartThreadResize(e: MouseEvent): void {
    e.preventDefault();
    this.resizeMode = "thread";
    this.resizeStartX = e.clientX;
    this.resizeStartW = this.state.threadWidth();
    this.state.threadResizing.set(true);
    document.body.classList.add("is-resizing");
  }

  @HostListener("document:mousemove", ["$event"]) onMouseMove(e: MouseEvent): void {
    if (!this.resizeMode) return;
    const delta = e.clientX - this.resizeStartX;
    if (this.resizeMode === "list") {
      const next = Math.max(320, Math.min(620, this.resizeStartW + delta));
      this.state.sidebarWidth.set(next);
    } else if (this.resizeMode === "thread") {
      // Thread panel grows as we drag left, so subtract delta
      const next = Math.max(320, Math.min(640, this.resizeStartW - delta));
      this.state.threadWidth.set(next);
    }
  }

  @HostListener("document:mouseup")        onMouseUp(): void { this.cleanupResize(); }
  @HostListener("document:mouseleave")     onMouseLeave(): void { this.cleanupResize(); }
  @HostListener("window:blur")             onWindowBlur(): void { this.cleanupResize(); }

  private cleanupResize(): void {
    if (!this.resizeMode) return;
    this.resizeMode = null;
    this.state.sidebarResizing.set(false);
    this.state.threadResizing.set(false);
    document.body.classList.remove("is-resizing");
  }

  /* =================== Day-grouped message render =================== */

  dayGroups = computed<DayGroup[]>(() => {
    const msgs = this.state.currentMessages();
    const q = this.convSearchQuery().trim().toLowerCase();
    const filtered = q
      ? msgs.filter((m) => {
          const haystack = (m.text || "") + " " +
            (m.html ? m.html.replace(/<[^>]+>/g, " ") : "");
          return haystack.toLowerCase().includes(q);
        })
      : msgs;
    const groups: DayGroup[] = [];
    let lastKey: string | null = null;
    for (const m of filtered) {
      const key = getDayKey(m.time);
      if (key !== lastKey) {
        groups.push({ key, label: formatDayLabel(key), messages: [] });
        lastKey = key;
      }
      groups[groups.length - 1].messages.push(m);
    }
    return groups;
  });

  /** Total messages in the current conv that match the in-conv search query. */
  convSearchMatchCount = computed<number>(() => {
    const q = this.convSearchQuery().trim().toLowerCase();
    if (!q) return 0;
    return this.state.currentMessages().filter((m) => {
      const haystack = (m.text || "") + " " +
        (m.html ? m.html.replace(/<[^>]+>/g, " ") : "");
      return haystack.toLowerCase().includes(q);
    }).length;
  });

  lastMessageFromOther = computed<boolean>(() => {
    const msgs = this.state.currentMessages();
    if (msgs.length === 0) return false;
    const last = msgs[msgs.length - 1];
    return last.sender !== "me" && last.sender !== "airliftai";
  });

  replyingTo = computed(() => {
    const r = this.state.replyingTo();
    if (!r) return null;
    const msgs = this.state.messagesByConv()[r.convId] || [];
    const target = msgs.find((m) => m.id === r.msgId);
    if (!target) return null;
    const senderId = target.sender || "";
    const senderName = (SENDERS[senderId]?.name) || senderId;
    return {
      msgId: r.msgId,
      senderName,
      senderId,
      text: target.text || (target.html ? target.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : ""),
    };
  });

  threadParent = computed<Message | null>(() => {
    const id = this.state.showThread();
    if (!id) return null;
    const msgs = this.state.currentMessages();
    return msgs.find((m) => m.id === id) || null;
  });

  /* =================== Handlers =================== */

  onReply(e: { msg: Message; sender: any }): void {
    const conv = this.state.currentConv();
    if (!conv) return;
    this.state.setReplyingTo(e.msg.id, conv.id);
  }

  onSend(payload: { html: string; text: string }): void {
    const conv = this.state.currentConv();
    if (!conv) return;
    const id = `m-${Date.now()}`;
    const stripped = payload.html.replace(/<[^>]+>/g, "").trim();
    const msg: Message = {
      id, sender: "me", time: "now",
      ...(stripped !== payload.text || /<(strong|em|u|s|code|ul|ol|li|table|h[1-3]|blockquote|span|a)\b/i.test(payload.html)
        ? { html: payload.html }
        : { text: payload.text }),
    };
    this.state.appendMessage(conv.id, msg);
    this.state.clearDraft(conv.id);
    this.state.setReplyingTo(null, null);

    // AI auto-response — when the active conversation is an AI chat, generate
    // a contextual fake reply based on keywords in the user's message.
    if (conv.isAI) {
      const aiMsg = this.buildAIReply(payload.text);
      setTimeout(() => {
        this.state.appendMessage(conv.id, aiMsg);
      }, 600);
    }
  }

  /**
   * Mock AI reply generator — keyword-based routing to chart / list / rated /
   * generic responses. Mirrors the React demo's behavior so AI sessions feel
   * alive without a real backend.
   */
  private buildAIReply(userText: string): Message {
    const lower = (userText || "").toLowerCase();
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const baseId = `m-ai-${Date.now()}`;

    if (
      lower.includes("chart") ||
      lower.includes("pipeline") ||
      lower.includes("revenue") ||
      (lower.includes("sales") && lower.includes("region"))
    ) {
      return {
        id: baseId, sender: "airliftai", type: "ai-chart", time,
        chartTitle: "Sales Pipeline by Stage",
        chartSubtitle: "Live data · refreshed just now",
        chartData: [
          { label: "Prospect",    value: 312000, color: "#94a3b8" },
          { label: "Qualified",   value: 245000, color: "#3b82f6" },
          { label: "Proposal",    value: 178000, color: "#8b5cf6" },
          { label: "Negotiation", value: 96000,  color: "#f59e0b" },
          { label: "Closed-won",  value: 64000,  color: "#10b981" },
        ],
        summary: "Total weighted pipeline: $521K. Negotiation stage is healthiest — 67% close rate historically.",
      };
    }

    if (lower.includes("task") || lower.includes("todo") || lower.includes("activit") || lower.includes("today")) {
      return {
        id: baseId, sender: "airliftai", type: "ai-list", time,
        listTitle: "Your Tasks for Today",
        listSubtitle: "5 active items",
        items: [
          { icon: "target",   title: "Review Origin Software PRs",    meta: "Tagged by Ram",       status: "active"  },
          { icon: "phone",    title: "Call Northstar Inc.",           meta: "1:00 PM",             status: "active"  },
          { icon: "users",    title: "Standup with Origin Dev team",  meta: "10:30 AM",            status: "done"    },
          { icon: "check",    title: "Reply to Ashwath about layout", meta: "Yesterday's request", status: "pending" },
          { icon: "trending", title: "Pipeline review with manager",  meta: "5:00 PM",             status: "pending" },
        ],
        summary: "1 item is overdue (Ashwath's layout reply). Suggest tackling that first.",
      };
    }

    if (lower.includes("draft") || lower.includes("follow") || lower.includes("email") || lower.includes("reply") || lower.includes("write")) {
      return {
        id: baseId, sender: "airliftai", type: "ai-rated", time,
        text: "Here's a draft you can adapt:\n\nHi [Name],\n\nThanks for the time earlier this week. I wanted to follow up on the points we discussed and confirm next steps from our side.\n\nWould a quick 15-minute call this week work to align? Happy to share a tighter agenda beforehand.\n\nBest,\n[Your name]",
        sources: ["Recent thread context", "Sales playbook v3"],
      };
    }

    return {
      id: baseId, sender: "airliftai", type: "ai-rated", time,
      text: `Here's what I found based on your team's recent activity:\n\n• ${userText.length > 60 ? "That's a detailed question." : "Quick take:"} I can pull data from your conversations, calendar, and Drive to help.\n• Try asking about pipeline, today's tasks, or to draft a follow-up.\n• I'll keep my responses grounded in what's actually in your workspace.\n\nWant me to dig deeper into any of those?`,
      sources: ["Workspace context"],
    };
  }

  onDraftChange(html: string): void {
    const conv = this.state.currentConv();
    if (!conv) return;
    if (!html) this.state.clearDraft(conv.id);
    else this.state.setDraft(conv.id, { text: html.replace(/<[^>]+>/g, " "), html });
  }

  onOpenThreadFromList(e: { msgId: string; convId: string }): void {
    this.state.setActiveConv(e.convId);
    setTimeout(() => {
      this.state.openThread(e.msgId);
      this.focusMessage(e.msgId);
    }, 0);
  }

  onPickFromSearch(convId: string): void {
    // Coming from the dashboard or search — switch view to home and open conv
    if (this.state.view() === "dashboard") this.state.setView("home");
    this.state.setActiveConv(convId);
  }

  onNewAIChat(): void { this.state.setActiveConv("ai-new"); }

  onHeaderBack(): void {
    // Close any open side panel first; otherwise close the active conv (mobile-style back)
    if (this.state.showThread() || this.state.showBoard() || this.state.showFollowing()
        || this.state.showTasks() || this.state.showPinned() || this.state.showSharedMedia()) {
      this.state.closeThread(); this.state.closeBoard(); this.state.closeFollowing();
      this.state.closeTasks();  this.state.closePinned(); this.state.closeSharedMedia();
      return;
    }
    this.state.setActiveConv(null);
  }

  markUnread(convId: string): void {
    this.state.conversations.update((list) =>
      list.map((c) => (c.id === convId ? { ...c, unread: true } : c))
    );
    this.toast.show("Marked as unread");
  }

  /* ---- Conv-level header menu actions (demo: most just toast) ---- */
  onHideConv(_id: string): void   { this.toast.show("Conversation hidden"); }
  onArchiveConv(_id: string): void{ this.toast.show("Conversation archived"); }
  onLeaveSpace(_id: string): void { this.toast.show("Left space"); }
  onBlockReport(): void           { this.toast.show("Reported & blocked"); }
  onClearHistory(_id: string): void {
    if (confirm("Clear all messages in this chat?")) {
      this.toast.show("Chat history cleared");
    }
  }

  /* ---- Dashboard handlers ---- */

  onMarkConvRead(convId: string): void { this.state.markConvRead(convId); }

  onGoToTasks(): void {
    if (this.state.currentConv()) {
      this.state.setView("home");
      this.state.openTasks();
    } else this.toast.show("Open a conversation to see its tasks");
  }

  onTakeOverSession(s: any): void {
    this.state.takeOverPortalSession(s.id, "me");
    this.toast.show(`Taking over: ${s.customer}`);
  }
  onContinueAI(s: any): void {
    this.state.continueAIPortalSession(s.id);
    this.toast.show(`AI continues with ${s.customer}`);
  }
  onResolveSession(s: any): void {
    this.state.resolvePortalSession(s.id);
    this.toast.show(`Resolved: ${s.customer}`);
  }
  onReassignSession(s: any): void {
    // Demo: cycling through reassign clears the assignee → moves to the
    // awaiting queue. In production this would open a picker.
    this.state.reassignPortalSession(s.id, null);
    this.toast.show(`Reassigning ${s.customer}…`);
  }

  /* =================== Keyboard shortcuts =================== */

  @HostListener("document:keydown", ["$event"]) onKeydown(e: KeyboardEvent): void {
    // Cmd/Ctrl + K → global search modal
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      this.state.openSearch();
      return;
    }
    // Cmd/Ctrl + F → toggle in-conversation search (only when a conv is active)
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f" && this.state.currentConv()) {
      e.preventDefault();
      this.toggleConvSearch();
      return;
    }
    // Esc → close active modal/panel (in priority order)
    if (e.key === "Escape") {
      if (this.state.showSearch())       { this.state.closeSearch(); return; }
      if (this.convSearchOpen())         { this.closeConvSearch(); return; }
      if (this.state.showThread())       { this.state.closeThread(); return; }
      if (this.state.showBoard())        { this.state.closeBoard(); return; }
      if (this.state.showFollowing())    { this.state.closeFollowing(); return; }
      if (this.state.showTasks())        { this.state.closeTasks(); return; }
      if (this.state.showPinned())       { this.state.closePinned(); return; }
      if (this.state.showSharedMedia())  { this.state.closeSharedMedia(); return; }
    }
  }
}
