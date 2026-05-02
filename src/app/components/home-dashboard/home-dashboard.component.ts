import {
  ChangeDetectionStrategy, Component, ElementRef, EventEmitter,
  Input, OnDestroy, OnInit, Output, ViewChild, computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { SENDERS } from "../../data/senders";
import {
  MENTIONS_DATA, CUSTOMER_PORTAL_SESSIONS, AI_UNREAD_SUMMARIES,
  ACTIVITY_FEED,
} from "../../data/dashboard";
import { urgencyOf } from "../../data/mode-info";
import { Conversation, Sender, ConvTask, MentionEntry, PortalSession, AISummary, ActivityItem, UserRole } from "../../models/types";

import { IconComponent } from "../icon/icon.component";
import { AvatarComponent } from "../avatar/avatar.component";
import { KpiCardComponent } from "../kpi-card/kpi-card.component";
import { ModeBadgeComponent } from "../mode-badge/mode-badge.component";
import { DashSectionComponent } from "../dash-section/dash-section.component";
import { EmptyMiniComponent } from "../empty-mini/empty-mini.component";

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
 *  1. Sticky header with greeting / refresh / auto-refresh / on-duty / role
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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Stretch the host to full height so the inner `flex-1 overflow-y-auto`
  // scroll container actually has bounded height — without this, the
  // dashboard expands to fit its content and never scrolls.
  host: { class: "flex-1 flex min-w-0 min-h-0 h-full" },
  template: `
    <div class="flex-1 flex flex-col bg-gray-50 overflow-hidden h-full w-full min-h-0">

      <!-- ============== STICKY HEADER ============== -->
      <div class="bg-gradient-to-b from-white to-gray-50 border-b border-gray-200 sticky top-0 z-10">
        <div class="max-w-[920px] mx-auto px-4 sm:px-6 pt-4 sm:pt-5 pb-3">

          <!-- Top strip -->
          <div class="flex items-center gap-3 mb-3">
            <button *ngIf="isMobile"
                    (click)="back.emit()"
                    class="p-1.5 -ml-1 rounded-full hover:bg-gray-100 shrink-0">
              <app-icon name="arrow-left" [size]="18" class="text-gray-700"></app-icon>
            </button>

            <app-avatar [user]="meSender" [size]="36"></app-avatar>

            <div class="min-w-0 flex-1">
              <h1 class="text-[16px] sm:text-[18px] font-semibold text-gray-900 leading-tight truncate">
                {{ greeting() }}, {{ currentUserName }}
              </h1>
              <p class="text-[12px] text-gray-500 leading-tight flex items-center gap-1.5 flex-wrap">
                <span>{{ dateStr() }} · {{ timeStr() }}</span>
                <span class="text-gray-300">·</span>
                <span [class.text-blue-600]="isRefreshing()">
                  {{ isRefreshing() ? 'Refreshing…' : 'Updated ' + freshnessLabel() }}
                </span>
              </p>
            </div>

            <!-- Refresh + auto-refresh -->
            <div class="inline-flex items-center gap-1 shrink-0">
              <button
                (click)="handleRefresh()"
                [disabled]="isRefreshing()"
                class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-60 transition"
                title="Refresh dashboard"
                aria-label="Refresh dashboard"
              >
                <app-icon name="refresh-cw" [size]="14" [class.animate-spin]="isRefreshing()"></app-icon>
              </button>

              <div class="relative hidden sm:block">
                <button
                  (click)="autoMenuOpen.set(!autoMenuOpen())"
                  [class]="autoBtnClass()"
                  title="Auto-refresh"
                >
                  <span *ngIf="autoRefreshSec() > 0; else autoOff" class="flex items-center gap-1">
                    <span class="relative flex">
                      <span class="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                      <span class="absolute inset-0 h-1.5 w-1.5 rounded-full bg-blue-500 animate-ping opacity-60"></span>
                    </span>
                    {{ autoRefreshSec() < 60 ? autoRefreshSec() + 's' : (autoRefreshSec() / 60) + 'm' }}
                  </span>
                  <ng-template #autoOff><span>Auto</span></ng-template>
                  <app-icon name="chevron-down" [size]="11" class="opacity-60"></app-icon>
                </button>

                <ng-container *ngIf="autoMenuOpen()">
                  <div class="fixed inset-0 z-20" (click)="autoMenuOpen.set(false)"></div>
                  <div class="absolute right-0 top-full mt-1 z-30 w-44 bg-white rounded-xl ring-1 ring-gray-200 shadow-lg overflow-hidden py-1">
                    <div class="px-3 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Auto-refresh</div>
                    <button *ngFor="let o of AUTO_OPTIONS"
                            (click)="setAuto(o.v)"
                            [class]="autoOptionClass(o.v)">
                      <span>{{ o.label }}</span>
                      <app-icon *ngIf="autoRefreshSec() === o.v" name="check" [size]="12"></app-icon>
                    </button>
                  </div>
                </ng-container>
              </div>
            </div>

            <!-- On-duty pill -->
            <button
              class="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[12px] font-medium ring-1 ring-emerald-200 hover:bg-emerald-100 transition shrink-0"
              title="Change availability"
            >
              <span class="relative flex">
                <span class="h-2 w-2 rounded-full bg-emerald-500"></span>
                <span class="absolute inset-0 h-2 w-2 rounded-full bg-emerald-500 animate-ping opacity-50"></span>
              </span>
              On duty
              <app-icon name="chevron-down" [size]="11" class="opacity-60"></app-icon>
            </button>

            <!-- Role switcher -->
            <button *ngIf="enableRoleSwitch"
                    (click)="onChangeRole()"
                    class="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 text-gray-600 text-[12px] ring-1 ring-gray-200 hover:bg-gray-100 transition shrink-0"
                    title="Switch role (demo only)">
              <app-icon name="users" [size]="11"></app-icon>
              {{ roleLabel() }}
              <app-icon name="chevron-down" [size]="11" class="opacity-60"></app-icon>
            </button>
          </div>

          <!-- ============== HERO BANNER ============== -->
          <ng-container *ngTemplateOutlet="heroBanner"></ng-container>

          <!-- ============== KPI STRIP ============== -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <ng-container *ngIf="canHandleCustomerHandoffs; else opsKpis">
              <app-kpi-card
                label="Awaiting"
                [value]="awaitingHandoff().length"
                [tone]="awaitingHandoff().length > 0 ? 'red' : 'gray'"
                [pulse]="awaitingHandoff().length > 0"
                [hint]="awaitingHandoff().length > 0 ? ('Longest: ' + awaitingHandoff()[0].waitingFor) : 'All caught up'"
                [clickable]="awaitingHandoff().length > 0"
                (clicked)="scrollTo(urgentRef)"
              >
                <app-icon name="shield-alert" [size]="14"></app-icon>
              </app-kpi-card>

              <app-kpi-card
                label="Your queue"
                [value]="assignedToMe().length"
                [tone]="assignedToMe().length > 0 ? 'amber' : 'gray'"
                [hint]="queueHint()"
                [clickable]="assignedToMe().length > 0"
                (clicked)="scrollTo(queueRef)"
              >
                <app-icon name="clock" [size]="14"></app-icon>
              </app-kpi-card>

              <app-kpi-card
                label="Unread"
                [value]="unreadConvs().length"
                [tone]="unreadConvs().length > 0 ? 'blue' : 'gray'"
                [hint]="unreadHint()"
                [clickable]="unreadConvs().length > 0"
                (clicked)="scrollTo(aiInsightsRef)"
              >
                <app-icon name="inbox" [size]="14"></app-icon>
              </app-kpi-card>

              <app-kpi-card
                label="Tasks"
                [value]="myOpenTasks().length"
                [tone]="myOpenTasks().length > 0 ? 'purple' : 'gray'"
                [hint]="myOpenTasks().length > 0 ? (todayTasks().length + ' due today') : 'No open tasks'"
                [clickable]="myOpenTasks().length > 0"
                (clicked)="scrollTo(tasksRef)"
              >
                <app-icon name="check-circle-2" [size]="14"></app-icon>
              </app-kpi-card>
            </ng-container>

            <ng-template #opsKpis>
              <app-kpi-card
                label="Unread"
                [value]="unreadConvs().length"
                [tone]="unreadConvs().length > 0 ? 'blue' : 'gray'"
                [pulse]="unreadConvs().length > 3"
                [hint]="opsUnreadHint()"
                [clickable]="unreadConvs().length > 0"
                (clicked)="scrollTo(aiInsightsRef)"
              >
                <app-icon name="inbox" [size]="14"></app-icon>
              </app-kpi-card>

              <app-kpi-card
                label="Mentions"
                [value]="myMentions().length"
                [tone]="myMentions().length > 0 ? 'violet' : 'gray'"
                [hint]="myMentions().length > 0 ? ('Latest: ' + myMentions()[0].date) : 'No new mentions'"
                [clickable]="myMentions().length > 0"
                (clicked)="goToMentions.emit()"
              >
                <app-icon name="at-sign" [size]="14"></app-icon>
              </app-kpi-card>

              <app-kpi-card
                label="Tasks"
                [value]="myOpenTasks().length"
                [tone]="opsTasksTone()"
                [hint]="opsTasksHint()"
                [clickable]="myOpenTasks().length > 0"
                (clicked)="scrollTo(tasksRef)"
              >
                <app-icon name="check-circle-2" [size]="14"></app-icon>
              </app-kpi-card>

              <app-kpi-card
                label="Following"
                [value]="followingThreadsCount()"
                tone="purple"
                [hint]="followingThreadsCount() + ' active thread' + (followingThreadsCount() === 1 ? '' : 's')"
              >
                <app-icon name="message-circle-more" [size]="14"></app-icon>
              </app-kpi-card>
            </ng-template>
          </div>

          <!-- ============== TODAY STRIP ============== -->
          <div class="mt-3 flex items-center gap-3 sm:gap-4 px-1 text-[12px] text-gray-600 flex-wrap">
            <span class="text-[11px] font-bold uppercase tracking-wider text-gray-500">Today</span>
            <ng-container *ngIf="canHandleCustomerHandoffs; else opsToday">
              <span class="flex items-center gap-1.5">
                <app-icon name="check-circle" [size]="11" class="text-emerald-500"></app-icon>
                <span class="font-semibold text-gray-900">{{ resolvedToday().length }}</span>
                <span>resolved</span>
              </span>
              <span class="text-gray-300">·</span>
              <span class="flex items-center gap-1.5">
                <app-icon name="users" [size]="11" class="text-blue-500"></app-icon>
                <span class="font-semibold text-gray-900">{{ activeMine().length }}</span>
                <span>active chats you own</span>
              </span>
              <span class="text-gray-300">·</span>
              <span class="flex items-center gap-1.5">
                <app-icon name="clock" [size]="11" class="text-purple-500"></app-icon>
                <span>Avg response</span>
                <span class="font-semibold text-gray-900">3 min</span>
              </span>
              <span class="text-gray-300 hidden sm:inline">·</span>
              <span class="hidden sm:flex items-center gap-1.5">
                <app-icon name="sparkles" [size]="11" class="text-purple-500"></app-icon>
                <span class="font-semibold text-gray-900">8</span>
                <span>AI assists used</span>
              </span>
            </ng-container>
            <ng-template #opsToday>
              <span class="flex items-center gap-1.5">
                <app-icon name="check-circle" [size]="11" class="text-emerald-500"></app-icon>
                <span class="font-semibold text-gray-900">2</span>
                <span>tasks completed</span>
              </span>
              <span class="text-gray-300">·</span>
              <span class="flex items-center gap-1.5">
                <app-icon name="send" [size]="11" class="text-blue-500"></app-icon>
                <span class="font-semibold text-gray-900">14</span>
                <span>messages sent</span>
              </span>
              <span class="text-gray-300">·</span>
              <span class="flex items-center gap-1.5">
                <app-icon name="message-circle-more" [size]="11" class="text-purple-500"></app-icon>
                <span class="font-semibold text-gray-900">3</span>
                <span>thread replies</span>
              </span>
              <span class="text-gray-300 hidden sm:inline">·</span>
              <span class="hidden sm:flex items-center gap-1.5">
                <app-icon name="sparkles" [size]="11" class="text-purple-500"></app-icon>
                <span class="font-semibold text-gray-900">5</span>
                <span>AI assists used</span>
              </span>
            </ng-template>
          </div>
        </div>
      </div>

      <!-- ============== SCROLLABLE CONTENT ============== -->
      <div class="flex-1 overflow-y-auto scrollable">
        <div class="max-w-[920px] mx-auto px-4 sm:px-6 py-5 space-y-5">

          <!-- URGENT QUEUE -->
          <div #urgentRef *ngIf="awaitingHandoff().length > 0" style="scroll-margin-top: 16px;">
            <app-dash-section
              title="Urgent · Awaiting takeover"
              [count]="awaitingHandoff().length"
              accent="red"
              subtitle="Customers who asked for a human and are still on AI"
            >
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div *ngFor="let s of awaitingHandoff()"
                     [class]="urgentCardClass(s)">
                  <div [class]="'absolute left-0 top-0 bottom-0 w-1 ' + urgencyOf(s.waitingMinutes).bar"></div>
                  <div class="pl-4 pr-3 py-3 flex-1 flex flex-col">
                    <!-- avatar + name + waiting -->
                    <div class="flex items-start gap-2.5">
                      <div [class]="'relative w-8 h-8 rounded-full ' + s.color + ' text-white flex items-center justify-center text-[11px] font-medium shrink-0'">
                        {{ s.initials }}
                        <span *ngIf="urgencyOf(s.waitingMinutes).tier === 'critical'"
                              class="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white animate-pulse"></span>
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-baseline gap-1.5">
                          <span class="text-[14px] font-semibold text-gray-900 truncate">{{ s.customer }}</span>
                          <span [class]="'ml-auto text-[11px] font-semibold ' + urgencyOf(s.waitingMinutes).text + ' flex items-center gap-1 whitespace-nowrap shrink-0'">
                            <app-icon name="clock" [size]="10"></app-icon> {{ s.waitingFor }}
                          </span>
                        </div>
                        <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span class="text-[12px] text-gray-500 truncate">{{ s.org }}</span>
                          <app-mode-badge [mode]="s.mode"></app-mode-badge>
                        </div>
                      </div>
                    </div>
                    <div class="text-[13px] text-gray-700 mt-2 italic line-clamp-2 leading-snug">
                      "{{ s.lastMessage }}"
                    </div>
                    <div class="text-[12px] text-gray-500 mt-1.5 leading-snug flex items-start gap-1.5">
                      <app-icon name="sparkles" [size]="11" class="text-purple-500 shrink-0 mt-0.5"></app-icon>
                      <span class="line-clamp-2">{{ s.aiContext }}</span>
                    </div>
                    <div class="flex items-center gap-1.5 mt-auto pt-2.5 flex-wrap">
                      <button (click)="takeOver.emit(s)"
                              class="text-[13px] font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition shadow-sm">
                        Take over
                      </button>
                      <button (click)="continueAI.emit(s)"
                              class="text-[12px] font-medium px-2.5 py-1.5 rounded-lg bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 transition">
                        AI continue
                      </button>
                      <button (click)="resolveSession.emit(s)"
                              class="text-[12px] text-gray-500 px-2 py-1.5 hover:text-gray-700 transition ml-auto">
                        Decline
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </app-dash-section>
          </div>

          <!-- YOUR QUEUE -->
          <div #queueRef *ngIf="assignedToMe().length > 0" style="scroll-margin-top: 16px;">
            <app-dash-section
              title="Your queue"
              [count]="assignedToMe().length"
              accent="amber"
              subtitle="Sessions assigned to you — engage before they escalate"
            >
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div *ngFor="let s of assignedToMe()"
                     class="bg-white rounded-xl ring-1 ring-gray-200 hover:ring-amber-200 hover:shadow-sm transition p-3 flex flex-col">
                  <div class="flex items-start gap-2.5">
                    <div [class]="'w-8 h-8 rounded-full ' + s.color + ' text-white flex items-center justify-center text-[11px] font-medium shrink-0'">
                      {{ s.initials }}
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-baseline gap-1.5">
                        <span class="text-[14px] font-semibold text-gray-900 truncate">{{ s.customer }}</span>
                        <span class="ml-auto text-[11px] text-amber-700 font-semibold whitespace-nowrap flex items-center gap-1 shrink-0">
                          <app-icon name="clock" [size]="10"></app-icon> {{ s.waitingFor }}
                        </span>
                      </div>
                      <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span class="text-[12px] text-gray-500 truncate">{{ s.org }}</span>
                        <app-mode-badge [mode]="s.mode"></app-mode-badge>
                        <span *ngIf="s.unread > 0" class="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                          {{ s.unread }} new
                        </span>
                      </div>
                    </div>
                  </div>
                  <div class="text-[13px] text-gray-700 mt-2 line-clamp-2 leading-snug">
                    "{{ s.lastMessage }}"
                  </div>
                  <div class="text-[12px] text-gray-500 mt-1.5 flex items-start gap-1.5">
                    <app-icon name="sparkles" [size]="11" class="text-purple-500 shrink-0 mt-0.5"></app-icon>
                    <span class="line-clamp-2">{{ s.aiContext }}</span>
                  </div>
                  <div class="flex items-center gap-1.5 mt-auto pt-2.5 flex-wrap">
                    <button (click)="takeOver.emit(s)"
                            class="text-[13px] font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition shadow-sm">
                      Take over
                    </button>
                    <button (click)="openConv.emit(s.id)"
                            class="text-[12px] font-medium px-2.5 py-1.5 rounded-lg bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 transition">
                      Open chat
                    </button>
                    <button (click)="reassign.emit(s)"
                            class="text-[12px] text-gray-500 px-2 py-1.5 hover:text-gray-700 transition ml-auto">
                      Reassign
                    </button>
                  </div>
                </div>
              </div>
            </app-dash-section>
          </div>

          <!-- TWO-COLUMN: tasks + AI insights -->
          <div class="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <!-- Tasks (col-span-2) -->
            <div class="lg:col-span-2" #tasksRef style="scroll-margin-top: 16px;">
              <app-dash-section
                title="My open tasks"
                [count]="myOpenTasks().length"
                accent="purple"
              >
                <div class="bg-white rounded-xl ring-1 ring-gray-200 overflow-hidden">
                  <ng-container *ngIf="myOpenTasks().length === 0; else taskList">
                    <app-empty-mini text="All caught up — no tasks 🎉">
                      <app-icon name="check-circle" [size]="26" class="text-emerald-300"></app-icon>
                    </app-empty-mini>
                  </ng-container>
                  <ng-template #taskList>
                    <div class="divide-y divide-gray-100">
                      <button *ngFor="let t of myOpenTasks().slice(0, 5)"
                              (click)="openConv.emit(t.convId)"
                              class="w-full flex items-start gap-3 p-3 hover:bg-gray-50 transition text-left">
                        <div class="mt-0.5 w-4 h-4 rounded border-2 border-gray-300 hover:border-blue-500 shrink-0 transition"></div>
                        <div class="flex-1 min-w-0">
                          <div class="text-[13px] text-gray-900 truncate">{{ t.title }}</div>
                          <div class="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1.5 truncate">
                            <span class="truncate">{{ t.convName }}</span>
                            <ng-container *ngIf="t.due">
                              <span>·</span>
                              <span [class]="dueClass(t.due)">
                                {{ t.due === 'Yesterday' ? 'Overdue' : ('Due ' + t.due) }}
                              </span>
                            </ng-container>
                          </div>
                        </div>
                      </button>
                      <button *ngIf="myOpenTasks().length > 5"
                              (click)="goToTasks.emit()"
                              class="w-full px-3 py-2 text-[12px] text-blue-600 hover:bg-gray-50 text-center font-medium transition">
                        View all {{ myOpenTasks().length }} tasks →
                      </button>
                    </div>
                  </ng-template>
                </div>
              </app-dash-section>
            </div>

            <!-- AI insights (col-span-3) -->
            <div class="lg:col-span-3" #aiInsightsRef style="scroll-margin-top: 16px;">
              <app-dash-section
                title="AI insights · unread chats"
                [count]="unreadConvs().length"
                accent="purple"
              >
                <button *ngIf="unreadConvs().length > 0"
                        action
                        (click)="markAllRead.emit()"
                        class="text-[12px] text-gray-500 hover:text-gray-900 font-medium transition">
                  Mark all read
                </button>
                <div class="bg-white rounded-xl ring-1 ring-gray-200 overflow-hidden">
                  <ng-container *ngIf="unreadConvs().length === 0; else unreadList">
                    <app-empty-mini text="All conversations read 📬">
                      <app-icon name="inbox" [size]="26" class="text-gray-300"></app-icon>
                    </app-empty-mini>
                  </ng-container>
                  <ng-template #unreadList>
                    <div class="divide-y divide-gray-100">
                      <ng-container *ngFor="let c of unreadConvs()">
                        <ng-container *ngIf="aiSummaryFor(c.id) as summary; else simpleRow">
                          <div [class]="aiSummaryRowClass(summary)">
                            <div class="flex items-start gap-3">
                              <app-avatar [user]="c" [size]="28"></app-avatar>
                              <div class="flex-1 min-w-0">
                                <div class="flex items-baseline gap-2 flex-wrap">
                                  <span class="text-[13px] font-semibold text-gray-900 truncate">{{ c.name }}</span>
                                  <span *ngIf="c.isExternal"
                                        class="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 shrink-0">
                                    CUSTOMER
                                  </span>
                                  <span class="text-[11px] text-gray-500 ml-auto shrink-0">{{ c.lastTime }}</span>
                                </div>
                                <div class="text-[12px] text-gray-700 mt-1 leading-snug">
                                  <span class="text-[11px] font-bold text-purple-600 uppercase tracking-wider mr-1">AI</span>
                                  {{ summary.summary }}
                                </div>
                                <div *ngIf="summary.actions?.length"
                                     class="flex items-center gap-1 mt-1.5 flex-wrap">
                                  <span *ngFor="let a of summary.actions"
                                        class="text-[10.5px] bg-purple-50 text-purple-700 rounded px-1.5 py-0.5">
                                    {{ a }}
                                  </span>
                                </div>
                                <div class="flex items-center gap-2 mt-2">
                                  <button (click)="openConv.emit(c.id)"
                                          class="text-[12px] font-medium text-blue-600 hover:underline">
                                    Open chat
                                  </button>
                                  <span class="text-gray-300">·</span>
                                  <button (click)="markConvRead.emit(c.id)"
                                          class="text-[12px] text-gray-500 hover:text-gray-800">
                                    Mark read
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </ng-container>
                        <ng-template #simpleRow>
                          <button (click)="openConv.emit(c.id)"
                                  class="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition text-left">
                            <app-avatar [user]="c" [size]="28"></app-avatar>
                            <div class="flex-1 min-w-0">
                              <div class="text-[13px] font-medium text-gray-900 truncate">{{ c.name }}</div>
                              <div class="text-[12px] text-gray-500 truncate">{{ c.lastSnippet }}</div>
                            </div>
                            <span class="text-[11px] text-gray-500 shrink-0">{{ c.lastTime }}</span>
                          </button>
                        </ng-template>
                      </ng-container>
                    </div>
                  </ng-template>
                </div>
              </app-dash-section>
            </div>
          </div>

          <!-- ACTIVITY FEED -->
          <app-dash-section *ngIf="filteredFeed().length > 0"
                            title="Recent activity"
                            subtitle="Last 1 hour">
            <div class="bg-white rounded-xl ring-1 ring-gray-200 p-1">
              <div class="space-y-0.5">
                <div *ngFor="let a of filteredFeed()"
                     class="flex items-start gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg transition">
                  <div [class]="'w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ' +
                    activityIcon(a.icon).bg + ' ' + activityIcon(a.icon).text">
                    <app-icon [name]="activityIcon(a.icon).iconName" [size]="13"></app-icon>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-[12px] text-gray-700 leading-snug">
                      <span class="font-medium text-gray-900">{{ a.actor }}</span>
                      <span *ngIf="a.org" class="text-gray-500"> · {{ a.org }}</span>
                      <span> {{ a.text }}</span>
                    </div>
                  </div>
                  <span class="text-[11px] text-gray-500 shrink-0 mt-1">{{ a.time }}</span>
                </div>
              </div>
            </div>
          </app-dash-section>

          <!-- RESOLVED TODAY (CS only) -->
          <app-dash-section *ngIf="resolvedToday().length > 0"
                            title="Resolved by you today"
                            [count]="resolvedToday().length">
            <div class="bg-white/60 rounded-xl ring-1 ring-gray-200 overflow-hidden">
              <div class="divide-y divide-gray-100">
                <div *ngFor="let s of resolvedToday()"
                     class="flex items-center gap-3 p-2.5 px-3.5">
                  <div [class]="'w-7 h-7 rounded-full ' + s.color + ' text-white flex items-center justify-center text-[11px] font-medium shrink-0 opacity-70'">
                    {{ s.initials }}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-[12px] text-gray-700 truncate">
                      <span class="font-medium">{{ s.customer }}</span>
                      <span class="text-gray-500"> · {{ s.org }}</span>
                    </div>
                  </div>
                  <app-icon name="check-circle" [size]="13" class="text-emerald-500 shrink-0"></app-icon>
                  <span class="text-[11px] text-gray-500 shrink-0">{{ s.resolvedAt }}</span>
                </div>
              </div>
            </div>
          </app-dash-section>

          <div class="h-4"></div>
        </div>
      </div>
    </div>

    <!-- ============ HERO BANNER (cascading priority) ============ -->
    <ng-template #heroBanner>
      <ng-container [ngSwitch]="heroBannerType()">
        <!-- 1. CS: awaiting handoff -->
        <div *ngSwitchCase="'urgent_handoff'"
             class="rounded-xl bg-gradient-to-r from-red-50 via-red-50/60 to-amber-50/40 ring-1 ring-red-200/70 p-3 sm:p-3.5 flex items-center gap-3 mb-3 sm:mb-4">
          <div class="relative shrink-0">
            <div [class]="'w-10 h-10 rounded-full ' + awaitingHandoff()[0].color + ' text-white flex items-center justify-center text-[12px] font-medium'">
              {{ awaitingHandoff()[0].initials }}
            </div>
            <span class="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white">
              <span class="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-60"></span>
            </span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[11px] font-bold text-red-700 uppercase tracking-wider">⚠ Most urgent</span>
              <span class="text-[11px] text-red-600 font-semibold flex items-center gap-1">
                <app-icon name="clock" [size]="11"></app-icon> Waiting {{ awaitingHandoff()[0].waitingFor }}
              </span>
            </div>
            <div class="text-[14px] text-gray-900 mt-0.5 truncate">
              <span class="font-semibold">{{ awaitingHandoff()[0].customer }}</span>
              <span class="text-gray-500"> · {{ awaitingHandoff()[0].org }}</span>
              <span class="text-gray-700 hidden sm:inline"> needs a human handoff</span>
            </div>
          </div>
          <button (click)="takeOver.emit(awaitingHandoff()[0])"
                  class="text-[12px] sm:text-[13px] font-medium px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition shadow-sm shrink-0">
            Take over →
          </button>
        </div>

        <!-- 2. CS: assigned to me -->
        <div *ngSwitchCase="'assigned'"
             class="rounded-xl bg-gradient-to-r from-amber-50 to-amber-50/40 ring-1 ring-amber-200/70 p-3 sm:p-3.5 flex items-center gap-3 mb-3 sm:mb-4">
          <div [class]="'w-10 h-10 rounded-full ' + assignedToMe()[0].color + ' text-white flex items-center justify-center text-[12px] font-medium shrink-0'">
            {{ assignedToMe()[0].initials }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-[11px] font-bold text-amber-700 uppercase tracking-wider">→ Your turn</div>
            <div class="text-[14px] text-gray-900 mt-0.5 truncate">
              <span class="font-semibold">{{ assignedToMe()[0].customer }}</span>
              <span class="text-gray-500"> · {{ assignedToMe()[0].org }}</span>
              <span class="text-gray-700 hidden sm:inline"> is assigned to you</span>
            </div>
          </div>
          <button (click)="takeOver.emit(assignedToMe()[0])"
                  class="text-[12px] sm:text-[13px] font-medium px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition shadow-sm shrink-0">
            Engage →
          </button>
        </div>

        <!-- 3. mention -->
        <div *ngSwitchCase="'mention'"
             class="rounded-xl bg-gradient-to-r from-violet-50 to-violet-50/40 ring-1 ring-violet-200/70 p-3 sm:p-3.5 flex items-center gap-3 mb-3 sm:mb-4">
          <div class="w-10 h-10 rounded-full bg-violet-500 text-white flex items-center justify-center shrink-0">
            <app-icon name="at-sign" [size]="18"></app-icon>
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-[11px] font-bold text-violet-700 uppercase tracking-wider">&#64; You were mentioned</div>
            <div class="text-[14px] text-gray-900 mt-0.5 truncate">
              <span class="font-semibold">{{ myMentions()[0].sender }}</span>
              <span class="text-gray-500"> in {{ myMentions()[0].space }}</span>
              <span class="text-gray-700 hidden sm:inline"> · {{ myMentions()[0].date }}</span>
            </div>
          </div>
          <button (click)="goToMentions.emit()"
                  class="text-[12px] sm:text-[13px] font-medium px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition shadow-sm shrink-0">
            View →
          </button>
        </div>

        <!-- 4. overdue task -->
        <div *ngSwitchCase="'overdue'"
             class="rounded-xl bg-gradient-to-r from-red-50 to-red-50/40 ring-1 ring-red-200/70 p-3 sm:p-3.5 flex items-center gap-3 mb-3 sm:mb-4">
          <div class="w-10 h-10 rounded-full bg-red-500 text-white flex items-center justify-center shrink-0">
            <app-icon name="clock" [size]="18"></app-icon>
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-[11px] font-bold text-red-700 uppercase tracking-wider">⚠ Overdue task</div>
            <div class="text-[14px] text-gray-900 mt-0.5 truncate">
              <span class="font-semibold">{{ overdueTasks()[0].title }}</span>
              <span class="text-gray-500 hidden sm:inline"> · {{ overdueTasks()[0].convName }}</span>
            </div>
          </div>
          <button (click)="openConv.emit(overdueTasks()[0].convId)"
                  class="text-[12px] sm:text-[13px] font-medium px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition shadow-sm shrink-0">
            Open →
          </button>
        </div>

        <!-- 5. due today -->
        <div *ngSwitchCase="'today'"
             class="rounded-xl bg-gradient-to-r from-amber-50 to-amber-50/40 ring-1 ring-amber-200/70 p-3 sm:p-3.5 flex items-center gap-3 mb-3 sm:mb-4">
          <div class="w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0">
            <app-icon name="check-circle-2" [size]="18"></app-icon>
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-[11px] font-bold text-amber-700 uppercase tracking-wider">📋 Due today</div>
            <div class="text-[14px] text-gray-900 mt-0.5 truncate">
              <span class="font-semibold">{{ todayTasks()[0].title }}</span>
              <span class="text-gray-500 hidden sm:inline"> · {{ todayTasks()[0].convName }}</span>
            </div>
          </div>
          <button (click)="openConv.emit(todayTasks()[0].convId)"
                  class="text-[12px] sm:text-[13px] font-medium px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition shadow-sm shrink-0">
            Open →
          </button>
        </div>

        <!-- 6. unread -->
        <div *ngSwitchCase="'unread'"
             class="rounded-xl bg-gradient-to-r from-blue-50 to-blue-50/40 ring-1 ring-blue-200/70 p-3 sm:p-3.5 flex items-center gap-3 mb-3 sm:mb-4">
          <div class="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center shrink-0">
            <app-icon name="inbox" [size]="18"></app-icon>
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-[11px] font-bold text-blue-700 uppercase tracking-wider">📬 Catch up</div>
            <div class="text-[14px] text-gray-900 mt-0.5">
              <span class="font-semibold">{{ unreadConvs().length }} unread</span>
              <span class="text-gray-700"> conversation{{ unreadConvs().length === 1 ? '' : 's' }} need your eyes</span>
            </div>
          </div>
          <button (click)="openConv.emit(unreadConvs()[0].id)"
                  class="text-[12px] sm:text-[13px] font-medium px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition shadow-sm shrink-0">
            Open first →
          </button>
        </div>

        <!-- 7. all clear -->
        <div *ngSwitchDefault
             class="rounded-xl bg-gradient-to-r from-emerald-50 to-emerald-50/40 ring-1 ring-emerald-200/70 p-3 sm:p-3.5 flex items-center gap-3 mb-3 sm:mb-4">
          <div class="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
            <app-icon name="check-circle" [size]="18"></app-icon>
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">🎉 All clear</div>
            <div class="text-[14px] text-gray-900 mt-0.5">
              <span class="font-semibold">No pending work.</span>
              <span class="text-gray-700"> You're caught up — enjoy the calm.</span>
            </div>
          </div>
        </div>
      </ng-container>
    </ng-template>
  `,
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
  // Pulled from data files; in a real app these would also live in state.
  readonly mentionsData: MentionEntry[] = MENTIONS_DATA;
  readonly aiSummaries: Record<string, AISummary> = AI_UNREAD_SUMMARIES;
  readonly activityFeed: ActivityItem[] = ACTIVITY_FEED;
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
