import {
  ChangeDetectionStrategy, Component, ElementRef, EventEmitter,
  HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges,
  ViewChild, computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { MENTIONABLE_USERS, MentionableUser } from "../../data/senders";

import { IconComponent } from "../icon/icon.component";
import { AvatarComponent } from "../avatar/avatar.component";
import { ToolbarBtnComponent, ToolbarDividerComponent } from "../toolbar-btn/toolbar-btn.component";

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

const EMOJIS = [
  "😀","😄","😁","😆","😅","🤣","😂","🙂","😉","😍","🥰","😘","😎","🤔","😐","😴",
  "🤩","🥳","😢","😭","😤","😡","🙏","👍","👎","👏","🙌","💪","🎉","✨","💯","🔥",
  "❤️","💔","✅","⭐","🚀","💡","📌","🎯","☕","🍕","🍔","🎂",
];

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
    ToolbarBtnComponent, ToolbarDividerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="px-4 py-3 border-t border-gray-100 bg-white">

      <!-- AI quick-suggestions -->
      <div *ngIf="isAI"
           class="flex items-center gap-2 mb-2 px-1 overflow-x-auto no-scrollbar">
        <button *ngFor="let s of aiSuggestions"
                (click)="submitQuick(s.label)"
                class="text-[12px] text-purple-700 border border-purple-200 bg-gradient-to-r from-blue-50 to-purple-50 hover:from-blue-100 hover:to-purple-100 transition rounded-full px-3 py-1 flex items-center gap-1.5 shrink-0">
          <app-icon [name]="s.icon" [size]="12"></app-icon>
          {{ s.label }}
        </button>
      </div>

      <!-- Quick reply chips -->
      <div *ngIf="!isAI && lastMessageFromOther"
           class="flex items-center gap-2 mb-2 px-1">
        <button *ngFor="let q of ['Thank you!', 'Are you available?', 'Sent']"
                (click)="submitQuick(q)"
                class="text-[13px] text-blue-700 border border-gray-200 hover:bg-blue-50 hover:border-blue-300 transition rounded-full px-3.5 py-1">
          {{ q }}
        </button>
      </div>

      <!-- Main editor frame -->
      <div class="rounded-2xl border border-gray-200 bg-white shadow-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition relative">

        <!-- Reply preview -->
        <div *ngIf="replyingTo"
             class="flex items-start gap-2 px-3 pt-2.5 pb-2 border-b border-gray-100 bg-blue-50/40 rounded-t-2xl">
          <div class="w-0.5 self-stretch bg-blue-500 rounded-full shrink-0 mt-0.5"></div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1 text-[11px] font-medium text-blue-700">
              <app-icon name="quote" [size]="10"></app-icon>
              <span>Replying to {{ replyingTo.senderName }}</span>
            </div>
            <div class="text-[12px] text-gray-600 line-clamp-2 mt-0.5 break-words">
              {{ replyingTo.text }}
            </div>
          </div>
          <button (click)="cancelReply.emit()"
                  class="p-0.5 rounded hover:bg-gray-200 text-gray-500 shrink-0"
                  title="Cancel reply">
            <app-icon name="x" [size]="14"></app-icon>
          </button>
        </div>

        <!-- Editable area -->
        <div class="relative px-4 pt-3 pb-1">
          <div
            #editor
            contenteditable="true"
            (input)="updateState()"
            (keydown)="handleKeyDown($event)"
            (mouseup)="updateState()"
            (keyup)="updateState()"
            (focus)="onFocus()"
            (blur)="onBlur()"
            class="composer-editor min-h-[40px] max-h-[200px] overflow-y-auto outline-none text-[14px] text-gray-900 leading-relaxed"
            style="word-break: break-word;"
          ></div>
          <div *ngIf="isEmpty() && !isFocused()"
               class="absolute top-3 left-4 text-[14px] text-gray-400 pointer-events-none select-none">
            Type a message...&nbsp;
            <span class="text-[12px] text-gray-300">— try &#64; to mention</span>
          </div>
        </div>

        <!-- Toolbar -->
        <div class="flex items-end justify-between gap-2 px-2 py-1.5 border-t border-gray-100">
          <!-- LEFT GROUP — formatting (hidden on mobile) -->
          <div *ngIf="!isMobile"
               class="flex items-center gap-0.5 min-w-0 overflow-x-auto no-scrollbar">
            <app-toolbar-btn [active]="activeFormats().bold" title="Bold (Ctrl+B)" (clicked)="exec('bold')">
              <app-icon name="bold" [size]="14"></app-icon>
            </app-toolbar-btn>
            <app-toolbar-btn [active]="activeFormats().italic" title="Italic (Ctrl+I)" (clicked)="exec('italic')">
              <app-icon name="italic" [size]="14"></app-icon>
            </app-toolbar-btn>
            <app-toolbar-btn [active]="activeFormats().underline" title="Underline (Ctrl+U)" (clicked)="exec('underline')">
              <app-icon name="underline" [size]="14"></app-icon>
            </app-toolbar-btn>
            <app-toolbar-btn [active]="activeFormats().strike" title="Strikethrough" (clicked)="exec('strikeThrough')">
              <app-icon name="strikethrough" [size]="14"></app-icon>
            </app-toolbar-btn>
            <app-toolbar-divider></app-toolbar-divider>

            <!-- Block dropdown trigger -->
            <div class="relative" (click)="$event.stopPropagation()">
              <button
                #blockBtn
                type="button"
                (mousedown)="$event.preventDefault()"
                (click)="toggleBlockMenu()"
                class="h-7 px-2 rounded flex items-center gap-1 text-[13px] text-gray-700 hover:bg-gray-100"
              >
                {{ currentBlockLabel() }}
                <app-icon name="chevron-down" [size]="12"></app-icon>
              </button>
            </div>

            <app-toolbar-btn title="Insert link" (clicked)="insertLink()">
              <app-icon name="link-2" [size]="14"></app-icon>
            </app-toolbar-btn>
            <app-toolbar-divider></app-toolbar-divider>

            <app-toolbar-btn title="Quote" (clicked)="exec('formatBlock', 'BLOCKQUOTE')">
              <app-icon name="quote" [size]="14"></app-icon>
            </app-toolbar-btn>
            <app-toolbar-btn title="Bulleted list" (clicked)="exec('insertUnorderedList')">
              <app-icon name="list" [size]="14"></app-icon>
            </app-toolbar-btn>
            <app-toolbar-btn title="Numbered list" (clicked)="exec('insertOrderedList')">
              <app-icon name="list-ordered" [size]="14"></app-icon>
            </app-toolbar-btn>
            <app-toolbar-divider></app-toolbar-divider>

            <!-- Table button -->
            <div class="relative" (click)="$event.stopPropagation()">
              <button
                #tableBtn
                type="button"
                (mousedown)="$event.preventDefault()"
                (click)="onTableBtnClick()"
                [class]="'h-7 px-1.5 rounded flex items-center gap-0.5 ' +
                  (inTable() ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100')"
                [title]="inTable() ? 'Table options' : 'Insert table'"
              >
                <app-icon name="table" [size]="14"></app-icon>
                <app-icon name="chevron-down" [size]="11"></app-icon>
              </button>
            </div>

            <!-- Color picker -->
            <div class="relative" (click)="$event.stopPropagation()">
              <button
                #colorBtn
                type="button"
                (mousedown)="$event.preventDefault()"
                (click)="toggleColorPicker()"
                class="h-7 px-1.5 rounded flex items-center gap-0.5 text-gray-700 hover:bg-gray-100"
                title="Text & highlight color"
              >
                <app-icon name="palette" [size]="14"></app-icon>
                <app-icon name="chevron-down" [size]="11"></app-icon>
              </button>
            </div>
          </div>

          <!-- RIGHT GROUP — actions (always visible) -->
          <div class="flex items-center gap-0.5 shrink-0">
            <app-toolbar-btn title="Mention someone (@)" (clicked)="insertHTML('@')">
              <app-icon name="at-sign" [size]="14"></app-icon>
            </app-toolbar-btn>
            <app-toolbar-btn title="Attach file" (clicked)="onAttach()">
              <app-icon name="paperclip" [size]="14"></app-icon>
            </app-toolbar-btn>

            <div class="relative" (click)="$event.stopPropagation()">
              <app-toolbar-btn title="Emoji" (clicked)="toggleEmoji()">
                <app-icon name="smile" [size]="14"></app-icon>
              </app-toolbar-btn>
              <div *ngIf="showEmoji()"
                   class="absolute bottom-9 right-0 z-30 bg-white rounded-lg shadow-lg ring-1 ring-gray-200 p-2 grid grid-cols-8 gap-1 w-64">
                <button *ngFor="let em of EMOJIS"
                        (mousedown)="$event.preventDefault()"
                        (click)="insertEmoji(em)"
                        class="text-[18px] hover:bg-gray-100 rounded p-0.5">
                  {{ em }}
                </button>
              </div>
            </div>

            <button
              type="button"
              (mousedown)="$event.preventDefault()"
              (click)="handleSend()"
              [disabled]="isEmpty()"
              [class]="sendBtnClass()"
              title="Send (Enter)"
            >
              Send
              <app-icon name="send" [size]="13"></app-icon>
            </button>
          </div>
        </div>

        <!-- Mention autocomplete -->
        <div *ngIf="mention() as m"
             [class.hidden]="filteredMentions().length === 0"
             (mousedown)="$event.preventDefault()"
             class="fixed z-50 bg-white rounded-lg shadow-xl ring-1 ring-gray-200 py-1 w-72 max-h-72 overflow-y-auto scrollable"
             [style.top.px]="mentionTop(m)"
             [style.left.px]="mentionLeft(m)">
          <div class="px-3 py-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center justify-between">
            <span>People</span>
            <span class="text-gray-400 normal-case font-normal text-[10px]">↑↓ Enter</span>
          </div>
          <button
            *ngFor="let u of filteredMentions(); let i = index"
            (mousedown)="$event.preventDefault()"
            (click)="insertMention(u)"
            (mouseenter)="setMentionIndex(i)"
            [class]="'w-full flex items-center gap-2 px-3 py-1.5 text-left ' +
              (m.index === i ? 'bg-blue-50' : 'hover:bg-gray-50')"
          >
            <app-avatar [user]="u" [size]="26"></app-avatar>
            <div class="flex-1 min-w-0">
              <div class="text-[13px] font-medium text-gray-900 truncate">{{ u.name }}</div>
              <div *ngIf="u.org" class="text-[11px] text-gray-500 truncate">{{ u.org }}</div>
            </div>
            <span *ngIf="m.index === i" class="text-[10px] text-blue-600 font-medium">↵</span>
          </button>
        </div>
      </div>

      <!-- Portal dropdowns (rendered as fixed-position elements at document level) -->

      <!-- Block menu -->
      <div *ngIf="showBlockMenu()"
           [style.top.px]="blockMenuPos().top"
           [style.left.px]="blockMenuPos().left"
           style="position: fixed; transform: translateY(-100%); z-index: 100;"
           (click)="$event.stopPropagation()"
           (mousedown)="$event.stopPropagation()">
        <div class="w-40 bg-white rounded-lg shadow-lg ring-1 ring-gray-200 py-1">
          <button *ngFor="let opt of BLOCK_OPTIONS"
                  (mousedown)="$event.preventDefault()"
                  (click)="exec('formatBlock', opt.value); showBlockMenu.set(false)"
                  [class]="'w-full text-left px-3 py-1.5 text-[13px] hover:bg-gray-50 ' + opt.cls + ' ' +
                    (currentBlock() === opt.value ? 'bg-blue-50 text-blue-700' : 'text-gray-700')">
            {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- Table size picker -->
      <div *ngIf="showTablePicker() && !inTable()"
           [style.top.px]="tableMenuPos().top"
           [style.left.px]="tableMenuPos().left"
           style="position: fixed; transform: translateY(-100%); z-index: 100;"
           (click)="$event.stopPropagation()"
           (mousedown)="$event.stopPropagation()">
        <div class="bg-white rounded-lg shadow-lg ring-1 ring-gray-200 p-3">
          <div class="grid grid-cols-8 gap-1"
               style="width: 192px;"
               (mouseleave)="tableHover.set({ rows: 0, cols: 0 })">
            <div *ngFor="let _ of [].constructor(64); let i = index"
                 (mouseenter)="tableHover.set({ rows: Math.floor(i / 8) + 1, cols: (i % 8) + 1 })"
                 (mousedown)="$event.preventDefault()"
                 (click)="insertTableSize(Math.floor(i / 8) + 1, (i % 8) + 1)"
                 [class]="tableCellClass(i)"></div>
          </div>
          <div class="text-center text-[11px] text-gray-600 mt-2">
            {{ tableHover().rows > 0 ? tableHover().rows + ' × ' + tableHover().cols : 'Hover to pick size' }}
          </div>
        </div>
      </div>

      <!-- Table ops menu -->
      <div *ngIf="showTableMenu() && inTable()"
           [style.top.px]="tableMenuPos().top"
           [style.left.px]="tableMenuPos().left"
           style="position: fixed; transform: translateY(-100%); z-index: 100;"
           (click)="$event.stopPropagation()"
           (mousedown)="$event.stopPropagation()">
        <div class="bg-white rounded-lg shadow-lg ring-1 ring-gray-200 py-1 w-52 text-[13px]">
          <button (mousedown)="$event.preventDefault()" (click)="tableOp('rowAbove')"
                  class="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center gap-2">
            <app-icon name="plus" [size]="13"></app-icon> Insert row above
          </button>
          <button (mousedown)="$event.preventDefault()" (click)="tableOp('rowBelow')"
                  class="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center gap-2">
            <app-icon name="plus" [size]="13"></app-icon> Insert row below
          </button>
          <button (mousedown)="$event.preventDefault()" (click)="tableOp('colLeft')"
                  class="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center gap-2">
            <app-icon name="plus" [size]="13"></app-icon> Insert column left
          </button>
          <button (mousedown)="$event.preventDefault()" (click)="tableOp('colRight')"
                  class="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center gap-2">
            <app-icon name="plus" [size]="13"></app-icon> Insert column right
          </button>
          <div class="h-px bg-gray-100 my-1"></div>
          <button (mousedown)="$event.preventDefault()" (click)="tableOp('deleteRow')"
                  class="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-red-600 flex items-center gap-2">
            <app-icon name="trash-2" [size]="13"></app-icon> Delete row
          </button>
          <button (mousedown)="$event.preventDefault()" (click)="tableOp('deleteCol')"
                  class="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-red-600 flex items-center gap-2">
            <app-icon name="trash-2" [size]="13"></app-icon> Delete column
          </button>
          <button (mousedown)="$event.preventDefault()" (click)="tableOp('deleteTable')"
                  class="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-red-600 flex items-center gap-2">
            <app-icon name="trash-2" [size]="13"></app-icon> Delete table
          </button>
        </div>
      </div>

      <!-- Color picker -->
      <div *ngIf="showColorPicker()"
           [style.top.px]="colorMenuPos().top"
           [style.left.px]="colorMenuPos().left"
           style="position: fixed; transform: translateY(-100%); z-index: 100;"
           (click)="$event.stopPropagation()"
           (mousedown)="$event.stopPropagation()">
        <div class="bg-white rounded-lg shadow-lg ring-1 ring-gray-200 p-3" style="width: 192px;">
          <div class="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <app-icon name="palette" [size]="10"></app-icon> Text color
          </div>
          <div class="grid grid-cols-5 gap-1.5 mb-3">
            <button *ngFor="let c of COLORS"
                    (mousedown)="$event.preventDefault()"
                    (click)="exec('foreColor', c); showColorPicker.set(false)"
                    [style.backgroundColor]="c"
                    [title]="c"
                    class="w-6 h-6 rounded-full border border-gray-200 hover:scale-110 hover:ring-2 hover:ring-gray-200 transition">
            </button>
          </div>
          <div class="h-px bg-gray-100 my-2"></div>
          <div class="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <app-icon name="highlighter" [size]="10"></app-icon> Highlight
          </div>
          <div class="grid grid-cols-5 gap-1.5">
            <button *ngFor="let c of HIGHLIGHTS"
                    (mousedown)="$event.preventDefault()"
                    (click)="exec('hiliteColor', c === 'transparent' ? 'inherit' : c); showColorPicker.set(false)"
                    [style.backgroundColor]="c === 'transparent' ? 'white' : c"
                    [title]="c === 'transparent' ? 'Remove highlight' : c"
                    class="w-6 h-6 rounded-full border border-gray-200 hover:scale-110 hover:ring-2 hover:ring-gray-200 transition flex items-center justify-center">
              <app-icon *ngIf="c === 'transparent'" name="x" [size]="10" class="text-gray-400"></app-icon>
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ComposerComponent implements OnChanges, OnDestroy {
  state = inject(ChatStateService);

  @Input() lastMessageFromOther = false;
  @Input() isAI = false;
  @Input() isMobile = false;
  @Input() replyingTo: ReplyContext | null = null;
  @Input() convId!: string;
  @Input() draft = "";

  @Output() send = new EventEmitter<{ html: string; text: string }>();
  @Output() cancelReply = new EventEmitter<void>();
  @Output() draftChange = new EventEmitter<string>();

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

  insertEmoji(em: string): void {
    this.insertHTML(em);
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
    this.send.emit({ html, text: plain });
    if (this.editor?.nativeElement) {
      this.editor.nativeElement.innerHTML = "";
      this.isEmpty.set(true);
      this.mention.set(null);
    }
  }

  submitQuick(text: string): void {
    this.handleSend(`<p>${text.replace(/</g, "&lt;")}</p>`);
  }

  handleKeyDown(e: KeyboardEvent): void {
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

  onAttach(): void {
    alert("File attachment is not implemented in this demo.");
  }

  sendBtnClass(): string {
    const base = "ml-1 flex items-center gap-1.5 h-7 px-3 rounded-full text-[13px] font-medium transition";
    if (this.isEmpty()) return `${base} bg-gray-100 text-gray-400 cursor-not-allowed`;
    if (this.isAI) return `${base} bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:opacity-90`;
    return `${base} bg-blue-600 text-white hover:bg-blue-700`;
  }
}
