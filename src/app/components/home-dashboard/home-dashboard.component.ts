import {
  ChangeDetectionStrategy, Component, ElementRef, EventEmitter,
  Input, OnDestroy, OnInit, Output, ViewChild, computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { SENDERS } from "../../data/senders";
// Dashboard mock seeds — commented out so the dashboard reads only from
// live data. Restore by un-commenting + re-spreading into the readonly
// fields below if you want the legacy "URGENT" / mentions / activity
// feed widgets back without a backend.
//
// import {
//   MENTIONS_DATA, CUSTOMER_PORTAL_SESSIONS, AI_UNREAD_SUMMARIES,
//   ACTIVITY_FEED,
// } from "../../data/dashboard";
import { urgencyOf } from "../../data/mode-info";
import { Conversation, Sender, ConvTask, MentionEntry, PortalSession, AISummary, ActivityItem, UserRole } from "../../models/types";

import { IconComponent } from "../icon/icon.component";
import { AvatarComponent } from "../avatar/avatar.component";
import { KpiCardComponent } from "../kpi-card/kpi-card.component";
import { ModeBadgeComponent } from "../mode-badge/mode-badge.component";
import { DashSectionComponent } from "../dash-section/dash-section.component";
import { EmptyMiniComponent } from "../empty-mini/empty-mini.component";
import { HandoffQueueComponent } from "../handoff-queue/handoff-queue.component";

interface OpenTask extends ConvTask {
  convId: string;
  convName: string;
}

type AutoSec = 0 | 30 | 60 | 300;

interface ActivityIconStyle { iconName: string; bg: string; text: string; }

/**
 * HomeDashboard — the single largest component (~900 lines). Mirrors React
 * `<HomeDashboard>` 1:1.
 *
 * Layout sections, top-down:
 *  1. Sticky header with greeting / refresh / auto-refresh / role
 *  2. Hero priority banner (1 of 5 states based on what's most urgent)
 *  3. KPI strip (4 cards, role-aware)
 *  4. "Today" stat strip
 *  5. Scrollable content:
 *      - URGENT (awaiting handoff) — only for CS users with handoff perm
 *      - YOUR QUEUE (assigned to you)
 *      - 2-column: My open tasks + AI insights · unread chats
 *      - Recent activity feed
 *      - Resolved by you today (CS only)
 *
 * Also handles:
 *  - Manual refresh button (with spinning animation)
 *  - Auto-refresh dropdown (Off / 30s / 1m / 5m) using setInterval
 *  - 15s tick to keep the "Updated Xs ago" label fresh
 *  - KPI clicks scroll to the matching content section via ViewChild refs
 */
@Component({
  selector: "app-home-dashboard",
  standalone: true,
  imports: [
    CommonModule, IconComponent, AvatarComponent, KpiCardComponent,
    ModeBadgeComponent, DashSectionComponent, EmptyMiniComponent,
    HandoffQueueComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Stretch the host to full height so the inner `flex-1 overflow-y-auto`
  // scroll container actually has bounded height — without this, the
  // dashboard expands to fit its content and never scrolls.
  host: { class: "flex-1 flex min-w-0 min-h-0 h-full" },
  templateUrl: "./home-dashboard.component.html",
  styleUrl: "./home-dashboard.component.css",
})
export class HomeDashboardComponent implements OnInit, OnDestroy {
  state = inject(ChatStateService);

  /* ===================== Inputs / Outputs ===================== */
  @Input() currentUserId = "me";
  @Input() currentUserName = "Suresh";
  @Input() isMobile = false;
  @Input() enableRoleSwitch = true;

  /** Derive from current user role rather than passing as a fixed prop. */
  get canHandleCustomerHandoffs(): boolean {
    return this.state.canHandleCustomerHandoffs();
  }

  @Output() back = new EventEmitter<void>();
  @Output() openConv = new EventEmitter<string>();
  @Output() takeOver = new EventEmitter<PortalSession>();
  @Output() continueAI = new EventEmitter<PortalSession>();
  @Output() resolveSession = new EventEmitter<PortalSession>();
  @Output() reassign = new EventEmitter<PortalSession>();
  @Output() markConvRead = new EventEmitter<string>();
  @Output() goToMentions = new EventEmitter<void>();
  @Output() goToTasks = new EventEmitter<void>();
  @Output() markAllRead = new EventEmitter<void>();
  @Output() roleChanged = new EventEmitter<UserRole>();

  /* ============= ViewChild scroll targets ============= */
  @ViewChild("urgentRef")     urgentRef?: ElementRef<HTMLElement>;
  @ViewChild("queueRef")      queueRef?: ElementRef<HTMLElement>;
  @ViewChild("tasksRef")      tasksRef?: ElementRef<HTMLElement>;
  @ViewChild("aiInsightsRef") aiInsightsRef?: ElementRef<HTMLElement>;

  /* ============= Local UI state ============= */
  isRefreshing = signal(false);
  lastRefreshedAt = signal<Date>(new Date());
  /** Tick counter — bumped every 15s by setInterval to refresh the
   *  "Updated Xs ago" label which is purely time-derived. */
  tickNow = signal(0);
  autoRefreshSec = signal<AutoSec>(0);
  autoMenuOpen = signal(false);

  private tickTimer: any = null;
  private autoTimer: any = null;

  readonly AUTO_OPTIONS: { v: AutoSec; label: string }[] = [
    { v: 0,   label: "Off" },
    { v: 30,  label: "Every 30 seconds" },
    { v: 60,  label: "Every 1 minute" },
    { v: 300, label: "Every 5 minutes" },
  ];

  /* ============= Re-export helpers used in the template ============= */
  urgencyOf = urgencyOf;

  /* ============= Static data sources ============= */
  // Empty — the original mock seeds (MENTIONS_DATA / AI_UNREAD_SUMMARIES /
  // ACTIVITY_FEED) are commented out at the import block above. Each of
  // these will hydrate from a real endpoint when the corresponding
  // backend feature lands:
  //   mentionsData  -> GET /mentions?user_ref=op:2
  //   aiSummaries   -> GET /channels/<id>/ai-summary
  //   activityFeed  -> GET /activity?user_ref=op:2
  // Until then the dashboard widgets render their empty-state UI.
  readonly mentionsData: MentionEntry[] = [];
  readonly aiSummaries: Record<string, AISummary> = {};
  readonly activityFeed: ActivityItem[] = [];
  /** Live portal sessions from state — mutated by takeOver / continueAI /
   *  resolve / reassign actions so the dashboard updates as operators work. */
  get portalSessions(): PortalSession[] { return this.state.portalSessions(); }

  /* ===================== Computeds ===================== */

  get meSender(): Sender | null {
    return SENDERS[this.currentUserId] || null;
  }

  greeting = computed(() => {
    // Re-evaluate once per tick so it catches the morning→afternoon switch
    this.tickNow();
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  });
  dateStr = computed(() => {
    this.tickNow();
    return new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  });
  timeStr = computed(() => {
    this.tickNow();
    return new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  });

  freshnessLabel = computed(() => {
    this.tickNow(); // re-eval every tick
    const ageSec = Math.max(0, Math.floor((Date.now() - this.lastRefreshedAt().getTime()) / 1000));
    if (ageSec < 5) return "Just now";
    if (ageSec < 60) return `${ageSec}s ago`;
    const ageMin = Math.floor(ageSec / 60);
    if (ageMin < 60) return `${ageMin}m ago`;
    return `${Math.floor(ageMin / 60)}h ago`;
  });

  roleLabel = computed(() => this.state.userRole() === "customer_support" ? "Customer Support" : "Operations");

  unreadConvs = computed<Conversation[]>(() =>
    this.state.conversations().filter((c) => c.unread && !(c as any).hidden && !(c as any).archived)
  );

  myOpenTasks = computed<OpenTask[]>(() => {
    const out: OpenTask[] = [];
    const map = this.state.convTasks();
    const convs = this.state.conversations();
    for (const [convId, tasks] of Object.entries(map)) {
      const conv = convs.find((c) => c.id === convId);
      if (!conv) continue;
      for (const t of tasks) {
        if (t.assignee === this.currentUserId && !t.done) {
          out.push({ ...t, convId, convName: conv.name });
        }
      }
    }
    return out;
  });

  awaitingHandoff = computed<PortalSession[]>(() =>
    this.canHandleCustomerHandoffs
      ? [...this.portalSessions]
          .filter((s) => s.status === "awaiting_handoff")
          .sort((a, b) => b.waitingMinutes - a.waitingMinutes)
      : []
  );
  assignedToMe = computed<PortalSession[]>(() =>
    this.canHandleCustomerHandoffs
      ? [...this.portalSessions]
          .filter((s) => s.status === "assigned" && s.assignee === this.currentUserId)
          .sort((a, b) => b.waitingMinutes - a.waitingMinutes)
      : []
  );
  activeMine = computed<PortalSession[]>(() =>
    this.canHandleCustomerHandoffs
      ? this.portalSessions.filter((s) => s.status === "active" && s.assignee === this.currentUserId)
      : []
  );
  resolvedToday = computed<PortalSession[]>(() =>
    this.canHandleCustomerHandoffs
      ? this.portalSessions.filter((s) => s.status === "resolved" && s.assignee === this.currentUserId)
      : []
  );

  myMentions = computed<MentionEntry[]>(() => {
    const meName = (SENDERS[this.currentUserId] || {} as Sender).name || "";
    const aliases = new Set<string>();
    aliases.add(meName.toLowerCase());
    meName.toLowerCase().split(/\s+/).filter(Boolean).forEach((t) => aliases.add(t));
    if (this.currentUserId === "me") {
      ["suresh", "rajsuresh", "rajsuresh airlift", "suresh r"].forEach((a) => aliases.add(a));
    }
    const matchesMe = (m: MentionEntry) =>
      (m.mentions || []).some((name) => {
        const n = (name || "").toLowerCase();
        if (aliases.has(n)) return true;
        for (const a of aliases) {
          if (a.length >= 4 && n.includes(a)) return true;
        }
        return false;
      });
    return this.mentionsData.filter(matchesMe).slice(0, 8);
  });

  overdueTasks = computed<OpenTask[]>(() =>
    this.myOpenTasks().filter((t) =>
      t.due === "Yesterday" || (t.due ? /^[A-Z][a-z]{2}/.test(t.due) : false)
    )
  );
  todayTasks = computed<OpenTask[]>(() => this.myOpenTasks().filter((t) => t.due === "Today"));

  followingThreadsCount = computed(() => {
    let n = 0;
    for (const msgs of Object.values(this.state.messagesByConv())) {
      for (const m of msgs) if (m.thread) n++;
    }
    return n;
  });

  /* ============= Live data sets (chat-service) ============= */

  /** Live handoff queue split by status. The dashboard renders three
   *  cards for these so the agent sees the same numbers as the queue
   *  side panel without flipping between views. Each falls back to []
   *  while loadDashboardLive hasn't run (or in offline mode). */
  liveAwaitingHandoff = computed(() =>
    (this.state.liveHandoffs() ?? []).filter((h) => h.status === "pending"),
  );
  liveClaimedHandoff = computed(() =>
    (this.state.liveHandoffs() ?? []).filter((h) => h.status === "claimed"),
  );
  liveResolvedToday = computed(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const cutoff = start.getTime();
    return (this.state.liveHandoffs() ?? []).filter(
      (h) => h.status === "resolved" && h.resolved_on
        && new Date(h.resolved_on).getTime() >= cutoff,
    );
  });
  /** Median + max wait time across pending handoffs — surfaces "people
   *  are waiting too long" without the agent having to skim the list. */
  liveQueueWaitMinutes = computed(() => {
    const waits = this.liveAwaitingHandoff()
      .map((h) => h.wait_minutes ?? 0)
      .filter((n) => n > 0)
      .sort((a, b) => a - b);
    if (waits.length === 0) return { median: 0, max: 0 };
    const mid = Math.floor(waits.length / 2);
    const median = waits.length % 2 === 0
      ? Math.round((waits[mid - 1] + waits[mid]) / 2)
      : waits[mid];
    return { median, max: waits[waits.length - 1] };
  });

  /** Live total unread + per-channel breakdown (sidebar already shows
   *  the breakdown; dashboard surfaces the headline number for the
   *  KPI strip and a "channels with unread" count). */
  liveTotalUnread = computed(() => this.state.liveTotalUnread());
  liveUnreadChannels = computed(() => {
    const map = this.state.liveUnreadByChannel() ?? {};
    return Object.values(map).filter((n) => n > 0).length;
  });

  /** Live saved-messages count for a "Saved (N)" KPI. */
  liveSavedCount = computed(() => this.state.liveSavedCount());

  /** Channel-mix breakdown — direct / spaces / customer / ai. Lets the
   *  dashboard render a small per-type chip strip so the agent knows
   *  what kinds of conversations they're in. */
  channelMix = computed(() => {
    const list = this.state.conversations();
    const mix = { direct: 0, space: 0, customer: 0, ai: 0, external_group: 0 };
    for (const c of list) {
      switch (c.type) {
        case "external":
          mix.customer++;
          break;
        case "external-group":
          mix.external_group++;
          break;
        case "space":
          mix.space++;
          break;
        default:
          if (c.isAI) mix.ai++;
          else mix.direct++;
      }
    }
    return mix;
  });

  /** Most-recently-active channels (top 5 by last message activity).
   *  Drives a "Recent activity" card so the agent has a one-click jump
   *  to wherever conversation is happening right now. */
  recentActivity = computed(() =>
    [...this.state.conversations()]
      .filter((c) => !!c.lastTime)
      .slice(0, 5),
  );

  filteredFeed = computed<ActivityItem[]>(() => {
    if (this.canHandleCustomerHandoffs) return this.activityFeed; // CS sees everything
    const allowed = new Set(["message_received", "task_completed", "ai_suggestion"]);
    return this.activityFeed.filter((a) => allowed.has(a.type));
  });

  heroBannerType = computed<
    "urgent_handoff" | "assigned" | "mention" | "overdue" | "today" | "unread" | "clear"
  >(() => {
    if (this.canHandleCustomerHandoffs && this.awaitingHandoff().length > 0) return "urgent_handoff";
    if (this.canHandleCustomerHandoffs && this.assignedToMe().length > 0)    return "assigned";
    if (this.myMentions().length > 0)  return "mention";
    if (this.overdueTasks().length > 0) return "overdue";
    if (this.todayTasks().length > 0)   return "today";
    if (this.unreadConvs().length > 0)  return "unread";
    return "clear";
  });

  /* ============= KPI hint computeds ============= */
  queueHint = computed(() => {
    const arr = this.assignedToMe();
    if (arr.length === 0) return "Nothing assigned";
    const first = arr[0].customer.split(" ")[0];
    return `${first} +${arr.length - 1 || 0} more`;
  });
  unreadHint = computed(() => {
    const arr = this.unreadConvs();
    if (arr.length === 0) return "All read";
    const customerCount = arr.filter((c) => c.isExternal).length;
    return `${customerCount} from customers`;
  });
  opsUnreadHint = computed(() => {
    const arr = this.unreadConvs();
    if (arr.length === 0) return "All caught up";
    const high = arr.filter((c) => this.aiSummaries[c.id]?.severity === "high").length;
    return `${high} high-priority`;
  });
  opsTasksTone = computed(() => {
    if (this.overdueTasks().length > 0) return "red" as const;
    if (this.myOpenTasks().length > 0) return "amber" as const;
    return "gray" as const;
  });
  opsTasksHint = computed(() => {
    if (this.overdueTasks().length > 0) return `${this.overdueTasks().length} overdue`;
    if (this.todayTasks().length > 0)   return `${this.todayTasks().length} due today`;
    return "No open tasks";
  });

  /* ===================== Lifecycle ===================== */

  ngOnInit(): void {
    // 15-second tick to refresh "Updated Xs ago" / clock-derived labels
    this.tickTimer = setInterval(() => this.tickNow.update((n) => n + 1), 15_000);
  }

  ngOnDestroy(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.autoTimer) clearInterval(this.autoTimer);
  }

  /* ===================== Refresh logic ===================== */

  handleRefresh(): void {
    if (this.isRefreshing()) return;
    this.isRefreshing.set(true);
    // Simulate network — match React's perceived behaviour
    setTimeout(() => {
      this.lastRefreshedAt.set(new Date());
      this.isRefreshing.set(false);
    }, 600);
  }

  setAuto(v: AutoSec): void {
    this.autoRefreshSec.set(v);
    this.autoMenuOpen.set(false);
    if (this.autoTimer) { clearInterval(this.autoTimer); this.autoTimer = null; }
    if (v > 0) {
      this.autoTimer = setInterval(() => this.handleRefresh(), v * 1000);
    }
  }

  /* ===================== Scroll-to ===================== */

  scrollTo(target?: ElementRef<HTMLElement>): void {
    target?.nativeElement?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ===================== Style helpers ===================== */

  autoBtnClass(): string {
    const base = "inline-flex items-center gap-1 h-8 px-2 rounded-full text-[11px] font-medium ring-1 transition";
    return this.autoRefreshSec() > 0
      ? `${base} bg-blue-50 text-blue-700 ring-blue-200 hover:bg-blue-100`
      : `${base} bg-white text-gray-500 ring-gray-200 hover:bg-gray-50`;
  }

  autoOptionClass(v: AutoSec): string {
    const base = "w-full text-left px-3 py-1.5 text-[12px] hover:bg-gray-50 transition flex items-center justify-between";
    return this.autoRefreshSec() === v
      ? `${base} text-blue-600 font-medium`
      : `${base} text-gray-700`;
  }

  urgentCardClass(s: PortalSession): string {
    const u = urgencyOf(s.waitingMinutes);
    return `relative bg-white rounded-xl ring-1 ring-gray-200 hover:ring-red-200 hover:shadow-sm overflow-hidden transition flex flex-col ${u.bg}`;
  }

  dueClass(due: string): string {
    if (due === "Today")     return "text-amber-600 font-medium";
    if (due === "Yesterday") return "text-red-600 font-medium";
    return "";
  }

  aiSummaryFor(convId: string): AISummary | null { return this.aiSummaries[convId] || null; }

  aiSummaryRowClass(s: AISummary): string {
    const sev = s.severity === "high" ? "border-l-red-500"
              : s.severity === "medium" ? "border-l-amber-500"
              : "border-l-gray-300";
    return `p-3 hover:bg-gray-50 transition border-l-[3px] ${sev}`;
  }

  activityIcon(kind: string): ActivityIconStyle {
    switch (kind) {
      case "alert": return { iconName: "shield-alert",   bg: "bg-red-100",     text: "text-red-700" };
      case "msg":   return { iconName: "message-square", bg: "bg-blue-100",    text: "text-blue-700" };
      case "ai":    return { iconName: "sparkles",       bg: "bg-purple-100",  text: "text-purple-700" };
      case "check": return { iconName: "check-circle",   bg: "bg-emerald-100", text: "text-emerald-700" };
      case "user":  return { iconName: "users",          bg: "bg-amber-100",   text: "text-amber-700" };
      default:      return { iconName: "message-square", bg: "bg-blue-100",    text: "text-blue-700" };
    }
  }

  /* ===================== Role switcher ===================== */
  onChangeRole(): void {
    const next: UserRole = this.state.userRole() === "customer_support" ? "operations" : "customer_support";
    this.state.userRole.set(next);
    this.roleChanged.emit(next);
  }
}
