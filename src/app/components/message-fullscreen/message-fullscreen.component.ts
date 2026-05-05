import {
  ChangeDetectionStrategy, Component, HostListener, computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";

import { ChatStateService } from "../../services/chat-state.service";
import { SafeHtmlPipe, RenderTextPipe } from "../../pipes/render-text.pipe";
import { SENDERS } from "../../data/senders";
import type { Sender } from "../../models/types";

import { IconComponent } from "../icon/icon.component";
import { AvatarComponent } from "../avatar/avatar.component";

/**
 * MessageFullscreenComponent — modal viewer for a single message. Open
 * via ChatStateService.openMessageFullscreen(msg) (wired to the
 * "Expand" item in the message-bubble more menu); close on Esc, the
 * close button, or backdrop click.
 *
 * Renders:
 *   - Sender avatar + name + timestamp header
 *   - The full message body (sanitized HTML or rich text), no clipping,
 *     no overflow, fully scrollable inside the modal so very long
 *     messages stay readable.
 *
 * Lives at AppComponent's root so it overlays everything else (sidebar,
 * thread panel, etc). Pure UI — no backend calls.
 */
@Component({
  selector: "app-message-fullscreen",
  standalone: true,
  imports: [CommonModule, IconComponent, AvatarComponent, SafeHtmlPipe, RenderTextPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div *ngIf="msg() as m"
         class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 sm:p-8"
         (click)="close()">
      <div class="bg-white rounded-2xl shadow-2xl ring-1 ring-gray-200 w-full max-w-3xl max-h-[90vh] flex flex-col"
           (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="flex items-start gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <app-avatar [user]="senderObj()" [size]="36"></app-avatar>
          <div class="flex-1 min-w-0">
            <div class="text-[14px] font-medium text-gray-900 truncate">
              {{ senderObj()?.name || 'Unknown' }}
            </div>
            <div class="text-[12px] text-gray-500 truncate">{{ m.time }}</div>
          </div>
          <button (click)="close()"
                  class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 shrink-0"
                  title="Close (Esc)">
            <app-icon name="x" [size]="16"></app-icon>
          </button>
        </div>

        <!-- Body — full content, scrollable both directions for wide content -->
        <div class="flex-1 overflow-auto px-5 py-4 message-body-scroll">
          <div *ngIf="m.html; else textOnly"
               class="text-[15px] leading-relaxed text-gray-900 message-html prose prose-sm max-w-none"
               [innerHTML]="m.html | safeHtml"></div>
          <ng-template #textOnly>
            <div class="text-[15px] leading-relaxed text-gray-900 whitespace-pre-wrap break-words"
                 [innerHTML]="m.text | renderText"></div>
          </ng-template>
        </div>

        <!-- Footer hint -->
        <div class="px-5 py-2 border-t border-gray-100 text-[11px] text-gray-500 flex items-center justify-between shrink-0">
          <span>Press Esc or click outside to close</span>
          <span class="text-gray-400">Expanded view</span>
        </div>
      </div>
    </div>
  `,
})
export class MessageFullscreenComponent {
  state = inject(ChatStateService);

  msg = computed(() => this.state.expandedMessage());

  senderObj = computed<Sender | null>(() => {
    const m = this.msg();
    if (!m?.sender) return null;
    // Live messages carry a structured senderRecord; mock messages fall
    // back to the SENDERS directory keyed by short id.
    const live = (m as { senderRecord?: Sender }).senderRecord;
    if (live) return live;
    return SENDERS[m.sender] ?? null;
  });

  @HostListener("document:keydown.escape")
  onEsc(): void { if (this.msg()) this.close(); }

  close(): void { this.state.closeMessageFullscreen(); }
}
