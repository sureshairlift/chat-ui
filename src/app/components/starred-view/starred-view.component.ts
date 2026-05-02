import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
  computed, inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { ToastService } from "../../services/toast.service";
import { SENDERS } from "../../data/senders";
import { Conversation, Message, Sender } from "../../models/types";
import { IconComponent } from "../icon/icon.component";
import { AvatarComponent } from "../avatar/avatar.component";

interface SavedRow {
  msg: Message;
  conv: Conversation;
  sender: Sender | null;
  excerpt: string;
}

/**
 * StarredView — list of every saved (bookmarked) message across all
 * conversations, newest convs first. Empty state when nothing saved.
 */
@Component({
  selector: "app-starred-view",
  standalone: true,
  imports: [CommonModule, IconComponent, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex-1 flex min-w-0 min-h-0 h-full" },
  template: `
    <div class="flex-1 flex flex-col bg-white h-full w-full min-h-0">
      <!-- Header -->
      <div class="px-4 sm:px-6 pt-5 pb-3 border-b border-gray-100 flex items-center gap-2">
        <button
          *ngIf="showBack"
          (click)="back.emit()"
          class="p-1.5 -ml-1 rounded-full hover:bg-gray-100 shrink-0"
          title="Back"
        >
          <app-icon name="arrow-left" [size]="20" class="text-gray-700"></app-icon>
        </button>
        <div class="min-w-0">
          <h1 class="text-[22px] font-normal text-gray-900">Saved messages</h1>
          <p *ngIf="rows().length > 0" class="text-[12px] text-gray-500 mt-0.5">
            {{ rows().length }} saved message{{ rows().length === 1 ? '' : 's' }}
          </p>
        </div>
      </div>

      <!-- Empty state -->
      <div *ngIf="rows().length === 0; else listTpl"
           class="flex-1 flex flex-col items-center justify-center text-center px-6 text-gray-500">
        <app-icon name="bookmark" [size]="40" class="text-gray-300 mb-2"></app-icon>
        <h3 class="text-[15px] font-medium text-gray-700">No saved messages yet</h3>
        <p class="text-[13px] text-gray-500 mt-1 max-w-xs">
          Hover any message and click the more menu (⋯) to save it here for later.
        </p>
      </div>

      <ng-template #listTpl>
        <div class="flex-1 overflow-y-auto scrollable divide-y divide-gray-50">
          <div *ngFor="let r of rows(); trackBy: trackBy"
               class="group flex items-start gap-3 px-4 sm:px-6 py-3 hover:bg-gray-50 transition">
            <button (click)="openConv.emit(r.conv.id)"
                    class="contents text-left">
              <app-avatar [user]="r.sender || r.conv" [size]="36"></app-avatar>
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline justify-between gap-3">
                  <div class="flex items-baseline gap-2 min-w-0">
                    <span class="text-[13px] font-medium text-gray-900 truncate">
                      {{ r.sender?.name || 'Unknown' }}
                    </span>
                    <span class="text-[12px] text-gray-500 truncate">in {{ r.conv.name }}</span>
                  </div>
                  <span class="text-[11px] text-gray-500 shrink-0">{{ r.msg.time }}</span>
                </div>
                <div class="text-[13px] text-gray-700 mt-1 line-clamp-3 break-words">
                  {{ r.excerpt }}
                </div>
              </div>
            </button>
            <button
              (click)="onUnsave(r.msg.id)"
              class="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-gray-100 rounded transition shrink-0 self-center"
              title="Remove from saved"
            >
              <app-icon name="x" [size]="14" class="text-gray-500"></app-icon>
            </button>
          </div>
        </div>
      </ng-template>
    </div>
  `,
})
export class StarredViewComponent {
  state = inject(ChatStateService);
  toast = inject(ToastService);

  @Input() showBack = false;
  @Output() openConv = new EventEmitter<string>();
  @Output() back = new EventEmitter<void>();

  trackBy = (_: number, r: SavedRow) => r.msg.id;

  rows = computed<SavedRow[]>(() => {
    const saved = this.state.savedMsgs();
    const ids = Object.keys(saved);
    if (ids.length === 0) return [];

    const out: SavedRow[] = [];
    const map = this.state.messagesByConv();
    const convs = this.state.conversations();
    // Walk all conversations to find each saved message
    for (const [convId, msgs] of Object.entries(map)) {
      const conv = convs.find((c) => c.id === convId);
      if (!conv) continue;
      for (const m of msgs) {
        if (saved[m.id]) {
          const excerpt = m.html
            ? m.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
            : (m.text || "");
          out.push({
            msg: m,
            conv,
            sender: m.sender ? (SENDERS[m.sender] || null) : null,
            excerpt,
          });
        }
      }
    }
    return out.reverse();
  });

  onUnsave(msgId: string): void {
    this.state.toggleSave(msgId);
    this.toast.show("Removed from saved");
  }
}
