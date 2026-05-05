/**
 * HandoffQueueComponent — agent-facing panel for the live handoff queue.
 *
 * Reads handoffs from LiveDataService (which talks to chat-service
 * GET /handoffs?status=pending&status=claimed) and exposes the four
 * agent actions wired through the same service:
 *
 *   - Claim     atomic; lose the race -> 409 -> shows toast
 *   - Assign    pick another internal user from the agent picker
 *   - Dismiss   modal asks for a reason (Go requires non-empty)
 *   - Resolve   terminal; only enabled on already-claimed rows
 *
 * The component refreshes its list on:
 *   - mount (one-shot)
 *   - manual refresh button
 *   - any FCM payload with event = "phase.changed" or
 *     "channel.updated" affecting one of the listed channels
 *
 * Drop into home-dashboard's "URGENT" section when state.live() is true.
 * Falls back to the legacy CUSTOMER_PORTAL_SESSIONS UI when not live so
 * the mock demo keeps rendering.
 */
import {
  ChangeDetectionStrategy, Component, Input, OnDestroy, OnInit,
  computed, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import type { HandoffRequest, UserRef } from '../../models/api-types';
import { LiveDataService } from '../../services/live-data.service';
import { ToastService } from '../../services/toast.service';
import { FcmListenerService, type FCMPayload } from '../../services/fcm-listener.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-handoff-queue',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-lg border border-gray-200 bg-white">
      <header class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold text-gray-900">Handoff queue</span>
          <span class="text-xs text-gray-500">{{ handoffs().length }}</span>
        </div>
        <button class="text-xs text-blue-600 hover:underline disabled:opacity-50"
                [disabled]="loading()"
                (click)="refresh()"
                title="Refresh">
          {{ loading() ? 'Refreshing...' : 'Refresh' }}
        </button>
      </header>

      <div *ngIf="lastError()" class="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100">
        {{ lastError() }}
      </div>

      <div *ngIf="handoffs().length === 0; else queueRows" class="px-4 py-6 text-center text-sm text-gray-500">
        No pending handoffs.
      </div>

      <ng-template #queueRows>
        <ul class="divide-y divide-gray-100">
          <li *ngFor="let h of handoffs(); trackBy: trackById"
              class="flex flex-col gap-2 px-4 py-3 hover:bg-gray-50">
            <div class="flex items-start gap-3">
              <span [class]="priorityBadgeClass(h)">{{ h.priority }}</span>
              <div class="min-w-0 flex-1">
                <div class="text-sm text-gray-900 truncate">
                  <span class="font-medium">{{ humanizeRef(h.opened_by) }}</span>
                  &middot;
                  <span class="text-gray-500">{{ humanizeChannel(h.channel_id) }}</span>
                </div>
                <div class="text-xs text-gray-500 mt-0.5">
                  Opened {{ relativeTime(h.opened_on) }} &middot; status: {{ h.status }}
                  <span *ngIf="h.assigned_team"> &middot; team: {{ h.assigned_team }}</span>
                  <span *ngIf="h.claimed_by"> &middot; claimed by {{ humanizeRef(h.claimed_by) }}</span>
                </div>
                <div *ngIf="h.ai_summary" class="text-xs text-gray-700 mt-1 line-clamp-2">
                  {{ h.ai_summary }}
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2 ml-9">
              <button *ngIf="h.status === 'pending'"
                      type="button"
                      class="text-xs px-2.5 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      [disabled]="busy() === h.id"
                      (click)="claim(h)">
                Take over
              </button>
              <button *ngIf="h.status === 'pending' || h.status === 'claimed'"
                      type="button"
                      class="text-xs px-2.5 py-1 rounded bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50"
                      [disabled]="busy() === h.id"
                      (click)="openAssign(h)">
                Assign
              </button>
              <button *ngIf="h.status === 'pending' || h.status === 'claimed'"
                      type="button"
                      class="text-xs px-2.5 py-1 rounded bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50"
                      [disabled]="busy() === h.id"
                      (click)="openDismiss(h)">
                Dismiss
              </button>
              <button *ngIf="h.status === 'claimed'"
                      type="button"
                      class="text-xs px-2.5 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                      [disabled]="busy() === h.id"
                      (click)="resolve(h)">
                Resolve
              </button>
            </div>
          </li>
        </ul>
      </ng-template>
    </div>

    <!-- Assign modal — minimal inline. A richer team picker lives in
         the dashboard's standard side modal; this is enough for v1. -->
    <div *ngIf="assigning()" class="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
      <div class="bg-white rounded-lg shadow-xl w-80 p-4 space-y-3">
        <h3 class="text-sm font-semibold text-gray-900">Assign handoff</h3>
        <p class="text-xs text-gray-600">User ref of the agent (e.g. op:42):</p>
        <input type="text" [(ngModel)]="assignRef" class="w-full border border-gray-300 rounded px-2 py-1 text-sm" placeholder="op:42" />
        <div class="flex justify-end gap-2 pt-1">
          <button type="button" class="text-xs px-3 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200" (click)="closeAssign()">Cancel</button>
          <button type="button"
                  class="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  [disabled]="!assignRef.trim()"
                  (click)="confirmAssign()">Assign</button>
        </div>
      </div>
    </div>

    <!-- Dismiss modal -->
    <div *ngIf="dismissing()" class="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
      <div class="bg-white rounded-lg shadow-xl w-96 p-4 space-y-3">
        <h3 class="text-sm font-semibold text-gray-900">Dismiss handoff</h3>
        <p class="text-xs text-gray-600">Reason (required, captured in the audit log):</p>
        <textarea [(ngModel)]="dismissReason" rows="3" class="w-full border border-gray-300 rounded px-2 py-1 text-sm" placeholder="Spam / mistake / customer disconnected..."></textarea>
        <div class="flex justify-end gap-2 pt-1">
          <button type="button" class="text-xs px-3 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200" (click)="closeDismiss()">Cancel</button>
          <button type="button"
                  class="text-xs px-3 py-1.5 rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                  [disabled]="!dismissReason.trim()"
                  (click)="confirmDismiss()">Dismiss</button>
        </div>
      </div>
    </div>
  `,
})
export class HandoffQueueComponent implements OnInit, OnDestroy {
  private readonly live = inject(LiveDataService);
  private readonly toast = inject(ToastService);
  private readonly fcm = inject(FcmListenerService, { optional: true });

  /** Optional team filter — when a dashboard wants only one team's queue. */
  @Input() team?: string;

  readonly handoffs = signal<HandoffRequest[]>([]);
  readonly loading = signal(false);
  readonly lastError = signal<string | null>(null);
  readonly busy = signal<string | null>(null); // id of row mid-action

  // Assign modal state
  readonly assigning = signal<HandoffRequest | null>(null);
  assignRef = '';

  // Dismiss modal state
  readonly dismissing = signal<HandoffRequest | null>(null);
  dismissReason = '';

  private fcmSub?: Subscription;

  ngOnInit(): void {
    void this.refresh();
    if (this.fcm) {
      this.fcmSub = this.fcm.messages$.subscribe((p: FCMPayload) => {
        if (p.event === 'phase.changed' || p.event === 'channel.updated') {
          // Drop in a quick refresh; the queue may have shrunk/grown.
          void this.refresh();
        }
      });
    }
  }

  ngOnDestroy(): void { this.fcmSub?.unsubscribe(); }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const list = await this.live.loadHandoffs({
        team: this.team,
        status: ['pending', 'claimed'],
      });
      this.handoffs.set(list);
      this.lastError.set(null);
    } catch (err) {
      this.lastError.set(stringifyErr(err));
    } finally {
      this.loading.set(false);
    }
  }

  async claim(h: HandoffRequest): Promise<void> {
    this.busy.set(h.id);
    try {
      const updated = await this.live.claimHandoff(h.id);
      if (updated) {
        this.toast.show('Handoff claimed.');
        this.replace(updated);
      }
    } catch (err) {
      // chat-service returns 409 when another agent claimed it first.
      this.toast.show('Already claimed by another agent.');
      void this.refresh();
    } finally {
      this.busy.set(null);
    }
  }

  openAssign(h: HandoffRequest): void {
    this.assignRef = '';
    this.assigning.set(h);
  }

  closeAssign(): void { this.assigning.set(null); }

  async confirmAssign(): Promise<void> {
    const h = this.assigning();
    const ref = this.assignRef.trim() as UserRef;
    if (!h || !ref) return;
    this.busy.set(h.id);
    this.assigning.set(null);
    try {
      const updated = await this.live.assignHandoff(h.id, ref);
      if (updated) {
        this.toast.show('Handoff assigned.');
        this.replace(updated);
      }
    } catch (err) {
      this.toast.show('Assign failed: ' + stringifyErr(err));
    } finally {
      this.busy.set(null);
    }
  }

  openDismiss(h: HandoffRequest): void {
    this.dismissReason = '';
    this.dismissing.set(h);
  }

  closeDismiss(): void { this.dismissing.set(null); }

  async confirmDismiss(): Promise<void> {
    const h = this.dismissing();
    const reason = this.dismissReason.trim();
    if (!h || !reason) return;
    this.busy.set(h.id);
    this.dismissing.set(null);
    try {
      const updated = await this.live.dismissHandoff(h.id, reason);
      if (updated) {
        this.toast.show('Handoff dismissed.');
        // Drop dismissed rows from the visible list (they're terminal).
        this.handoffs.update((list) => list.filter((x) => x.id !== h.id));
      }
    } catch (err) {
      this.toast.show('Dismiss failed: ' + stringifyErr(err));
    } finally {
      this.busy.set(null);
    }
  }

  async resolve(h: HandoffRequest): Promise<void> {
    this.busy.set(h.id);
    try {
      const updated = await this.live.resolveHandoff(h.id);
      if (updated) {
        this.toast.show('Handoff resolved.');
        this.handoffs.update((list) => list.filter((x) => x.id !== h.id));
      }
    } catch (err) {
      this.toast.show('Resolve failed: ' + stringifyErr(err));
    } finally {
      this.busy.set(null);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private replace(h: HandoffRequest): void {
    this.handoffs.update((list) => list.map((x) => (x.id === h.id ? h : x)));
  }

  trackById(_i: number, h: HandoffRequest): string { return h.id; }

  priorityBadgeClass(h: HandoffRequest): string {
    const base = 'inline-flex items-center px-2 py-0.5 text-[10px] font-medium uppercase rounded';
    switch (h.priority) {
      case 'urgent': return `${base} bg-red-100 text-red-700`;
      case 'high': return `${base} bg-amber-100 text-amber-800`;
      case 'low': return `${base} bg-gray-100 text-gray-600`;
      default: return `${base} bg-blue-100 text-blue-700`;
    }
  }

  humanizeRef(ref: UserRef): string {
    if (!ref) return '—';
    const m = ref.match(/^(op|ext|bot):(.+)$/);
    if (!m) return ref;
    if (m[1] === 'bot') return 'Airlift Intelligence';
    return `${m[1] === 'op' ? 'User' : 'Customer'} ${m[2]}`;
  }

  humanizeChannel(id: string): string {
    return id.length > 12 ? `…${id.slice(-6)}` : id;
  }

  /** Compact relative-time formatter for the queue rows. The dashboard
   *  refreshes often enough that "X min ago" stays close to right. */
  relativeTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const diff = Date.now() - d.getTime();
    const min = Math.floor(diff / 60_000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min} min ago`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return d.toLocaleDateString();
  }
}

function stringifyErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
