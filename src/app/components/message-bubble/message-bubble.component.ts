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
import { LinkPreviewComponent } from "../link-preview/link-preview.component";
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
    LinkPreviewComponent, RenderTextPipe, SafeHtmlPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./message-bubble.component.html",
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

  /** Extract up to 2 distinct URLs from the message body so they can be
   *  rendered as inline preview cards below the bubble. Skips system /
   *  meeting / AI variants since those aren't user-typed text. Cached
   *  per-instance via a memoized getter — `msg` is a fixed `@Input` per
   *  bubble so we only need to compute once. */
  private _links: string[] | null = null;
  links(): string[] {
    if (this._links !== null) return this._links;
    const m = this.msg;
    if (!m || m.type === "system" || m.type === "meeting"
        || m.type === "ai-chart" || m.type === "ai-list") {
      return (this._links = []);
    }
    const haystack = (m.text || "") + " " +
      (m.html ? m.html.replace(/<[^>]+>/g, " ") : "");
    const urlRe = /https?:\/\/[^\s<>"']+/g;
    const seen = new Set<string>();
    const out: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = urlRe.exec(haystack)) !== null && out.length < 2) {
      const u = match[0].replace(/[.,;:!?]+$/, "");  // strip trailing punctuation
      if (!seen.has(u)) { seen.add(u); out.push(u); }
    }
    return (this._links = out);
  }

  editRows = computed(() =>
    Math.min(6, Math.max(2, this.editValue().split("\n").length))
  );

  /* ------------------------------ Layout ------------------------------ */
  get rootClass(): string {
    const base = "group relative flex gap-3 px-3 sm:px-6 py-1 transition-colors";
    const hover = this.isSelected ? "bg-blue-50/80" : "hover:bg-gray-50/60";
    const dir = this.isMe ? "flex-row-reverse" : "";
    const high = this.highlight ? "bg-amber-50 ring-1 ring-amber-300 ring-inset rounded-md" : "";
    return `${base} ${hover} ${dir} ${high}`;
  }

  /** True when this message is part of the current bulk-select set. */
  get isSelected(): boolean {
    return this.state.selectedMsgs().has(this.msg.id);
  }
  /** True when the user is in "selection mode" (>=1 message selected) — used
   *  to keep the checkbox visible on every bubble, not just the hovered one. */
  get inSelectionMode(): boolean {
    return this.state.selectedMsgs().size > 0;
  }
  /** Toggle this message's selection. Stops propagation so a click on the
   *  checkbox doesn't also fire other bubble interactions. */
  onToggleSelect(e: Event): void {
    e.stopPropagation();
    // In delete mode, only the user's own messages can be selected.
    if (this.state.pendingBulkAction() === "delete" && !this.isMe) return;
    this.state.toggleMsgSelection(this.msg.id);
  }

  /** Whether the selection checkbox should render at all for this bubble.
   *  Visible only after the user has picked Save / Forward / Delete from
   *  the More menu — that's what kicks the app into selection mode. In
   *  delete mode, others' messages don't get a checkbox (delete is
   *  restricted to own messages). */
  get showCheckbox(): boolean {
    const action = this.state.pendingBulkAction();
    if (!action) return false;
    if (action === "delete" && !this.isMe) return false;
    return true;
  }

  /** Selection checkbox styling — only used when `showCheckbox` is true.
   *  Filled blue when selected, hollow gray ring otherwise. */
  get checkboxClass(): string {
    const base = "absolute inset-0 m-auto w-5 h-5 rounded-full flex items-center justify-center transition cursor-pointer";
    const tone = this.isSelected
      ? "bg-blue-600 ring-2 ring-blue-600 hover:bg-blue-700"
      : "bg-white ring-2 ring-gray-300 hover:ring-blue-500";
    return `${base} ${tone}`;
  }

  /* ============== Bulk-mode entry from the More menu ============== */

  onEnterBulkSave(): void {
    this.state.enterBulkMode("save", this.msg.id);
    this.showMenu.set(false);
  }
  onEnterBulkForward(): void {
    this.state.enterBulkMode("forward", this.msg.id);
    this.showMenu.set(false);
  }
  onEnterBulkDelete(): void {
    if (!this.isMe) return; // Defensive — Delete item is only rendered for own msgs
    this.state.enterBulkMode("delete", this.msg.id);
    this.showMenu.set(false);
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

  /** Create a task in the current conv with this message's text as the
   *  title. Opens the Tasks side panel afterwards so the user can see /
   *  edit it. Title is truncated at 80 chars to keep the task list clean. */
  onCreateTask(): void {
    const raw = this.msg.html
      ? this.msg.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : (this.msg.text || "").trim();
    if (!raw) {
      this.showMenu.set(false);
      return;
    }
    const title = raw.length > 80 ? raw.slice(0, 80) + "…" : raw;
    this.state.addTask(this.convId, {
      id: `task-${Date.now()}`,
      title,
      done: false,
      assignee: "me",
    });
    this.state.openTasks();
    this.toast.show("Task created");
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
