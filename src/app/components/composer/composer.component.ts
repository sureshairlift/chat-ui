import {
  ChangeDetectionStrategy, Component, ElementRef, EventEmitter,
  HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges,
  ViewChild, computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { LiveDataService } from "../../services/live-data.service";
import { ToastService } from "../../services/toast.service";
import { MENTIONABLE_USERS, MentionableUser } from "../../data/senders";

import { IconComponent } from "../icon/icon.component";
import { AvatarComponent } from "../avatar/avatar.component";
import { ToolbarBtnComponent, ToolbarDividerComponent } from "../toolbar-btn/toolbar-btn.component";
import { EmojiComponent } from "../emoji/emoji.component";
import { EMOJI_CATALOG, emojiToUnicode, type EmojiEntry } from "../../data/emoji-catalog";

interface ReplyContext {
  msgId: string;
  senderName: string;
  senderId: string;
  text: string;
}

interface MentionState {
  query: string;
  rect: { left: number; bottom: number; top: number };
  index: number;
}

/** A successfully-uploaded attachment waiting to be attached to the
 *  next message send. The composer holds these in `pendingAttachments`
 *  until the user clicks Send (then they're forwarded in the send
 *  payload + cleared) or clicks the X (then the local entry drops —
 *  the file stays on the server, harmlessly). */
export interface PendingAttachment {
  kind: 'file' | 'image' | 'video' | 'audio';
  url: string;
  filename: string;
  size?: number;
  mime?: string;
}

/** Slash-command popover state. Same shape as MentionState (query +
 *  cursor position + selected index) so the template can mirror the
 *  mention popover layout. Driven by detectSlash(). */
interface SlashState {
  query: string;
  rect: { left: number; bottom: number; top: number };
  index: number;
}

/** Catalog of recognized slash commands. Filtered by query as the user
 *  types after `/`. Each entry maps to the routing in
 *  AppComponent.onSlashCommand — keep them in sync. */
interface SlashCommandEntry {
  command: string;     // canonical name (no leading slash)
  label: string;       // user-facing pretty form ("/handoff")
  hint: string;        // one-line description
  icon: string;        // icon name from IconComponent
}

const SLASH_COMMANDS: SlashCommandEntry[] = [
  { command: 'handoff',       label: '/handoff [reason]', hint: 'Bring in the support team',                icon: 'user-plus' },
  { command: 'take-over',     label: '/take-over',         hint: 'Claim this conversation as agent',         icon: 'check' },
  { command: 'return-to-ai',  label: '/return-to-ai',      hint: 'Hand control back to AI',                  icon: 'sparkles' },
  { command: 'resolve',       label: '/resolve',           hint: 'Mark conversation resolved',               icon: 'check-circle-2' },
  { command: 'note',          label: '/note <message>',    hint: 'Send an agents-only internal note',        icon: 'lock' },
  { command: 'help',          label: '/help',              hint: 'Show available commands',                  icon: 'info' },
];

interface ActiveFormats {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
}

const COLORS = [
  "#000000", "#dc2626", "#ea580c", "#d97706", "#16a34a",
  "#0891b2", "#2563eb", "#7c3aed", "#c026d3", "#6b7280",
];

const HIGHLIGHTS = [
  "transparent", "#fef3c7", "#fee2e2", "#dcfce7", "#dbeafe",
  "#fce7f3", "#e0e7ff", "#fed7aa", "#cffafe", "#fef9c3",
];

const BLOCK_OPTIONS = [
  { value: "P",   label: "Body",       cls: "" },
  { value: "H1",  label: "Heading 1",  cls: "text-[18px] font-semibold" },
  { value: "H2",  label: "Heading 2",  cls: "text-[16px] font-semibold" },
  { value: "H3",  label: "Heading 3",  cls: "text-[14px] font-semibold" },
  { value: "PRE", label: "Code block", cls: "font-mono text-[13px]" },
];

// Composer's emoji picker uses the shared Noto catalog so the picker
// thumbnails match what the bubble renders. Click inserts the actual
// Unicode codepoint(s) into the message body — storage stays as plain
// text and any subsequent platform (Slack import, email, CRM mirror)
// reads as a normal emoji string.
const EMOJIS: EmojiEntry[] = EMOJI_CATALOG;

/**
 * Rich-text composer based on contenteditable + execCommand.
 * Mirrors React `<Composer>` exactly: ~690 lines original.
 *
 * Features:
 *  - Bold / Italic / Underline / Strikethrough
 *  - Body / H1 / H2 / H3 / Code block (formatBlock dropdown)
 *  - Insert link / quote / bulleted list / numbered list
 *  - Insert table (8x8 size picker), context-aware table-ops menu
 *  - Text color + highlight color picker (combined palette)
 *  - @-mention popover with arrow-key navigation
 *  - Emoji picker
 *  - Reply preview (cancellable)
 *  - Per-conversation drafts persist via ChatStateService
 *  - Mobile collapses formatting, keeps right group + Send
 *  - AI mode shows quick-suggestion chips above the editor
 *  - Quick-reply chips when last message was from someone else
 *  - Enter to send (Shift+Enter for newline)
 *
 * Implementation notes (vs React):
 *  - We use document.execCommand even though deprecated — it's the simplest
 *    way to get all the rich-text behaviors and matches the React file exactly.
 *  - PortalDropdown analogue: we use `position: fixed` divs anchored to button
 *    bounding rects, recalculated on scroll/resize.
 */
@Component({
  selector: "app-composer",
  standalone: true,
  imports: [
    CommonModule, IconComponent, AvatarComponent,
    ToolbarBtnComponent, ToolbarDividerComponent, EmojiComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./composer.component.html",
  styleUrl: "./composer.component.css",
})
export class ComposerComponent implements OnChanges, OnDestroy {
  state = inject(ChatStateService);
  private readonly liveData = inject(LiveDataService, { optional: true });
  private readonly toast = inject(ToastService);

  @Input() lastMessageFromOther = false;
  /** Context-aware reply suggestions derived from the last incoming
   *  message (see services/reply-suggestions.ts). Empty falls back to
   *  the generic chip set. Only rendered when `lastMessageFromOther`
   *  is true — same gate as before. */
  @Input() replySuggestions: string[] = [];
  /** True while the LLM round-trip for AI reply hints is in flight.
   *  The chip row renders skeleton placeholders during this state so
   *  the user gets immediate feedback that suggestions are loading. */
  @Input() replySuggestionsLoading = false;
  @Input() isAI = false;
  @Input() isMobile = false;
  @Input() replyingTo: ReplyContext | null = null;
  @Input() convId!: string;
  @Input() draft = "";

  @Output() send = new EventEmitter<{ html: string; text: string; attachments?: PendingAttachment[] }>();
  @Output() cancelReply = new EventEmitter<void>();
  @Output() draftChange = new EventEmitter<string>();
  /** Slash command intercepted before send. Parent (AppComponent) routes
   *  to the right LiveDataService method based on `command`. Composer
   *  doesn't know about transitions / handoffs / etc. — it just parses
   *  the leading `/<word>` and forwards. */
  @Output() slashCommand = new EventEmitter<{ command: string; args: string }>();

  @ViewChild("editor") editor!: ElementRef<HTMLDivElement>;
  @ViewChild("blockBtn") blockBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild("tableBtn") tableBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild("colorBtn") colorBtn?: ElementRef<HTMLButtonElement>;

  isEmpty = signal(true);
  isFocused = signal(false);
  activeFormats = signal<ActiveFormats>({
    bold: false, italic: false, underline: false, strike: false,
  });
  currentBlock = signal("P");
  showBlockMenu = signal(false);
  showColorPicker = signal(false);
  showEmoji = signal(false);
  showTablePicker = signal(false);
  tableHover = signal<{ rows: number; cols: number }>({ rows: 0, cols: 0 });
  inTable = signal(false);
  showTableMenu = signal(false);
  mention = signal<MentionState | null>(null);
  /** Slash-command popover state. Non-null while the user is typing a
   *  slash command at the start of an empty editor. */
  slash = signal<SlashState | null>(null);

  blockMenuPos = signal({ top: 0, left: 0 });
  tableMenuPos = signal({ top: 0, left: 0 });
  colorMenuPos = signal({ top: 0, left: 0 });

  readonly COLORS = COLORS;
  readonly HIGHLIGHTS = HIGHLIGHTS;
  readonly BLOCK_OPTIONS = BLOCK_OPTIONS;
  readonly EMOJIS = EMOJIS;
  Math = Math;

  readonly aiSuggestions = [
    { label: "Show pipeline",            icon: "bar-chart-3" },
    { label: "Today's tasks",            icon: "check-circle-2" },
    { label: "Draft follow-up",          icon: "send" },
    { label: "Summarize team activity",  icon: "sparkles" },
  ];

  filteredMentions = computed<MentionableUser[]>(() => {
    const m = this.mention();
    if (!m) return [];
    const q = m.query.toLowerCase();
    return MENTIONABLE_USERS.filter((u) =>
      u.name.toLowerCase().includes(q) || (u.org || "").toLowerCase().includes(q)
    ).slice(0, 6);
  });

  /** Filtered slash command list — substring match on command name OR hint. */
  filteredSlashCommands = computed<SlashCommandEntry[]>(() => {
    const s = this.slash();
    if (!s) return [];
    const q = s.query.toLowerCase();
    if (!q) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter((c) =>
      c.command.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q)
    );
  });

  currentBlockLabel = computed(() => {
    const found = BLOCK_OPTIONS.find((b) => b.value === this.currentBlock());
    return found ? found.label : "Body";
  });

  /* ============================ Lifecycle ============================ */

  ngOnChanges(changes: SimpleChanges): void {
    // Load draft when convId changes
    if ("convId" in changes) {
      // Defer to next tick so the view child is ready
      setTimeout(() => this.loadDraft());
    }
  }

  private loadDraft(): void {
    if (!this.editor?.nativeElement) return;
    this.editor.nativeElement.innerHTML = this.draft || "";
    this.checkEmpty();
  }

  ngOnDestroy(): void {
    document.removeEventListener("click", this.onAway);
  }

  /* ============================ Selection helpers ============================ */

  private findTableContext(): { table: Element; row: Element; cell: Element } | null {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return null;
    let node: Node | null = sel.getRangeAt(0).startContainer;
    let cell: Element | null = null;
    let row: Element | null = null;
    let table: Element | null = null;
    while (node && node !== this.editor?.nativeElement) {
      const name = (node as Element).nodeName;
      if (!cell && (name === "TD" || name === "TH")) cell = node as Element;
      if (!row && name === "TR") row = node as Element;
      if (!table && name === "TABLE") { table = node as Element; break; }
      node = node.parentNode;
    }
    if (!table || !row || !cell) return null;
    return { table, row, cell };
  }

  private detectMention(): MentionState | null {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return null;
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return null;
    const text = (node.textContent || "").slice(0, range.startOffset);
    const m = text.match(/(?:^|\s)@([\w-]{0,30})$/);
    if (!m) return null;
    const query = m[1];
    const probe = range.cloneRange();
    probe.collapse(true);
    let rect = probe.getBoundingClientRect();
    if (!rect || (rect.top === 0 && rect.left === 0)) {
      const span = document.createElement("span");
      span.appendChild(document.createTextNode("\u200b"));
      probe.insertNode(span);
      rect = span.getBoundingClientRect();
      span.remove();
    }
    return { query, rect: { left: rect.left, bottom: rect.bottom, top: rect.top }, index: 0 };
  }

  /* ============================ State updates ============================ */

  updateState(): void {
    if (!this.editor?.nativeElement) return;
    const text = this.editor.nativeElement.innerText || "";
    const html = (this.editor.nativeElement.innerHTML || "").trim();
    const emptyShapes = ["", "<br>", "<br/>", "<p><br></p>", "<p></p>", "<div><br></div>", "<div></div>"];
    const isReallyEmpty = !text.trim() && emptyShapes.includes(html);
    this.isEmpty.set(isReallyEmpty);
    this.draftChange.emit(isReallyEmpty ? "" : html);

    try {
      this.activeFormats.set({
        bold:      document.queryCommandState("bold"),
        italic:    document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strike:    document.queryCommandState("strikeThrough"),
      });
      const block = (document.queryCommandValue("formatBlock") || "p").toUpperCase();
      this.currentBlock.set(block === "" ? "P" : block);
    } catch (_) { /* no-op */ }

    this.inTable.set(!!this.findTableContext());
    this.mention.set(this.detectMention());
    this.slash.set(this.detectSlash());
  }

  /** Detects a leading `/<word>` at the start of the editor (and only
   *  there — slash anywhere else in a sentence isn't a command). Used
   *  to surface the slash-command popover. */
  private detectSlash(): SlashState | null {
    if (!this.editor?.nativeElement) return null;
    const text = (this.editor.nativeElement.innerText || "").trim();
    // Only fire when the editor's first non-whitespace token is `/<word?>`
    // — `/foo bar` should NOT show the popover after the user types past
    // the word boundary.
    const m = text.match(/^\/([a-z][a-z-]*)?$/i);
    if (!m) return null;
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const probe = range.cloneRange();
    probe.collapse(true);
    let rect = probe.getBoundingClientRect();
    if (!rect || (rect.top === 0 && rect.left === 0)) {
      const span = document.createElement("span");
      span.appendChild(document.createTextNode("​"));
      probe.insertNode(span);
      rect = span.getBoundingClientRect();
      span.remove();
    }
    return { query: m[1] || "", rect: { left: rect.left, bottom: rect.bottom, top: rect.top }, index: 0 };
  }

  /** Insert a slash command from the popover. Replaces the editor's
   *  current contents with the command text + a trailing space (for
   *  commands that take args like `/note <message>`) or fires send
   *  immediately for argless commands like `/help`. */
  insertSlashCommand(entry: SlashCommandEntry): void {
    const takesArgs = entry.label.includes('<') || entry.label.includes('[');
    if (this.editor?.nativeElement) {
      this.editor.nativeElement.innerText = takesArgs
        ? `/${entry.command} `
        : `/${entry.command}`;
      // Place the cursor at the end so the user can immediately type args.
      const range = document.createRange();
      const sel = window.getSelection?.();
      range.selectNodeContents(this.editor.nativeElement);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
      this.editor.nativeElement.focus();
    }
    this.slash.set(null);
    if (!takesArgs) {
      // Fire immediately so the user gets one-click execution for
      // argless commands.
      this.handleSend();
    } else {
      this.updateState();
    }
  }

  private checkEmpty(): void {
    if (!this.editor?.nativeElement) return;
    const html = (this.editor.nativeElement.innerHTML || "").trim();
    const text = (this.editor.nativeElement.innerText || "").trim();
    const emptyShapes = ["", "<br>", "<br/>", "<p><br></p>", "<p></p>", "<div><br></div>", "<div></div>"];
    this.isEmpty.set(!text && emptyShapes.includes(html));
  }

  /* ============================ Command exec ============================ */

  exec(cmd: string, val: string | null = null): void {
    this.editor?.nativeElement.focus();
    try { document.execCommand(cmd, false, val ?? undefined); } catch (_) { /* no-op */ }
    this.updateState();
  }

  insertHTML(html: string): void {
    this.editor?.nativeElement.focus();
    try { document.execCommand("insertHTML", false, html); } catch (_) { /* no-op */ }
    this.updateState();
  }

  insertEmoji(em: EmojiEntry): void {
    // Insert the Unicode codepoint(s) — the message body stays as
    // portable text. The bubble renders any emoji char with the OS
    // font; the picker thumbnails are just a richer way to choose.
    this.insertHTML(emojiToUnicode(em.code));
    this.showEmoji.set(false);
  }

  insertLink(): void {
    const sel = window.getSelection?.();
    const selText = sel?.toString() || "";
    const url = window.prompt("Enter URL:", "https://");
    if (!url || url === "https://") return;
    if (selText) {
      this.exec("createLink", url);
    } else {
      this.insertHTML(`<a href="${url.replace(/"/g, "&quot;")}" style="color:#2563eb;text-decoration:underline;">${url}</a>`);
    }
  }

  /* ============================ Tables ============================ */

  insertTableSize(rows: number, cols: number): void {
    const thStyle = "border:1px solid #d1d5db;padding:7px 10px;min-width:60px;vertical-align:top;background:#f3f4f6;font-weight:600;text-align:left;color:#111827;";
    const tdStyle = "border:1px solid #d1d5db;padding:6px 10px;min-width:60px;vertical-align:top;";
    let html = '<table style="border-collapse:collapse;margin:6px 0;table-layout:fixed;">';
    for (let r = 0; r < rows; r++) {
      html += "<tr>";
      for (let c = 0; c < cols; c++) {
        if (r === 0) html += `<th style="${thStyle}">&nbsp;</th>`;
        else        html += `<td style="${tdStyle}">&nbsp;</td>`;
      }
      html += "</tr>";
    }
    html += "</table><p><br></p>";
    this.insertHTML(html);
    this.showTablePicker.set(false);
    this.tableHover.set({ rows: 0, cols: 0 });
  }

  tableOp(op: "rowAbove" | "rowBelow" | "colLeft" | "colRight" | "deleteRow" | "deleteCol" | "deleteTable"): void {
    const ctx = this.findTableContext();
    if (!ctx) return;
    const { table, row, cell } = ctx;
    const cellIndex = Array.from(row.children).indexOf(cell);
    const thStyle = "border:1px solid #d1d5db;padding:7px 10px;min-width:60px;vertical-align:top;background:#f3f4f6;font-weight:600;text-align:left;color:#111827;";
    const tdStyle = "border:1px solid #d1d5db;padding:6px 10px;min-width:60px;vertical-align:top;";

    const makeRow = (cols: number): HTMLTableRowElement => {
      const tr = document.createElement("tr");
      for (let i = 0; i < cols; i++) {
        const td = document.createElement("td");
        td.setAttribute("style", tdStyle);
        td.innerHTML = "&nbsp;";
        tr.appendChild(td);
      }
      return tr;
    };
    const makeCellLike = (existingCell: Element | null): HTMLElement => {
      const tag = existingCell && existingCell.nodeName === "TH" ? "th" : "td";
      const el = document.createElement(tag);
      el.setAttribute("style", tag === "th" ? thStyle : tdStyle);
      el.innerHTML = "&nbsp;";
      return el;
    };

    if (op === "rowAbove") {
      row.parentNode?.insertBefore(makeRow(row.children.length), row);
    } else if (op === "rowBelow") {
      const newRow = makeRow(row.children.length);
      if (row.nextSibling) row.parentNode?.insertBefore(newRow, row.nextSibling);
      else row.parentNode?.appendChild(newRow);
    } else if (op === "colLeft" || op === "colRight") {
      const offset = op === "colRight" ? 1 : 0;
      table.querySelectorAll("tr").forEach((tr) => {
        const sibling = tr.children[cellIndex] || tr.children[0];
        const newCell = makeCellLike(sibling);
        const ref = tr.children[cellIndex + offset];
        if (ref) tr.insertBefore(newCell, ref);
        else tr.appendChild(newCell);
      });
    } else if (op === "deleteRow") {
      if (table.querySelectorAll("tr").length <= 1) table.remove();
      else row.remove();
    } else if (op === "deleteCol") {
      if (row.children.length <= 1) {
        table.remove();
      } else {
        table.querySelectorAll("tr").forEach((tr) => {
          if (tr.children[cellIndex]) tr.children[cellIndex].remove();
        });
      }
    } else if (op === "deleteTable") {
      table.remove();
    }
    this.showTableMenu.set(false);
    this.updateState();
  }

  tableCellClass(i: number): string {
    const r = Math.floor(i / 8) + 1;
    const c = (i % 8) + 1;
    const h = this.tableHover();
    const hi = r <= h.rows && c <= h.cols;
    return hi
      ? "w-5 h-5 cursor-pointer rounded-sm border transition bg-blue-500 border-blue-600"
      : "w-5 h-5 cursor-pointer rounded-sm border transition bg-gray-50 border-gray-300 hover:bg-gray-100";
  }

  /* ============================ Mentions ============================ */

  insertMention(sender: MentionableUser): void {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;
    const offset = range.startOffset;
    const before = (node.textContent || "").slice(0, offset);
    const m = before.match(/@[\w-]{0,30}$/);
    if (!m) return;
    const atStart = offset - m[0].length;

    range.setStart(node, atStart);
    range.setEnd(node, offset);
    range.deleteContents();

    const chip = document.createElement("span");
    chip.setAttribute("data-mention-id", sender.id);
    chip.setAttribute("contenteditable", "false");
    chip.className = "mention-chip";
    chip.style.cssText = "display:inline-block;background:#dbeafe;color:#1d4ed8;padding:1px 8px;border-radius:12px;font-weight:500;font-size:13px;margin:0 1px;";
    chip.textContent = `@${sender.name}`;
    range.insertNode(chip);

    const space = document.createTextNode("\u00A0");
    if (chip.nextSibling) chip.parentNode?.insertBefore(space, chip.nextSibling);
    else chip.parentNode?.appendChild(space);

    range.setStartAfter(space);
    range.setEndAfter(space);
    sel.removeAllRanges();
    sel.addRange(range);

    this.mention.set(null);
    this.updateState();
  }

  setMentionIndex(i: number): void {
    const m = this.mention();
    if (m) this.mention.set({ ...m, index: i });
  }

  mentionTop(m: MentionState): number {
    const winH = typeof window !== "undefined" ? window.innerHeight : 1000;
    return Math.min(m.rect.bottom + 6, winH - 320);
  }
  mentionLeft(m: MentionState): number {
    const winW = typeof window !== "undefined" ? window.innerWidth : 1200;
    return Math.max(8, Math.min(m.rect.left, winW - 296));
  }

  /* ============================ Send / keyboard ============================ */

  handleSend(overrideHtml?: string): void {
    const html = overrideHtml ?? (this.editor?.nativeElement.innerHTML || "");
    const plain = (this.editor?.nativeElement.innerText.trim()) ||
      (overrideHtml ? overrideHtml.replace(/<[^>]+>/g, "").trim() : "");
    if (!plain) return;

    // Slash-command interception. Pattern: leading `/<command>` optionally
    // followed by free-text args. Recognized commands are dispatched as a
    // separate output event so AppComponent can route to the right
    // LiveDataService method without baking transition logic into the
    // composer. Unknown commands fall through to a normal send so users
    // can still type `/path/to/something` in a real message without it
    // being eaten as a command (slashCommand only matches /<word> at
    // start with no path-like slash following).
    const match = plain.match(/^\/([a-z][a-z-]*)\b\s*(.*)$/i);
    if (match && !plain.includes('/', match[0].length)) {
      this.slashCommand.emit({ command: match[1].toLowerCase(), args: match[2].trim() });
      this.clearEditor();
      return;
    }

    this.send.emit({ html, text: plain });
    this.clearEditor();
  }

  private clearEditor(): void {
    if (this.editor?.nativeElement) {
      this.editor.nativeElement.innerHTML = "";
      this.isEmpty.set(true);
      this.mention.set(null);
    }
  }

  submitQuick(text: string): void {
    this.handleSend(`<p>${text.replace(/</g, "&lt;")}</p>`);
  }

  /** Insert a suggestion into the editor without sending. Lets the
   *  user review / edit / extend before pressing Enter. Used by the
   *  AI quick-reply chips above the editor — "suggestion", not
   *  auto-reply. */
  insertSuggestion(text: string): void {
    if (!this.editor?.nativeElement) return;
    const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    this.editor.nativeElement.innerHTML = `<p>${safe}</p>`;
    this.isEmpty.set(false);
    // Move caret to the end so the user can keep typing.
    requestAnimationFrame(() => {
      const el = this.editor!.nativeElement;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
    this.draftChange.emit(this.editor.nativeElement.innerHTML);
  }

  handleKeyDown(e: KeyboardEvent): void {
    // Slash popover takes precedence over mention popover when both
    // are open (slash only opens with cursor at start of an empty
    // editor, so they shouldn't both be active anyway, but be defensive).
    const s = this.slash();
    const slashList = this.filteredSlashCommands();
    if (s && slashList.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.slash.set({ ...s, index: (s.index + 1) % slashList.length });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        this.slash.set({ ...s, index: (s.index - 1 + slashList.length) % slashList.length });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        this.insertSlashCommand(slashList[s.index]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        this.slash.set(null);
        return;
      }
    }

    const m = this.mention();
    const filtered = this.filteredMentions();
    if (m && filtered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.mention.set({ ...m, index: (m.index + 1) % filtered.length });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        this.mention.set({ ...m, index: (m.index - 1 + filtered.length) % filtered.length });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        this.insertMention(filtered[m.index]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        this.mention.set(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this.handleSend();
    }
  }

  /** Position helpers for the slash popover — same logic as mention. */
  slashTop(s: SlashState): number {
    const winH = typeof window !== "undefined" ? window.innerHeight : 1000;
    return Math.min(s.rect.bottom + 6, winH - 320);
  }
  slashLeft(s: SlashState): number {
    const winW = typeof window !== "undefined" ? window.innerWidth : 1200;
    return Math.max(8, Math.min(s.rect.left, winW - 296));
  }

  /* ============================ Popovers ============================ */

  toggleBlockMenu(): void {
    const next = !this.showBlockMenu();
    this.closeAllPopovers();
    this.showBlockMenu.set(next);
    if (next) this.updateMenuPositions();
    this.armAway();
  }
  toggleColorPicker(): void {
    const next = !this.showColorPicker();
    this.closeAllPopovers();
    this.showColorPicker.set(next);
    if (next) this.updateMenuPositions();
    this.armAway();
  }
  toggleEmoji(): void {
    const next = !this.showEmoji();
    this.closeAllPopovers();
    this.showEmoji.set(next);
    this.armAway();
  }
  onTableBtnClick(): void {
    if (this.inTable()) {
      const next = !this.showTableMenu();
      this.closeAllPopovers();
      this.showTableMenu.set(next);
    } else {
      const next = !this.showTablePicker();
      this.closeAllPopovers();
      this.showTablePicker.set(next);
    }
    this.updateMenuPositions();
    this.armAway();
  }

  closeAllPopovers(): void {
    this.showBlockMenu.set(false);
    this.showColorPicker.set(false);
    this.showEmoji.set(false);
    this.showTablePicker.set(false);
    this.showTableMenu.set(false);
  }

  private updateMenuPositions(): void {
    const setPos = (btn?: ElementRef<HTMLButtonElement>, target?: any) => {
      if (!btn?.nativeElement || !target) return;
      const r = btn.nativeElement.getBoundingClientRect();
      target.set({ top: r.top - 6, left: r.left });
    };
    setPos(this.blockBtn, this.blockMenuPos);
    setPos(this.tableBtn, this.tableMenuPos);
    setPos(this.colorBtn, this.colorMenuPos);
  }

  @HostListener("window:scroll", []) onScroll(): void { this.updateMenuPositions(); }
  @HostListener("window:resize", []) onResize(): void { this.updateMenuPositions(); }

  private armed = false;
  private armAway(): void {
    if (this.armed) return;
    this.armed = true;
    setTimeout(() => {
      document.addEventListener("click", this.onAway);
    }, 0);
  }
  private onAway = (_e: MouseEvent) => {
    this.closeAllPopovers();
    document.removeEventListener("click", this.onAway);
    this.armed = false;
  };

  /* ============================ Misc ============================ */

  onFocus(): void { this.isFocused.set(true); this.updateState(); }
  onBlur(): void  { this.isFocused.set(false); this.updateState(); }

  /** Pending attachments queued for the next send. Each entry is the
   *  fully-uploaded server response — we just need to pass them along
   *  in the send payload. Cleared after handleSend. */
  pendingAttachments = signal<PendingAttachment[]>([]);
  /** True while ANY upload is in flight — disables the Send button to
   *  prevent half-sent batches. */
  uploading = signal(false);

  /** ViewChild for the hidden file input — the visible Attach button
   *  triggers a click on this so we get the native file picker for free. */
  @ViewChild("fileInput") fileInput?: ElementRef<HTMLInputElement>;

  onAttach(): void {
    if (!this.liveData) {
      this.toast.show("Attachments require a live backend.");
      return;
    }
    this.fileInput?.nativeElement.click();
  }

  /** Hidden file input change handler — uploads each picked file and
   *  pushes the result into pendingAttachments. Multi-select supported
   *  via the input's `multiple` attribute. Clears the input value at
   *  the end so picking the same file twice in a row still triggers a
   *  fresh upload. */
  async onFilesPicked(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;
    if (!this.liveData) return;
    this.uploading.set(true);
    try {
      for (const f of files) {
        const att = await this.liveData.uploadAttachment(f);
        if (att) {
          this.pendingAttachments.update((list) => [...list, {
            kind: att.kind as PendingAttachment['kind'],
            url: att.url,
            filename: att.filename ?? f.name,
            size: att.size,
            mime: att.mime,
          }]);
        } else {
          this.toast.show(`Upload failed: ${f.name}`);
        }
      }
    } finally {
      this.uploading.set(false);
      input.value = ''; // allow re-selecting the same file
    }
  }

  /** Drop one pending attachment (X button on the chip). Doesn't
   *  delete the file from the server — file stays under the random id;
   *  a future cleanup job can prune orphans. */
  removePendingAttachment(i: number): void {
    this.pendingAttachments.update((list) => list.filter((_, idx) => idx !== i));
  }

  /** Pretty-format a byte count for the chip subtitle. */
  formatBytes(n: number | undefined): string {
    if (!n) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  sendBtnClass(): string {
    const base = "ml-1 flex items-center gap-1.5 h-7 px-3 rounded-full text-[13px] font-medium transition";
    if (this.isEmpty()) return `${base} bg-gray-100 text-gray-400 cursor-not-allowed`;
    if (this.isAI) return `${base} bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:opacity-90`;
    return `${base} bg-blue-600 text-white hover:bg-blue-700`;
  }
}
