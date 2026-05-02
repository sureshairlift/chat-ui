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

/**
 * PinnedPanel — list of pinned messages for the current conversation.
 * Mirrors React `<PinnedPanel>` 1:1.
 */
@Component({
  selector: "app-pinned-panel",
  standalone: true,
  imports: [CommonModule, IconComponent, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block shrink-0 h-full" },
  template: `
    <aside [class]="asideClass" [style.width.px]="fullscreen ? null : 380">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div class="flex items-center gap-2 min-w-0">
          <app-icon name="pin" [size]="15" class="text-amber-600 shrink-0"></app-icon>
          <h3 class="text-[16px] font-medium text-gray-900 truncate">Pinned messages</h3>
          <span *ngIf="pinnedMessages().length > 0" class="text-[12px] text-gray-500 shrink-0">
            · {{ pinnedMessages().length }}
          </span>
        </div>
        <button (click)="handleClose()" class="p-1.5 hover:bg-gray-100 rounded-full text-gray-600 shrink-0" title="Close">
          <app-icon name="x" [size]="16"></app-icon>
        </button>
      </div>

      <div *ngIf="conv" class="px-4 py-2 border-b border-gray-100 bg-gray-50/60 text-[12px] text-gray-600 truncate">
        From <span class="font-medium text-gray-800">{{ conv.name }}</span>
      </div>

      <div class="flex-1 overflow-y-auto scrollable">
        <div *ngIf="pinnedMessages().length === 0; else list"
             class="flex flex-col items-center justify-center text-center py-16 px-6 text-gray-500">
          <app-icon name="pin" [size]="32" class="mb-2 text-gray-300"></app-icon>
          <div class="text-[14px] font-medium text-gray-700">No pinned messages</div>
          <div class="text-[12px] text-gray-500 mt-1 max-w-[260px]">
            Hover any message and pin it to keep important content easy to find — decisions, links, updates.
          </div>
        </div>

        <ng-template #list>
          <div class="py-1">
            <div *ngFor="let m of pinnedMessages()"
                 class="group flex items-start gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-50 transition">
              <app-avatar [user]="senderFor(m.sender)" [size]="32"></app-avatar>
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-2">
                  <span class="text-[13px] font-medium text-gray-900 truncate">{{ senderFor(m.sender)?.name }}</span>
                  <span class="text-[11px] text-gray-500 shrink-0">{{ m.time }}</span>
                </div>
                <div class="text-[13px] text-gray-700 mt-0.5 line-clamp-3 break-words">
                  {{ excerptOf(m) }}
                </div>
              </div>
              <button
                (click)="onUnpin(m.id)"
                class="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition shrink-0"
                title="Unpin"
              >
                <app-icon name="x" [size]="13" class="text-gray-500"></app-icon>
              </button>
            </div>
          </div>
        </ng-template>
      </div>
    </aside>
  `,
})
export class PinnedPanelComponent {
  state = inject(ChatStateService);

  @Input() conv: Conversation | null = null;
  @Input() fullscreen = false;
  @Output() closed = new EventEmitter<void>();

  closing = signal(false);

  pinnedMessages = computed<Message[]>(() => {
    if (!this.conv) return [];
    const ids = this.state.pinnedMsgs()[this.conv.id] || [];
    const msgs = this.state.messagesByConv()[this.conv.id] || [];
    return msgs.filter((m) => ids.includes(m.id));
  });

  senderFor(id?: string): Sender | null {
    return id ? (SENDERS[id] || null) : null;
  }
  excerptOf(m: Message): string {
    return m.html
      ? m.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : (m.text || "");
  }

  get asideClass(): string {
    const fs = this.fullscreen ? "fixed inset-0 z-50" : "shrink-0 h-full";
    const anim = this.closing() ? "side-panel-out" : "side-panel-in";
    return `${fs} flex flex-col border-l border-gray-200 bg-white overflow-hidden ${anim}`;
  }

  onUnpin(msgId: string): void {
    if (!this.conv) return;
    this.state.unpin(this.conv.id, msgId);
  }

  handleClose(): void {
    if (this.closing()) return;
    this.closing.set(true);
    setTimeout(() => this.closed.emit(), 180);
  }
}
