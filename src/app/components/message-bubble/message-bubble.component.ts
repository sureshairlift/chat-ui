import {
  ChangeDetectionStrategy, Component, ElementRef, EventEmitter,
  HostListener, Input, OnDestroy, Output, ViewChild, computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ChatStateService } from "../../services/chat-state.service";
import { ToastService } from "../../services/toast.service";
import { SENDERS } from "../../data/senders";
import { Message, Reaction, Sender } from "../../models/types";

import { IconComponent } from "../icon/icon.component";
import { AvatarComponent } from "../avatar/avatar.component";
import { AttachmentRendererComponent } from "../attachment/attachment.component";
import { AIChartMessageComponent } from "../ai-chart-message/ai-chart-message.component";
import { AIListMessageComponent } from "../ai-list-message/ai-list-message.component";
import { AIRatedMessageComponent } from "../ai-rated-message/ai-rated-message.component";
import { ReactionBarComponent } from "../reaction-bar/reaction-bar.component";
import { RenderTextPipe, SafeHtmlPipe } from "../../pipes/render-text.pipe";

/**
 * Single chat message — handles every variant in one component.
 * Mirrors React `<MessageBubble>` 1:1 (~310 lines original).
 *
 * Variants:
 *   - "system"   : centered pin-board notice
 *   - "meeting"  : Google-Meet style join card
 *   - "quote"    : reply with quoted parent
 *   - "ai-*"     : delegated to AI* sub-components (chart/list/rated)
 *   - default    : plain bubble with text/html, attachments, reactions, thread chip
 *
 * Hover reveals a small action toolbar (react/reply/thread/more). The "More"
 * menu offers Copy/Pin/Save and (for own messages) Edit/Delete. Edit mode
 * swaps the bubble for a textarea with Save / Cancel buttons.
 */
@Component({
  selector: "app-message-bubble",
  standalone: true,
  imports: [
    CommonModule, FormsModule, IconComponent, AvatarComponent,
    AttachmentRendererComponent, AIChartMessageComponent,
    AIListMessageComponent, AIRatedMessageComponent, ReactionBarComponent,
    RenderTextPipe, SafeHtmlPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- System message — centered pinned-to-board notice -->
    <ng-container *ngIf="msg.type === 'system'; else nonSystem">
      <div class="flex items-center justify-center gap-2 py-2">
        <app-icon name="pin" [size]="14" class="text-orange-500"></app-icon>
        <span class="text-[12px] text-gray-600">
          <span class="font-medium">Rajsuresh Airlift</span> pinned a message to the board
        </span>
      </div>
    </ng-container>

    <!-- AI rich/text — different layout (left-aligned, sparkle avatar, AI chip) -->
    <ng-template #nonSystem>
      <ng-container *ngIf="isAIRich || isAIText; else regular">
        <div class="group flex gap-3 px-3 sm:px-6 py-1">
          <div class="w-9 shrink-0 flex justify-center pt-1">
            <div *ngIf="showAvatar"
                 class="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-sm">
              <app-icon name="sparkles" [size]="14" class="text-white"></app-icon>
            </div>
          </div>
          <div class="flex-1 min-w-0">
            <div *ngIf="showAvatar" class="flex items-baseline gap-2 mb-1">
              <span class="text-[14px] font-semibold text-gray-900">Airlift Intelligence</span>
              <span class="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gradient-to-r from-blue-100 to-purple-100 text-purple-700">
                AI
              </span>
              <span class="text-[11px] text-gray-500">{{ msg.time }}</span>
            </div>
            <app-ai-chart-message *ngIf="msg.type === 'ai-chart'" [msg]="msg"></app-ai-chart-message>
            <app-ai-list-message  *ngIf="msg.type === 'ai-list'"  [msg]="msg"></app-ai-list-message>
            <app-ai-rated-message *ngIf="msg.type === 'ai-rated'" [msg]="msg"></app-ai-rated-message>
            <div *ngIf="msg.type === 'ai-text'"
                 class="rounded-2xl bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 border border-purple-100 px-4 py-3 max-w-lg text-[14px] leading-relaxed text-gray-900 whitespace-pre-wrap">
              {{ msg.text }}
            </div>
          </div>
        </div>
      </ng-container>

      <!-- Regular bubble (or quoted reply, or meeting card) -->
      <ng-template #regular>
        <div
          #root
          [class]="rootClass"
          (mouseenter)="hover.set(true)"
          (mouseleave)="onLeave()"
        >
          <div class="w-9 shrink-0 flex justify-center pt-1">
            <app-avatar *ngIf="showAvatar && !isMe" [user]="sender" [size]="32"></app-avatar>
          </div>

          <div [class]="'flex-1 min-w-0 ' + (isMe ? 'flex flex-col items-end' : '')">
            <!-- Author + time row -->
            <div *ngIf="showAvatar && !isMe" class="flex items-baseline gap-2 mb-0.5">
              <span class="text-[14px] font-semibold text-gray-900">{{ sender?.name }}</span>
              <span class="text-[11px] text-gray-500">{{ msg.time }}</span>
              <span *ngIf="msg.edited" class="text-[11px] text-gray-500">• Edited</span>
            </div>
            <div *ngIf="isMe && showAvatar" class="text-[11px] text-gray-500 mb-1">{{ msg.time }}</div>

            <!-- Meeting card -->
            <ng-container *ngIf="msg.type === 'meeting'; else bubble">
              <div class="rounded-2xl overflow-hidden max-w-md w-full shadow-sm border border-gray-200">
                <div class="bg-blue-600 px-5 pt-4 pb-8 relative">
                  <div class="text-white text-[18px] font-medium">Video meeting</div>
                  <div class="text-blue-100 text-[12px]">Google Meet</div>
                  <app-icon name="video" [size]="56" [strokeWidth]="1.2" class="text-white/80 mx-auto mt-3 block"></app-icon>
                </div>
                <button class="w-full bg-white px-4 py-2.5 flex items-center gap-2 text-[13px] text-gray-700 hover:bg-gray-50">
                  <svg width="16" height="16" viewBox="0 0 24 24"><rect width="24" height="24" fill="#fbbc04" rx="4"/></svg>
                  Join video meeting
                </button>
              </div>
            </ng-container>

            <!-- Standard bubble -->
            <ng-template #bubble>
              <div [class]="bubbleClass">
                <!-- Quoted reply -->
                <div *ngIf="msg.type === 'quote' && msg.quoted"
                     class="text-[12px] mb-1.5 pb-1.5 border-b border-black/5">
                  <div class="font-medium text-gray-700 flex items-center gap-1">
                    <app-avatar
                      *ngIf="msg.quoted.senderId && quotedSender"
                      [user]="quotedSender"
                      [size]="14"
                    ></app-avatar>
                    <app-icon name="quote" [size]="10" class="text-gray-500"></app-icon>
                    {{ msg.quoted.sender }}
                  </div>
                  <div class="text-gray-600 line-clamp-2 mt-0.5">{{ msg.quoted.text }}</div>
                </div>

                <!-- Edit mode -->
                <div *ngIf="editing(); else readOnly" class="flex flex-col gap-2 min-w-[220px]">
                  <textarea
                    #editArea
                    [ngModel]="editValue()"
                    (ngModelChange)="editValue.set($event)"
                    (keydown.escape)="cancelEdit()"
                    (keydown.meta.enter)="submitEdit()"
                    (keydown.control.enter)="submitEdit()"
                    [rows]="editRows()"
                    class="text-[14px] leading-[1.45] bg-white border border-blue-300 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                  ></textarea>
                  <div class="flex items-center justify-end gap-2">
                    <button
                      (click)="cancelEdit()"
                      class="text-[12px] px-2 py-1 hover:bg-gray-100 rounded text-gray-700"
                    >Cancel</button>
                    <button
                      (click)="submitEdit()"
                      [disabled]="!editValue().trim()"
                      [class]="'text-[12px] px-2.5 py-1 rounded ' +
                        (editValue().trim() ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed')"
                    >Save</button>
                  </div>
                </div>

                <!-- Read-only: html or text -->
                <ng-template #readOnly>
                  <div *ngIf="msg.html; else textOnly"
                       class="text-[14px] leading-[1.45] break-words message-html"
                       [innerHTML]="msg.html | safeHtml">
                  </div>
                  <ng-template #textOnly>
                    <div class="text-[14px] leading-[1.45] whitespace-pre-wrap break-words"
                         [innerHTML]="msg.text | renderText">
                    </div>
                  </ng-template>
                </ng-template>

                <!-- Hover action toolbar -->
                <div *ngIf="hover()"
                     [class]="'absolute -top-4 z-20 ' + (isMe ? 'left-2' : 'right-2')">
                  <div class="flex items-center bg-white border border-gray-200 rounded-full shadow-sm">
                    <button
                      (click)="$event.stopPropagation(); togglePicker()"
                      class="w-7 h-7 shrink-0 flex items-center justify-center hover:bg-gray-100 rounded-full text-gray-600"
                      title="Add reaction"
                    >
                      <app-icon name="smile" [size]="14"></app-icon>
                    </button>
                    <button
                      (click)="onReply()"
                      class="w-7 h-7 shrink-0 flex items-center justify-center hover:bg-gray-100 rounded-full text-gray-600"
                      title="Reply with quote"
                    >
                      <app-icon name="quote" [size]="14"></app-icon>
                    </button>
                    <button
                      (click)="openThread.emit(msg.id)"
                      class="w-7 h-7 shrink-0 flex items-center justify-center hover:bg-gray-100 rounded-full text-gray-600"
                      [title]="msg.thread ? 'Open thread' : 'Reply in thread'"
                    >
                      <app-icon name="message-circle-more" [size]="14"></app-icon>
                    </button>
                    <div class="relative" #menuRef>
                      <button
                        (click)="$event.stopPropagation(); toggleMenu()"
                        [class]="'w-7 h-7 shrink-0 flex items-center justify-center rounded-full ' +
                          (showMenu() ? 'bg-gray-200 text-gray-800' : 'hover:bg-gray-100 text-gray-600')"
                        title="More"
                      >
                        <app-icon name="more-horizontal" [size]="14"></app-icon>
                      </button>
                      <div *ngIf="showMenu()"
                           [class]="moreMenuClass">
                        <button
                          (click)="copyText()"
                          class="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 text-gray-700 text-left"
                        >
                          <app-icon name="copy" [size]="14" class="text-gray-500"></app-icon>
                          Copy text
                        </button>
                        <button
                          (click)="onTogglePin()"
                          class="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 text-gray-700 text-left"
                        >
                          <app-icon name="pin" [size]="14"
                                    [class]="isPinned ? 'text-amber-600' : 'text-gray-500'"></app-icon>
                          {{ isPinned ? 'Unpin' : 'Pin' }}
                        </button>
                        <button
                          (click)="onToggleSave()"
                          class="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 text-gray-700 text-left"
                        >
                          <app-icon name="bookmark" [size]="14"
                                    [class]="isSaved ? 'text-blue-600' : 'text-gray-500'"></app-icon>
                          {{ isSaved ? 'Unsave' : 'Save' }}
                        </button>
                        <ng-container *ngIf="isMe">
                          <div class="h-px bg-gray-100 my-1"></div>
                          <button
                            (click)="startEdit()"
                            class="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 text-gray-700 text-left"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z"/>
                            </svg>
                            Edit
                          </button>
                          <button
                            (click)="onDelete()"
                            class="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-red-50 text-red-600 text-left"
                          >
                            <app-icon name="trash-2" [size]="14"></app-icon>
                            Delete
                          </button>
                        </ng-container>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Reaction picker -->
                <div *ngIf="pickerFor()"
                     [class]="'absolute -top-12 z-30 ' + (isMe ? 'left-0' : 'right-0')">
                  <app-reaction-bar
                    [msgId]="msg.id"
                    (react)="onReact($event)"
                  ></app-reaction-bar>
                </div>
              </div>
            </ng-template>

            <!-- Attachments -->
            <app-attachment-renderer *ngIf="msg.attachments?.length"
                                     [attachments]="msg.attachments">
            </app-attachment-renderer>

            <!-- Reaction chips -->
            <div *ngIf="reactionList().length > 0"
                 [class]="'flex items-center gap-1 mt-1 ' + (isMe ? 'flex-row-reverse' : '')">
              <button
                *ngFor="let r of reactionList()"
                (click)="onReact({ msgId: msg.id, emoji: r.emoji })"
                [class]="reactionChipClass(r)"
              >
                <span>{{ r.emoji }}</span>
                <span class="text-gray-700">{{ r.count }}</span>
              </button>
            </div>

            <!-- Thread chip -->
            <button *ngIf="msg.thread"
                    (click)="openThread.emit(msg.id)"
                    class="mt-1 flex items-center gap-2 text-[12px] text-blue-700 hover:underline">
              <app-icon name="chevron-right" [size]="12"></app-icon>
              <span class="font-medium">{{ msg.thread.count }} replies</span>
              <span class="text-gray-500">{{ msg.thread.lastTime }}</span>
            </button>
          </div>
        </div>
      </ng-template>
    </ng-template>
  `,
})
export class MessageBubbleComponent implements OnDestroy {
  state = inject(ChatStateService);
  toast = inject(ToastService);

  @Input({ required: true }) msg!: Message;
  @Input() prevMsg: Message | null = null;
  @Input() convId!: string;
  @Input() highlightQuery = false;
  @Input() highlight = false;
  @Output() openThread = new EventEmitter<string>();
  @Output() reply = new EventEmitter<{ msg: Message; sender: Sender | null }>();

  hover = signal(false);
  showMenu = signal(false);
  pickerFor = signal(false);
  editing = signal(false);
  editValue = signal("");

  @ViewChild("editArea") editArea?: ElementRef<HTMLTextAreaElement>;

  get isMe(): boolean { return this.msg.sender === "me"; }
  get isAI(): boolean { return this.msg.sender === "airliftai"; }
  get isAIRich(): boolean {
    return this.msg.type === "ai-chart" || this.msg.type === "ai-list" || this.msg.type === "ai-rated";
  }
  get isAIText(): boolean { return this.msg.type === "ai-text"; }

  get sender(): Sender | null {
    return this.msg.sender ? (SENDERS[this.msg.sender] || null) : null;
  }
  get quotedSender(): Sender | null {
    const id = this.msg.quoted?.senderId;
    return id ? (SENDERS[id] || null) : null;
  }

  get showAvatar(): boolean {
    return !this.prevMsg || this.prevMsg.sender !== this.msg.sender || this.prevMsg.type === "system";
  }

  get isPinned(): boolean {
    return (this.state.pinnedMsgs()[this.convId] || []).includes(this.msg.id);
  }
  get isSaved(): boolean {
    return !!this.state.savedMsgs()[this.msg.id];
  }

  reactionList = computed<Reaction[]>(() => {
    // Prefer in-state reactions; fall back to msg.reactions provided in initial data
    const live = this.state.reactions()[this.msg.id];
    if (live && live.length > 0) return live;
    return this.msg.reactions || [];
  });

  editRows = computed(() =>
    Math.min(6, Math.max(2, this.editValue().split("\n").length))
  );

  /* ------------------------------ Layout ------------------------------ */
  get rootClass(): string {
    const base = "group relative flex gap-3 px-3 sm:px-6 py-1 hover:bg-gray-50/60 transition-colors";
    const dir = this.isMe ? "flex-row-reverse" : "";
    const high = this.highlight ? "bg-amber-50 ring-1 ring-amber-300 ring-inset rounded-md" : "";
    return `${base} ${dir} ${high}`;
  }

  get bubbleClass(): string {
    const base = "relative rounded-2xl px-3.5 py-2 max-w-[85%] inline-block";
    const tone = this.isMe
      ? "bg-blue-100 text-gray-900 rounded-tr-sm"
      : "bg-gray-100 text-gray-900 rounded-tl-sm";
    const ring = this.highlightQuery ? "ring-2 ring-yellow-300 ring-offset-1" : "";
    return `${base} ${tone} ${ring}`;
  }

  get moreMenuClass(): string {
    const side = this.isMe ? "right-0" : "left-0";
    return `absolute ${side} top-full mt-1 z-30 bg-white rounded-lg shadow-lg ring-1 ring-gray-200 py-1 min-w-[170px] text-[13px] side-panel-in`;
  }

  reactionChipClass(r: Reaction): string {
    // Note: source data didn't include "by" in initial messages — we use a simple color rule
    return "flex items-center gap-1 text-[12px] rounded-full px-2 py-0.5 border bg-white border-gray-200 hover:bg-gray-50";
  }

  /* ------------------------------ Handlers ----------------------------- */

  onLeave(): void {
    this.hover.set(false);
    // Don't clear menu/picker on leave — they have their own click-away
  }

  togglePicker(): void {
    this.pickerFor.set(!this.pickerFor());
    this.showMenu.set(false);
  }

  toggleMenu(): void {
    const next = !this.showMenu();
    this.showMenu.set(next);
    if (next) {
      // Click-away binding
      setTimeout(() => {
        document.addEventListener("mousedown", this.onAway);
      }, 0);
    } else {
      document.removeEventListener("mousedown", this.onAway);
    }
  }

  private onAway = (ev: MouseEvent) => {
    // Naive: close on any document mousedown.
    this.showMenu.set(false);
    this.pickerFor.set(false);
    document.removeEventListener("mousedown", this.onAway);
  };

  onReact(e: { msgId: string; emoji: string }): void {
    this.state.toggleReaction(e.msgId, e.emoji);
    this.pickerFor.set(false);
  }

  onTogglePin(): void {
    this.state.togglePin(this.convId, this.msg.id);
    this.toast.show(this.isPinned ? "Unpinned" : "Pinned to board");
    this.showMenu.set(false);
  }

  onToggleSave(): void {
    this.state.toggleSave(this.msg.id);
    this.toast.show(this.isSaved ? "Removed from saved" : "Saved");
    this.showMenu.set(false);
  }

  copyText(): void {
    const txt = this.msg.html
      ? this.msg.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : (this.msg.text || "");
    if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => {});
    this.showMenu.set(false);
    this.toast.show("Copied to clipboard");
  }

  startEdit(): void {
    const plain = this.msg.html
      ? this.msg.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : (this.msg.text || "");
    this.editValue.set(plain);
    this.editing.set(true);
    this.showMenu.set(false);
    setTimeout(() => this.editArea?.nativeElement?.focus(), 0);
  }

  submitEdit(): void {
    const v = this.editValue().trim();
    if (!v) return;
    this.state.editMessage(this.convId, this.msg.id, { text: v, html: undefined });
    this.editing.set(false);
  }

  cancelEdit(): void {
    this.editing.set(false);
    this.editValue.set("");
  }

  onDelete(): void {
    this.state.deleteMessage(this.convId, this.msg.id);
    this.toast.show("Message deleted");
    this.showMenu.set(false);
  }

  onReply(): void {
    this.reply.emit({ msg: this.msg, sender: this.sender });
  }

  ngOnDestroy(): void {
    document.removeEventListener("mousedown", this.onAway);
  }
}
