import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
  computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { SENDERS } from "../../data/senders";
import { Conversation, Message, Sender } from "../../models/types";

import { IconComponent } from "../icon/icon.component";
import { AvatarComponent } from "../avatar/avatar.component";
import { RenderTextPipe } from "../../pipes/render-text.pipe";

interface FollowedRow extends Message {
  convId: string;
}

/**
 * FollowingPanel — list every message that has thread metadata, across
 * every conversation. Mirrors React `<FollowingPanel>` 1:1.
 */
@Component({
  selector: "app-following-panel",
  standalone: true,
  imports: [CommonModule, IconComponent, AvatarComponent, RenderTextPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block shrink-0 h-full" },
  template: `
    <aside [class]="asideClass" [style.width.px]="fullscreen ? null : 380">
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div class="flex items-center gap-2 min-w-0">
          <h3 class="text-[16px] font-medium text-gray-900">Following</h3>
          <span class="text-[12px] text-gray-500">· {{ rows().length }}</span>
        </div>
        <button (click)="handleClose()" class="p-1.5 hover:bg-gray-100 rounded-full text-gray-600 shrink-0" title="Close">
          <app-icon name="x" [size]="16"></app-icon>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto scrollable">
        <div *ngIf="rows().length === 0; else list"
             class="flex flex-col items-center justify-center text-center py-16 px-6 text-gray-500">
          <app-icon name="bell" [size]="32" class="mb-2 text-gray-300"></app-icon>
          <div class="text-[13px] font-medium text-gray-700">No followed threads</div>
          <div class="text-[12px] text-gray-500 mt-1 max-w-[260px]">
            Reply to a message and you'll start following its thread automatically.
          </div>
        </div>

        <ng-template #list>
          <button
            *ngFor="let m of rows()"
            (click)="openThread.emit({ msgId: m.id, convId: m.convId })"
            class="block w-full text-left px-5 py-4 border-b border-gray-100 hover:bg-gray-50 transition"
          >
            <div class="flex items-start gap-3">
              <app-avatar [user]="senderFor(m.sender)" [size]="36"></app-avatar>
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline justify-between gap-2">
                  <span class="text-[14px] font-semibold truncate">{{ senderFor(m.sender)?.name }}</span>
                  <span class="text-[11px] text-blue-700 bg-blue-50 rounded-full px-2 py-0.5 flex items-center gap-1 shrink-0">
                    <app-icon name="bell" [size]="10"></app-icon>
                    Following
                  </span>
                </div>
                <div *ngIf="convFor(m.convId) as conv"
                     class="text-[11px] text-gray-500 mb-0.5 truncate">
                  in {{ conv.name }}
                </div>
                <div class="text-[12px] text-gray-500 mb-1">{{ m.time }}</div>
                <div class="text-[14px] text-gray-900 line-clamp-3 break-words"
                     [innerHTML]="(m.text || '') | renderText"></div>
                <div class="text-[12px] text-blue-700 mt-2 flex items-center gap-1">
                  <app-icon name="message-circle-more" [size]="12"></app-icon>
                  {{ m.thread!.count }} {{ m.thread!.count === 1 ? 'reply' : 'replies' }} · {{ m.thread!.lastTime }}
                </div>
              </div>
            </div>
          </button>
        </ng-template>
      </div>

      <!-- Floating filter pills -->
      <div class="absolute bottom-3 right-3 flex items-center gap-2 bg-white rounded-full shadow-lg border border-gray-200 p-1">
        <button class="text-[13px] text-blue-700 hover:bg-blue-50 rounded-full px-3 py-1 font-medium">Mentions me</button>
        <button class="text-[13px] text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-full px-3 py-1 font-medium">Following</button>
      </div>
    </aside>
  `,
})
export class FollowingPanelComponent {
  state = inject(ChatStateService);

  @Input() fullscreen = false;
  @Output() closed = new EventEmitter<void>();
  @Output() openThread = new EventEmitter<{ msgId: string; convId: string }>();

  closing = signal(false);

  rows = computed<FollowedRow[]>(() => {
    const out: FollowedRow[] = [];
    const map = this.state.messagesByConv();
    for (const [convId, msgs] of Object.entries(map)) {
      for (const m of msgs) {
        if (m.thread) out.push({ ...m, convId });
      }
    }
    return out;
  });

  senderFor(id?: string): Sender | null {
    return id ? (SENDERS[id] || null) : null;
  }

  convFor(id: string): Conversation | undefined {
    return this.state.conversations().find((c) => c.id === id);
  }

  get asideClass(): string {
    // `relative` only in dock mode — on fullscreen it would override `fixed`
    // (Tailwind orders `relative` after `fixed` in its source CSS) and break
    // the mobile fullscreen layout.
    const fs = this.fullscreen ? "fixed inset-0 z-50" : "shrink-0 h-full relative";
    const anim = this.closing() ? "side-panel-out" : "side-panel-in";
    return `${fs} flex flex-col border-l border-gray-200 bg-white overflow-hidden ${anim}`;
  }

  handleClose(): void {
    if (this.closing()) return;
    this.closing.set(true);
    setTimeout(() => this.closed.emit(), 180);
  }
}
