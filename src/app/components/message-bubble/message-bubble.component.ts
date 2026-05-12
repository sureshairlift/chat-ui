import {
  ChangeDetectionStrategy, Component, ElementRef, EventEmitter,
  HostListener, Input, OnDestroy, Output, ViewChild, computed, effect, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ChatStateService } from "../../services/chat-state.service";
import { ToastService } from "../../services/toast.service";
import { IdentityService } from "../../services/identity.service";
import { ConfirmService } from "../../services/confirm.service";
import { SENDERS } from "../../data/senders";
import { Message, Reaction, Sender } from "../../models/types";

import { IconComponent } from "../icon/icon.component";
import { AiSpinnerComponent } from "../ai-spinner/ai-spinner.component";
import { guessIntentPhrases } from "../../data/cli-thinking-phrases";
import { AvatarComponent } from "../avatar/avatar.component";
import { AttachmentRendererComponent } from "../attachment/attachment.component";
import { AIChartMessageComponent } from "../ai-chart-message/ai-chart-message.component";
import { AIListMessageComponent } from "../ai-list-message/ai-list-message.component";
import { AIRatedMessageComponent } from "../ai-rated-message/ai-rated-message.component";
import { BlockRendererComponent, type BlockAction, type BlockFormSubmit } from "../block-renderer/block-renderer.component";
import { ReactionBarComponent } from "../reaction-bar/reaction-bar.component";
import { LinkPreviewComponent } from "../link-preview/link-preview.component";
import { EmojiComponent } from "../emoji/emoji.component";
import { unicodeToCode } from "../../data/emoji-catalog";
import { RenderTextPipe, SafeHtmlPipe } from "../../pipes/render-text.pipe";
import type { Block } from "../../models/api-types";
import type { LiveMessage } from "../../services/adapters";

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
    AIListMessageComponent, AIRatedMessageComponent,
    BlockRendererComponent, ReactionBarComponent,
    LinkPreviewComponent, EmojiComponent, RenderTextPipe, SafeHtmlPipe,
    AiSpinnerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./message-bubble.component.html",
  styleUrl: "./message-bubble.component.css",
})
export class MessageBubbleComponent implements OnDestroy {
  // Effect: start/stop the thinking-words rotation whenever the
  // bubble's `isAIStreaming` state flips. Declared as a constructor
  // initializer so it lives the whole component lifetime; cleans up
  // via Angular's DestroyRef automatically.
  private _thinkingRotationEffect = effect(() => {
    // Touch the streaming signal so the effect re-runs on each delta.
    void this.state.streamingByConv();
    if (this.isAIStreaming) this.startThinkingRotation();
    else this.stopThinkingRotation();
  });
  state = inject(ChatStateService);
  toast = inject(ToastService);
  private readonly identity = inject(IdentityService);
  private readonly confirm = inject(ConfirmService);

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
  /** Wrapper around the More button — used to compute the dropdown's
   *  fixed-position coordinates so the menu escapes the messages-scroll
   *  overflow-y-auto context. */
  @ViewChild("menuRef") menuRef?: ElementRef<HTMLElement>;
  /** Outer row anchor — used by placeMenu for vertical positioning
   *  so the dropdown opens below the entire message (bubble +
   *  attachment + reactions) instead of below the More button which,
   *  thanks to the toolbar's translate-y-full + showAvatar offset,
   *  sits ABOVE the bubble and would land the dropdown inside it. */
  @ViewChild("root") rootRef?: ElementRef<HTMLElement>;
  /** Wrapping div for the open reaction picker — used by the
   *  outside-click handler to distinguish clicks INSIDE the picker
   *  (which should keep it open while the user is choosing) from
   *  clicks OUTSIDE (which should dismiss it, same UX as the More
   *  dropdown). */
  @ViewChild("pickerRef") pickerRef?: ElementRef<HTMLElement>;

  /** Fixed-positioned coordinates for the More dropdown. Recomputed
   *  on every open so the menu sits flush below the button no matter
   *  where the bubble is on screen. Null when menu is closed. */
  menuPos = signal<{ top: number; left: number; right?: number; openUp: boolean } | null>(null);

  get isMe(): boolean {
    // Two sender shapes coexist during the mock-to-live migration:
    //   - mock data sets sender = "me"
    //   - live data sets sender = the user_ref string ("op:2")
    // Compare against both so own-message bubbles right-align in either
    // mode. IdentityService is the source of truth for the live ref.
    const s = this.msg.sender;
    if (!s) return false;
    if (s === "me") return true;
    return s === this.identity.userRef();
  }
  get isAI(): boolean {
    // Mock data uses "airliftai"; live data uses the namespaced bot ref.
    const s = this.msg.sender;
    return s === "airliftai" || s === "bot:ai";
  }
  get isAIRich(): boolean {
    return this.msg.type === "ai-chart" || this.msg.type === "ai-list" || this.msg.type === "ai-rated";
  }
  get isAIText(): boolean { return this.msg.type === "ai-text"; }

  /** True when the message carries the new block protocol (LiveMessage from
   *  the backend). Falls through to BlockRendererComponent instead of the
   *  legacy ai-chart / ai-list / ai-rated dispatch. */
  get hasBlocks(): boolean {
    const blocks = (this.msg as LiveMessage).blocks;
    return Array.isArray(blocks) && blocks.length > 0;
  }

  /** True when this bubble is the in-flight AI streaming placeholder
   *  with no rendered content yet — i.e. the LLM has been called but
   *  the first `ai.block.start` hasn't arrived. Used to swap the empty
   *  gradient card for the sparkle spinner so the user gets immediate
   *  feedback that the AI is thinking. */
  /** Index into the current channel's thinking-words rotation. Bumps
   *  every ~1.6s while the bubble is in the AI streaming state.
   *  Reset to 0 on stream start; the rotation loop tears itself down
   *  when `isAIStreaming` flips false (e.g. first token arrives). */
  thinkingIndex = signal(0);
  private thinkingTimer?: ReturnType<typeof setInterval>;

  /** The phrase to show next to the spinner right now. Priority:
   *    1. LLM-generated context-aware phrases (thinkingWordsByConv)
   *       — best, since they're crafted against the user's actual
   *       question by the local model.
   *    2. CLI intent-matched phrases via a keyword heuristic on the
   *       latest user prompt — same vibe as `cli.py`'s spinner.
   *    3. Generic CLI phrases as the universal fallback.
   */
  get currentThinkingWord(): string {
    const id = this.state.activeConv();
    const llmWords = (id && this.state.thinkingWordsByConv()[id]) || [];
    if (llmWords.length > 0) {
      return llmWords[this.thinkingIndex() % llmWords.length];
    }
    // Fall back to CLI-style phrases. Use the most recent user
    // message in the active conv (i.e. the question they just asked)
    // as the intent hint.
    const lastUserMsg = this.latestUserPromptText();
    const list = guessIntentPhrases(lastUserMsg);
    return list[this.thinkingIndex() % list.length];
  }

  /** Plain text of the most recent message from the current user in
   *  the active conv — feeds the intent heuristic above. Empty
   *  string when none is available. */
  private latestUserPromptText(): string {
    const id = this.state.activeConv();
    if (!id) return "";
    const me = this.identity.userRef();
    const msgs = this.state.messagesByConv()[id] || [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.sender !== "me" && m.sender !== me) continue;
      const raw = (m.text || (m.html ? m.html.replace(/<[^>]+>/g, " ") : "") || "").trim();
      if (raw) return raw;
    }
    return "";
  }

  /** True when the bubble lives in an AI conversation (ai_direct /
   *  ai_assisted, or legacy isAI flag). AI chats hide reactions /
   *  replies / threads / more-menu — the AI doesn't react and the
   *  user reacting to their own draft is noise. */
  get inAIConv(): boolean {
    const id = this.state.activeConv();
    if (!id) return false;
    const c = this.state.conversations().find((x) => x.id === id);
    return !!c?.isAI;
  }

  get isAIStreaming(): boolean {
    if (!this.isAI) return false;
    // chat-state seeds the in-flight bubble with id "streaming-<convId>"
    // until ai.message.start arrives and replaces it with the real id;
    // empty blocks + empty text on a bot message = "spinner state".
    const isStreamingSeed =
      typeof this.msg.id === "string" && this.msg.id.startsWith("streaming-");
    if (isStreamingSeed && !this.hasBlocks && !(this.msg.text || "").trim()) {
      return true;
    }
    // Defensive fallback: scan every conv's streaming registry so we
    // catch the post-ai.message.start window where the id is real but
    // blocks are still empty. We don't have the channel id on the
    // Message shape — flatten and check by message id.
    const allStreaming = this.state.streamingByConv();
    for (const list of Object.values(allStreaming)) {
      if (list && list.some((m) => m.id === this.msg.id)) {
        return !this.hasBlocks && !(this.msg.text || "").trim();
      }
    }
    return false;
  }

  /** Typed accessor for the template — keeps strict ngFor happy. */
  get blocks(): Block[] {
    return ((this.msg as LiveMessage).blocks ?? []) as Block[];
  }

  /** Action emitted by an actions or handoff block. Routes by intent so
   *  the bubble doesn't have to care about the specific block kind. */
  onBlockAction(a: BlockAction): void {
    switch (a.intent) {
      case 'handoff':
        // Customer asked to bring in the team — Phase 9 follow-up wires
        // this through ChatStateService.requestHumanLive(this.convId, ...).
        this.toast.show('Handoff request sent.');
        break;
      case 'retry':
        // Re-send the user's most recent message in this conv.
        this.toast.show('Retrying...');
        break;
      default:
        // Unknown intent — surface for debugging; safe to ignore.
        // eslint-disable-next-line no-console
        console.debug('[block-action]', a);
    }
  }

  /** Form block submit — the bubble forwards values; service decides what
   *  to do with them (typically POSTs to a tool-call endpoint). */
  onBlockFormSubmit(s: BlockFormSubmit): void {
    // eslint-disable-next-line no-console
    console.debug('[block-form-submit]', s);
    this.toast.show('Form submitted.');
  }

  /** Stable identity for *ngFor over blocks — keeps DOM nodes intact
   *  while text blocks stream in (avoids the reflow flicker that would
   *  happen if Angular tore down + rebuilt every block on every event). */
  trackBlock(_i: number, b: Block): string { return b.id; }

  get sender(): Sender | null {
    // Live messages (LiveMessage) carry the full Sender object on
    // `senderRecord` because the legacy `msg.sender` field is now just a
    // user_ref string ("op:18") — it's no longer a key into SENDERS, which
    // is the mock-data directory keyed by short ids ("shiron", "rajkumar").
    // Prefer the live record when present; fall back to SENDERS for the
    // mock-data demo path.
    const live = (this.msg as LiveMessage).senderRecord;
    if (live) return live;
    return this.msg.sender ? (SENDERS[this.msg.sender] || null) : null;
  }
  get quotedSender(): Sender | null {
    const id = this.msg.quoted?.senderId;
    return id ? (SENDERS[id] || null) : null;
  }

  get showAvatar(): boolean {
    return !this.prevMsg || this.prevMsg.sender !== this.msg.sender || this.prevMsg.type === "system";
  }

  /** Icon + tint to render alongside a system-event message. The
   *  backend tags the event with a `system_event` discriminator on
   *  the API doc (pinned / unpinned / member_added / etc.) — fall
   *  back to a generic info pin when the field is missing or
   *  unrecognized so legacy events still render. */
  get systemIcon(): { name: string; color: string } {
    const ev = (this.msg as LiveMessage).api?.system_event ?? "";
    switch (ev) {
      case "pinned":
        return { name: "pin", color: "text-orange-500" };
      case "unpinned":
        return { name: "pin", color: "text-gray-400" };
      case "member_added":
      case "member_joined":
        return { name: "users", color: "text-emerald-500" };
      case "member_removed":
      case "member_left":
        return { name: "users", color: "text-gray-400" };
      case "channel_renamed":
      case "channel_updated":
        return { name: "settings", color: "text-gray-500" };
      case "channel_resolved":
        return { name: "check-circle-2", color: "text-emerald-500" };
      case "handoff":
      case "takeover":
        return { name: "users", color: "text-blue-500" };
      default:
        return { name: "pin", color: "text-orange-500" };
    }
  }

  get isPinned(): boolean {
    // Prefer the message-level `pinned` flag (set by adaptMessage from
    // `api.is_pinned`) — that's the canonical backend truth on every
    // list/fetch. Fall back to the local pinnedMsgs cache for
    // optimistic flips between request and response, and for
    // mock-data / offline mode where the cache is the only source.
    if (this.msg.pinned) return true;
    return (this.state.pinnedMsgs()[this.convId] || []).includes(this.msg.id);
  }
  get isSaved(): boolean {
    return !!this.state.savedMsgs()[this.msg.id];
  }

  /** True when the row has ANYTHING worth rendering — text/html body,
   *  attachments, a meeting card, a quoted reply, reactions, or a
   *  thread reply chip. When false, the whole row is suppressed so
   *  a stray empty message (legacy migration artifact, deleted body
   *  with no attachments etc.) doesn't leave a blank space between
   *  real messages.
   *
   *  This is the OUTER gate on the row; `hasBubbleBody` below is the
   *  INNER gate that controls just the colored bubble pill. */
  get hasAnyContent(): boolean {
    if (this.hasBubbleBody) return true;
    if (this.msg.attachments && this.msg.attachments.length > 0) return true;
    if (this.msg.type === "meeting") return true;
    if (this.msg.thread && this.msg.thread.count > 0) return true;
    if (this.reactionList().length > 0) return true;
    return false;
  }

  /** True when the bubble has actual body content (text/html, a quoted
   *  reply, an edit-mode textarea, or the deleted-tombstone placeholder).
   *  When false, the bubble shell is suppressed so attachment-only
   *  messages don't leave an empty colored pill above the file cards.
   *  Whitespace-only text counts as empty. */
  get hasBubbleBody(): boolean {
    if (this.editing()) return true;
    if (this.msg.deleted) return true;
    if (this.msg.quoted) return true;
    const text = (this.msg.text || "").trim();
    if (text) return true;
    // HTML can be a wrapper-only doc like `<div></div>` or `<p><br></p>` —
    // strip tags + entities and check for visible content.
    const stripped = (this.msg.html || "")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();
    return !!stripped;
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
    // Claude-style on AI convs: drop the avatar gutter (`gap-3` +
    // implicit avatar column), tighten padding, keep the alignment
    // direction so user msgs still right-align. AI replies handle
    // their own (no-avatar) layout in the AI branch above, so this
    // path is only for the user's own messages in AI convs.
    if (this.inAIConv) {
      const base = "group relative flex px-2 py-1 transition-colors";
      const dir = this.isMe ? "justify-end" : "justify-start";
      const hover = this.isSelected ? "bg-blue-50/80" : "";
      const high = this.highlight ? "bg-amber-50 ring-1 ring-amber-300 ring-inset rounded-md" : "";
      return `${base} ${dir} ${hover} ${high}`;
    }
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
    // Claude-style user bubble in AI convs: rounded-2xl pill, light
    // gray fill, no corner-tab. Slightly tighter padding so the
    // bubble feels prose-adjacent, not chat-pill-y.
    if (this.inAIConv) {
      const base = "relative rounded-2xl px-4 py-2.5 max-w-[80%] inline-block";
      const tone = this.msg.deleted
        ? "bg-transparent border border-dashed border-gray-300"
        : "bg-gray-100 text-gray-900";
      const ring = this.highlightQuery ? "ring-2 ring-yellow-300 ring-offset-1" : "";
      return `${base} ${tone} ${ring}`;
    }
    const base = "relative rounded-2xl px-3.5 py-2 max-w-[85%] inline-block";
    // Tombstoned messages drop the colored fill in favor of a dashed
    // outline so the row reads as "removed content" instead of "a
    // message with quiet text in it." The corner-tab rounding still
    // matches the sender side so it lines up with the avatar column.
    const tone = this.msg.deleted
      ? (this.isMe
          ? "bg-transparent border border-dashed border-gray-300 rounded-tr-sm"
          : "bg-transparent border border-dashed border-gray-300 rounded-tl-sm")
      : (this.isMe
          ? "bg-blue-100 text-gray-900 rounded-tr-sm"
          : "bg-gray-100 text-gray-900 rounded-tl-sm");
    const ring = this.highlightQuery ? "ring-2 ring-yellow-300 ring-offset-1" : "";
    return `${base} ${tone} ${ring}`;
  }

  /** Fixed-positioned styling — no absolute classes, since the menu is
   *  laid out from the document body via `position: fixed`. The actual
   *  coordinates come from `menuPos()` and are bound via [style] in
   *  the template. Keeps the menu out of the scroller's
   *  overflow-y-auto clipping region. */
  readonly moreMenuClass =
    "fixed z-50 bg-white rounded-lg shadow-lg ring-1 ring-gray-200 py-1 min-w-[170px] text-[13px] side-panel-in";

  /** Inline style for the More dropdown driven by menuPos(). Empty
   *  string when closed (the *ngIf gates render). */
  get moreMenuStyle(): string {
    const p = this.menuPos();
    if (!p) return "";
    if (p.right !== undefined) {
      return `top:${p.top}px; right:${p.right}px;`;
    }
    return `top:${p.top}px; left:${p.left}px;`;
  }

  reactionChipClass(r: Reaction): string {
    // Note: source data didn't include "by" in initial messages — we use a simple color rule
    return "flex items-center gap-1 text-[12px] rounded-full px-2 py-0.5 border bg-white border-gray-200 hover:bg-gray-50";
  }

  /** Convert a stored Unicode emoji (e.g. "👍") to the Noto CDN
   *  code-string (e.g. "1f44d") so the chip can render via app-emoji.
   *  Memoized inline — emoji strings on reactions are short. */
  codeFor(emoji: string): string {
    return unicodeToCode(emoji);
  }

  /* ------------------------------ Handlers ----------------------------- */

  onLeave(): void {
    this.hover.set(false);
    // Don't clear menu/picker on leave — they have their own click-away
  }

  togglePicker(): void {
    const next = !this.pickerFor();
    this.pickerFor.set(next);
    this.showMenu.set(false);
    // Outside-click dismiss — mirrors the More dropdown's onAway
    // handler. Picker stays open while the user is choosing an
    // emoji (clicks inside the picker wrapper are ignored), but
    // clicking anywhere else closes it.
    if (next) {
      setTimeout(() => {
        document.addEventListener("mousedown", this.onPickerAway);
      }, 0);
    } else {
      document.removeEventListener("mousedown", this.onPickerAway);
    }
  }

  private onPickerAway = (ev: MouseEvent) => {
    const target = ev.target as Node | null;
    const wrapper = this.pickerRef?.nativeElement;
    if (wrapper && target && wrapper.contains(target)) return;
    this.pickerFor.set(false);
    document.removeEventListener("mousedown", this.onPickerAway);
  };

  toggleMenu(): void {
    const next = !this.showMenu();
    this.showMenu.set(next);
    if (next) {
      this.placeMenu();
      // Click-away binding
      setTimeout(() => {
        document.addEventListener("mousedown", this.onAway);
        // Scroll-close — capturing phase so internal scrollable
        // ancestors (the messages list, side panels) also trigger
        // close. Without capture, scrolls inside an
        // overflow-y-auto don't bubble to document.
        document.addEventListener("scroll", this.onScrollAway, true);
      }, 0);
    } else {
      this.menuPos.set(null);
      document.removeEventListener("mousedown", this.onAway);
      document.removeEventListener("scroll", this.onScrollAway, true);
    }
  }

  /** Compute the fixed-position coordinates for the More dropdown
   *  based on the More button's current bbox. Opens downward by
   *  default; flips upward when the menu would extend past the
   *  viewport bottom. The menu width assumption (~190px) is intentional
   *  — matches min-w-[170px] + a bit of padding. */
  private placeMenu(): void {
    const el = this.menuRef?.nativeElement;
    if (!el) return;
    const buttonRect = el.getBoundingClientRect();
    // Anchor both axes to the More button's bbox. We tried using the
    // row's bbox for vertical so the menu would open below the full
    // message — that broke for long messages (the row.bottom is far
    // past the visible click, so the menu drifted way down). The
    // toolbar now uses `bottom-full` (no transform), so the button's
    // rect is at its true visible position just above the bubble's
    // top, which is exactly where the user clicked — so opening the
    // menu just below the button lands it near the start of the
    // message, regardless of the message's overall height.
    const menuW = 200;
    const menuH = 280; // conservative estimate covering all items
    const margin = 4;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    // Flip upward only if there's no room below the button but
    // there IS room above it — otherwise default to opening
    // downward from the button (the user's click point).
    const openUp = buttonRect.bottom + menuH + margin > vh && buttonRect.top - menuH - margin > 0;
    const top = openUp ? buttonRect.top - menuH - margin : buttonRect.bottom + margin;
    // Right-align for "me" bubbles (button sits on the right of the
    // toolbar), left-align for others. Clamped to the viewport so the
    // menu never disappears off-screen on narrow windows. Horizontal
    // anchor uses the More button's rect so the menu sits below it.
    if (this.isMe) {
      const right = Math.max(8, vw - buttonRect.right);
      this.menuPos.set({ top, left: 0, right, openUp });
    } else {
      const left = Math.min(buttonRect.left, vw - menuW - 8);
      this.menuPos.set({ top, left: Math.max(8, left), openUp });
    }
  }

  private onAway = (ev: MouseEvent) => {
    // The menu's `*ngIf` div is a DOM child of `<div #menuRef>` even
    // though it's `position: fixed`. Ignore mousedowns whose target
    // is inside the wrapper (the More button OR any menu item) so
    // the click-vs-mousedown race doesn't close the menu before the
    // item's click handler fires.
    const target = ev.target as Node | null;
    const wrapper = this.menuRef?.nativeElement;
    if (wrapper && target && wrapper.contains(target)) return;
    this.showMenu.set(false);
    this.pickerFor.set(false);
    this.menuPos.set(null);
    document.removeEventListener("mousedown", this.onAway);
    document.removeEventListener("scroll", this.onScrollAway, true);
  };

  private onScrollAway = (_ev: Event) => {
    this.showMenu.set(false);
    this.menuPos.set(null);
    document.removeEventListener("mousedown", this.onAway);
    document.removeEventListener("scroll", this.onScrollAway, true);
  };

  onReact(e: { msgId: string; emoji: string }): void {
    // Live mode: round-trips through chat-service so other channel members
    // see the reaction via FCM. Optimistically updates local reactions
    // map inside toggleReactionLive — UI reflects the change immediately.
    if (this.state.live()) {
      void this.state.toggleReactionLive(e.msgId, e.emoji);
    } else {
      this.state.toggleReaction(e.msgId, e.emoji);
    }
    this.pickerFor.set(false);
    // Detach the outside-click listener too — togglePicker set it
    // up when opening, but selecting an emoji closes the picker via
    // a different path (this method), so we need to clean up here
    // to avoid a stale handler firing on the next click.
    document.removeEventListener("mousedown", this.onPickerAway);
  }

  onTogglePin(): void {
    // Capture the prior state BEFORE firing the toggle — `togglePinLive`
    // (and `togglePin`) flip `pinnedMsgs` synchronously, so reading
    // `this.isPinned` after the call would see the post-flip value
    // and render the inverted toast ("Unpinned" right after pinning).
    const wasPinned = this.isPinned;
    if (this.state.live()) {
      void this.state.togglePinLive(this.convId, this.msg.id);
    } else {
      this.state.togglePin(this.convId, this.msg.id);
    }
    this.toast.show(wasPinned ? "Unpinned" : "Pinned to board");
    this.showMenu.set(false);
  }

  onToggleSave(): void {
    // Same pattern as onTogglePin — capture the prior state so the
    // toast doesn't read the just-flipped value. Without this, saving
    // a message renders "Removed from saved" and vice versa.
    const wasSaved = this.isSaved;
    if (this.state.live()) {
      void this.state.toggleSaveLive(this.msg.id);
    } else {
      this.state.toggleSave(this.msg.id);
    }
    this.toast.show(wasSaved ? "Removed from saved" : "Saved");
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

  /** Pop the message into a fullscreen modal so the user can read
   *  long content without the bubble's max-width / scroll. */
  onExpandMessage(): void {
    // eslint-disable-next-line no-console
    console.debug("[expand] open", this.msg.id);
    this.state.openMessageFullscreen(this.msg);
    this.showMenu.set(false);
  }

  /** Open the Message Info side panel for this message. */
  onOpenInfo(): void {
    this.state.openMessageInfo(this.msg.id);
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
    // Live mode: PATCH /messages/:id and refresh the message map on
    // success. The local mock branch stays for the demo path.
    if (this.state.live()) {
      void this.state.editMessageLive(this.msg.id, this.convId, v);
    } else {
      this.state.editMessage(this.convId, this.msg.id, { text: v, html: undefined });
    }
    this.editing.set(false);
  }

  cancelEdit(): void {
    this.editing.set(false);
    this.editValue.set("");
  }

  onDelete(): void {
    // Live mode: DELETE /messages/:id (soft-delete on the backend), then
    // refresh the local map. The mock path stays for offline demos.
    if (this.state.live()) {
      void this.state.deleteMessageLive(this.msg.id, this.convId);
    } else {
      this.state.deleteMessage(this.convId, this.msg.id);
    }
    this.toast.show("Message deleted");
    this.showMenu.set(false);
  }

  /** Confirm-and-delete entry point from the bubble More menu. Opens
   *  the app's confirm modal (NOT window.confirm) — destructive style.
   *  Closes the menu immediately so it doesn't sit open under the
   *  modal backdrop. */
  onConfirmDelete(): void {
    this.showMenu.set(false);
    this.menuPos.set(null);
    void this.confirm.ask({
      title: "Delete message?",
      message: "This message will be removed for everyone in the channel. This can't be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      danger: true,
    }).then((ok) => {
      if (!ok) return;
      this.onDelete();
    });
  }

  onReply(): void {
    this.reply.emit({ msg: this.msg, sender: this.sender });
  }

  ngOnDestroy(): void {
    document.removeEventListener("mousedown", this.onAway);
    this.stopThinkingRotation();
  }

  /** Start cycling the spinner subtitle through the conv's
   *  thinking-words list. Idempotent — calling start while already
   *  rotating just leaves the existing timer in place. */
  startThinkingRotation(): void {
    if (this.thinkingTimer) return;
    this.thinkingIndex.set(0);
    this.thinkingTimer = setInterval(() => {
      this.thinkingIndex.update((i) => i + 1);
    }, 1600);
  }
  stopThinkingRotation(): void {
    if (this.thinkingTimer) {
      clearInterval(this.thinkingTimer);
      this.thinkingTimer = undefined;
    }
  }
}

// FALLBACK_THINKING_WORDS removed — the bubble now falls back to the
// CLI's port of _GENERIC_PHRASES / _INTENT_PHRASES via
// `guessIntentPhrases` so the rotation matches `cli.py`'s vibe.
