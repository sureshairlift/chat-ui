import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges,
  Output, SimpleChanges, computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { SENDERS } from "../../data/senders";
import { Message, ThreadReply, Sender } from "../../models/types";
import { sanitizeHtml, renderTextWithLinksHtml } from "../../services/helpers";

import { IconComponent } from "../icon/icon.component";
import { AvatarComponent } from "../avatar/avatar.component";
import { FileTypeIconComponent } from "../file-type-icon/file-type-icon.component";
import { ResizeHandleComponent } from "../resize-handle/resize-handle.component";
import { ComposerComponent } from "../composer/composer.component";
import { RenderTextPipe, SafeHtmlPipe } from "../../pipes/render-text.pipe";

interface ThreadReplyContext {
  senderId: string;
  senderName: string;
  text: string;
}

interface DisplayReply extends ThreadReply {
  html?: string;
  quoted?: { sender: string; senderId?: string; text: string };
}

/**
 * Thread side panel — parent message at top, indented replies below,
 * quick-reply chips, and a full Composer at the bottom.
 * Mirrors React `<ThreadPanel>` 1:1.
 *
 * State held locally: list of replies (rendered live, not pushed back into
 * the global state — matches React behavior), the quote-reply target, and
 * a per-thread draft.
 */
@Component({
  selector: "app-thread-panel",
  standalone: true,
  imports: [
    CommonModule, IconComponent, AvatarComponent, FileTypeIconComponent,
    ResizeHandleComponent, ComposerComponent, RenderTextPipe, SafeHtmlPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block shrink-0 h-full" },
  template: `
    <aside [class]="asideClass" [style.width.px]="fullscreen ? null : width">
      <!-- Resize handle (left edge) -->
      <app-resize-handle
        *ngIf="!fullscreen"
        side="left"
        groupName="threadresize"
        [isResizing]="state.threadResizing()"
        (mouseDown)="startResize.emit($event)"
      ></app-resize-handle>

      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div class="flex items-center gap-2 min-w-0">
          <h3 class="text-[18px] font-medium text-gray-900">Thread</h3>
          <button class="flex items-center gap-1 text-[12px] text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-full px-2.5 py-1 border border-blue-100 shrink-0">
            <app-icon name="bell" [size]="12"></app-icon>
            Following
            <app-icon name="chevron-down" [size]="12"></app-icon>
          </button>
        </div>
        <button (click)="handleClose()" class="p-1.5 hover:bg-gray-100 rounded-full text-gray-600 shrink-0" title="Close thread">
          <app-icon name="x" [size]="16"></app-icon>
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto py-3 scrollable min-w-0">
        <!-- Parent message -->
        <div class="px-4 mb-3 min-w-0 group/threadparent">
          <div class="flex gap-3 min-w-0">
            <app-avatar [user]="parentSender" [size]="36"></app-avatar>
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2 min-w-0">
                <span class="text-[14px] font-semibold truncate">{{ parentSender?.name }}</span>
                <span class="text-[11px] text-gray-500 shrink-0">{{ parent.time }}</span>
                <button
                  (click)="startQuoteReply(parent.sender, parent.text, parent.html)"
                  class="opacity-0 group-hover/threadparent:opacity-100 transition p-1 hover:bg-gray-100 rounded text-gray-500 ml-auto"
                  title="Reply with quote"
                >
                  <app-icon name="quote" [size]="12"></app-icon>
                </button>
              </div>
              <div class="text-[14px] mt-1 whitespace-pre-wrap break-words text-gray-900"
                   style="overflow-wrap: anywhere; word-break: break-word;">
                <div *ngIf="parent.html; else parentText"
                     class="message-html"
                     [innerHTML]="parent.html | safeHtml"></div>
                <ng-template #parentText>
                  <span [innerHTML]="parent.text | renderText"></span>
                </ng-template>
              </div>
              <div *ngIf="parent.attachments?.length" class="mt-2 space-y-1.5">
                <div *ngFor="let att of parent.attachments"
                     class="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 rounded-lg ring-1 ring-gray-200 text-[12px] text-gray-700 max-w-full">
                  <app-file-type-icon [ext]="(att.ext || '')" [size]="20"></app-file-type-icon>
                  <span class="truncate flex-1 min-w-0">{{ att.name }}</span>
                  <span *ngIf="att.size" class="text-gray-500 shrink-0">{{ att.size }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="px-6 text-[12px] text-gray-500 mb-3">{{ replies().length }} replies</div>

        <!-- Replies -->
        <div *ngFor="let r of replies(); let i = index"
             class="px-4 mb-3 group/threadreply min-w-0">
          <div class="flex gap-3 min-w-0">
            <app-avatar [user]="senderFor(r.sender)" [size]="36"></app-avatar>
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2 min-w-0">
                <span class="text-[14px] font-semibold truncate">{{ senderFor(r.sender)?.name }}</span>
                <span class="text-[11px] text-gray-500 shrink-0">{{ r.time }}</span>
                <button
                  (click)="startQuoteReply(r.sender, r.text, r.html)"
                  class="opacity-0 group-hover/threadreply:opacity-100 transition p-1 hover:bg-gray-100 rounded text-gray-500 ml-auto"
                  title="Reply with quote"
                >
                  <app-icon name="quote" [size]="12"></app-icon>
                </button>
              </div>
              <div [class]="replyBubbleClass(r)" style="overflow-wrap: anywhere;">
                <!-- Quoted -->
                <div *ngIf="r.quoted as q"
                     class="text-[12px] mb-1.5 pb-1.5 border-b border-black/5">
                  <div class="font-medium text-gray-700 flex items-center gap-1">
                    <app-icon name="quote" [size]="10" class="text-gray-500"></app-icon>
                    {{ q.sender }}
                  </div>
                  <div class="text-gray-600 line-clamp-2 mt-0.5">{{ q.text }}</div>
                </div>
                <!-- Body -->
                <div *ngIf="r.html; else replyText"
                     class="message-html"
                     [innerHTML]="r.html | safeHtml"></div>
                <ng-template #replyText>{{ r.text }}</ng-template>
              </div>
              <!-- Reactions (if any in initial data) -->
              <div *ngIf="r.reactions?.length" class="flex gap-1 mt-1">
                <div *ngFor="let rx of r.reactions"
                     class="flex items-center gap-1 text-[12px] rounded-full px-2 py-0.5 bg-blue-50 border border-blue-200">
                  <span>{{ rx.emoji }}</span>
                  <span class="text-gray-700">{{ rx.count }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Reply-with-quote preview banner inside thread -->
      <div *ngIf="threadReplyingTo()"
           class="mx-3 mb-2 flex items-start gap-2 px-3 py-2 bg-blue-50/60 border border-blue-100 rounded-lg">
        <div class="w-0.5 self-stretch bg-blue-500 rounded-full shrink-0 mt-0.5"></div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1 text-[11px] font-medium text-blue-700">
            <app-icon name="quote" [size]="10"></app-icon>
            <span>Replying to {{ threadReplyingTo()!.senderName }}</span>
          </div>
          <div class="text-[12px] text-gray-600 line-clamp-2 mt-0.5 break-words">
            {{ threadReplyingTo()!.text }}
          </div>
        </div>
        <button (click)="threadReplyingTo.set(null)" class="p-0.5 rounded hover:bg-gray-200 text-gray-500 shrink-0">
          <app-icon name="x" [size]="13"></app-icon>
        </button>
      </div>

      <!-- Quick replies -->
      <div class="px-4 pb-2 flex gap-2 flex-wrap">
        <button *ngFor="let q of QUICK_REPLIES"
                (click)="sendReply(q)"
                class="text-[13px] text-blue-700 border border-gray-200 hover:bg-blue-50 transition rounded-full px-3.5 py-1">
          {{ q }}
        </button>
      </div>

      <!-- Composer (per-thread convId) -->
      <div class="px-3 pb-3">
        <app-composer
          [convId]="'thread-' + parent.id"
          [draft]="threadDraft()"
          [isMobile]="false"
          (send)="onSend($event)"
          (draftChange)="threadDraft.set($event)"
        ></app-composer>
      </div>
    </aside>
  `,
})
export class ThreadPanelComponent implements OnChanges {
  state = inject(ChatStateService);

  @Input({ required: true }) parent!: Message;
  @Input() fullscreen = false;
  @Input() width = 380;
  @Output() closed = new EventEmitter<void>();
  @Output() startResize = new EventEmitter<MouseEvent>();

  closing = signal(false);
  replies = signal<DisplayReply[]>([]);
  threadReplyingTo = signal<ThreadReplyContext | null>(null);
  threadDraft = signal("");

  readonly QUICK_REPLIES = ["Okay, sure", "Sure, will do", "Okay, done"];

  ngOnChanges(c: SimpleChanges): void {
    if ("parent" in c && this.parent) {
      this.replies.set([...((this.parent.thread?.replies as DisplayReply[]) || [])]);
      this.threadReplyingTo.set(null);
      this.threadDraft.set("");
    }
  }

  get parentSender(): Sender | null {
    return this.parent?.sender ? (SENDERS[this.parent.sender] || null) : null;
  }

  senderFor(id: string): Sender | null {
    return SENDERS[id] || null;
  }

  get asideClass(): string {
    // Fullscreen mode covers the viewport via fixed positioning. In dock mode
    // we need explicit h-full so the inner flex layout (header / scrollable
    // replies / composer) actually fills the host height.
    //
    // `relative` is only included in dock mode — it's needed there to anchor
    // the absolutely-positioned resize handle. On fullscreen mobile, having
    // `relative` would override `fixed` (Tailwind's CSS source orders
    // `relative` after `fixed`, so the later rule wins) — that drops the
    // panel out of fullscreen and into normal flow, leaving content at the
    // top and a blank gap below the composer.
    const fs = this.fullscreen ? "fixed inset-0 z-50" : "shrink-0 h-full relative";
    const anim = this.closing() ? "side-panel-out" : "side-panel-in";
    return `group/threadpanel ${fs} flex flex-col border-l border-gray-200 bg-white overflow-hidden ${anim}`;
  }

  replyBubbleClass(r: DisplayReply): string {
    const tone = r.sender === "me" ? "bg-blue-100" : "bg-gray-100";
    return `text-[14px] mt-1 rounded-2xl rounded-tl-sm px-3 py-1.5 inline-block max-w-full break-words ${tone}`;
  }

  startQuoteReply(senderId?: string, text?: string, html?: string): void {
    if (!senderId) return;
    const senderObj = SENDERS[senderId] || ({ name: "Unknown" } as Sender);
    const excerpt = html
      ? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : (text || "");
    this.threadReplyingTo.set({
      senderId,
      senderName: senderObj.name,
      text: excerpt.slice(0, 200),
    });
  }

  sendReply(payload: string | { html: string; text: string }): void {
    let html = "", plain = "";
    if (typeof payload === "string") {
      plain = payload.trim(); html = plain;
    } else {
      html = payload.html || "";
      plain = (payload.text || "").trim();
    }
    if (!plain) return;
    const newReply: DisplayReply = { sender: "me", time: "now", text: "" };
    const stripped = html.replace(/<[^>]+>/g, "").trim();
    const useHtml = html && (stripped !== plain
      || /<(strong|em|u|s|code|ul|ol|li|table|h[1-3]|blockquote|span|a)\b/i.test(html));
    if (useHtml) {
      newReply.html = html;
      newReply.text = "";
    } else {
      newReply.text = plain;
    }
    const target = this.threadReplyingTo();
    if (target) {
      newReply.quoted = {
        sender: target.senderName,
        senderId: target.senderId,
        text: target.text,
      };
    }
    this.replies.set([...this.replies(), newReply]);
    this.threadDraft.set("");
    this.threadReplyingTo.set(null);
  }

  onSend(e: { html: string; text: string }): void { this.sendReply(e); }

  handleClose(): void {
    if (this.closing()) return;
    this.closing.set(true);
    setTimeout(() => this.closed.emit(), 180);
  }
}
