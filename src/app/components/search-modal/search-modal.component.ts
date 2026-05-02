import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, EventEmitter,
  HostListener, Output, ViewChild, computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ChatStateService } from "../../services/chat-state.service";
import { MENTIONABLE_USERS, MentionableUser, SENDERS } from "../../data/senders";
import { Conversation, Message } from "../../models/types";
import { IconComponent } from "../icon/icon.component";
import { AvatarComponent } from "../avatar/avatar.component";

interface ConvHit { kind: "conv";    data: Conversation; }
interface PersonHit { kind: "person"; data: MentionableUser; }
interface MessageHit { kind: "message"; data: { msg: Message; conv: Conversation }; }
type Hit = ConvHit | PersonHit | MessageHit;

interface SegmentList { before: string; match: string; after: string; }

/**
 * SearchModal — full-screen Cmd+K search, mirrors React `<SearchModal>` 1:1.
 *
 * Searches three buckets in parallel:
 *  - People: mentionable users by name or org
 *  - Conversations: by name or org
 *  - Messages: by text or stripped HTML, capped at 8 results
 *
 * Keyboard:
 *   ↑/↓  navigate
 *   ⏎   pick (open conv)
 *   Esc  close
 */
@Component({
  selector: "app-search-modal",
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div (click)="closed.emit()"
         class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[6vh] sm:pt-[10vh] px-2 sm:px-4">
      <div (click)="$event.stopPropagation()"
           class="w-full max-w-2xl bg-white rounded-xl sm:rounded-2xl shadow-2xl ring-1 ring-gray-200 overflow-hidden flex flex-col"
           style="max-height: 85vh;">

        <!-- Search input -->
        <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <app-icon name="search" [size]="18" class="text-gray-400 shrink-0"></app-icon>
          <input
            #input
            [ngModel]="query()"
            (ngModelChange)="onQuery($event)"
            (keydown)="handleKeyDown($event)"
            placeholder="Search people, conversations, messages..."
            class="flex-1 outline-none text-[15px] text-gray-900 placeholder-gray-400 bg-transparent"
          />
          <span class="hidden sm:flex items-center gap-1 text-[10px] text-gray-400">
            <kbd class="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-200">esc</kbd>
            <span>to close</span>
          </span>
        </div>

        <!-- Results -->
        <div class="flex-1 overflow-y-auto scrollable">
          <!-- Empty (no query yet) -->
          <div *ngIf="!q()" class="px-6 py-10 text-center text-[13px] text-gray-500">
            <app-icon name="search" [size]="28" class="mx-auto mb-2 text-gray-300"></app-icon>
            <p>Start typing to search across everything.</p>
            <p class="text-[12px] text-gray-400 mt-1">
              Tip: <kbd class="px-1 bg-gray-100 rounded">↑↓</kbd> to navigate ·
              <kbd class="px-1 bg-gray-100 rounded">Enter</kbd> to open
            </p>
          </div>

          <!-- No matches -->
          <div *ngIf="q() && flat().length === 0"
               class="px-6 py-10 text-center text-[13px] text-gray-500">
            No results for "<span class="font-medium text-gray-700">{{ query() }}</span>".
          </div>

          <!-- People -->
          <ng-container *ngIf="peopleResults().length > 0">
            <div class="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <app-icon name="users" [size]="11"></app-icon> People
            </div>
            <button
              *ngFor="let u of peopleResults(); let i = index"
              (mouseenter)="setIdx(personIndex(i))"
              (click)="pickPerson(u)"
              [class]="rowClass(personIndex(i))"
            >
              <app-avatar [user]="u" [size]="32"></app-avatar>
              <div class="flex-1 min-w-0">
                <div class="text-[14px] font-medium text-gray-900 truncate">
                  <ng-container *ngTemplateOutlet="hl; context: { value: u.name }"></ng-container>
                </div>
                <div *ngIf="u.org" class="text-[12px] text-gray-500 truncate">
                  <ng-container *ngTemplateOutlet="hl; context: { value: u.org }"></ng-container>
                </div>
              </div>
            </button>
          </ng-container>

          <!-- Conversations -->
          <ng-container *ngIf="convResults().length > 0">
            <div class="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <app-icon name="message-square" [size]="11"></app-icon> Conversations
            </div>
            <button
              *ngFor="let c of convResults(); let i = index"
              (mouseenter)="setIdx(convIndex(i))"
              (click)="pickConv(c)"
              [class]="rowClass(convIndex(i))"
            >
              <app-avatar [user]="c" [size]="32"></app-avatar>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="text-[14px] font-medium text-gray-900 truncate">
                    <ng-container *ngTemplateOutlet="hl; context: { value: c.name }"></ng-container>
                  </span>
                  <app-icon *ngIf="c.isAI" name="sparkles" [size]="11" class="text-purple-600"></app-icon>
                  <app-icon *ngIf="c.isExternal" name="globe" [size]="11" class="text-amber-600"></app-icon>
                </div>
                <div class="text-[12px] text-gray-500 truncate">
                  <ng-container *ngIf="c.org">{{ c.org }} · </ng-container>{{ c.lastSnippet }}
                </div>
              </div>
            </button>
          </ng-container>

          <!-- Messages -->
          <ng-container *ngIf="messageResults().length > 0">
            <div class="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <app-icon name="quote" [size]="11"></app-icon> Messages
            </div>
            <button
              *ngFor="let mr of messageResults(); let i = index"
              (mouseenter)="setIdx(messageIndex(i))"
              (click)="pickMessageHit(mr)"
              [class]="rowClass(messageIndex(i)) + ' items-start'"
            >
              <app-avatar [user]="mr.conv" [size]="32"></app-avatar>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-[13px] font-medium text-gray-900 truncate">{{ mr.conv.name }}</span>
                  <span class="text-[11px] text-gray-500">·</span>
                  <span class="text-[11px] text-gray-500 truncate">{{ senderName(mr.msg.sender) }}</span>
                  <span *ngIf="mr.msg.time" class="text-[11px] text-gray-400 ml-auto shrink-0">{{ mr.msg.time }}</span>
                </div>
                <div class="text-[12px] text-gray-700 line-clamp-2 mt-0.5">
                  <ng-container *ngTemplateOutlet="hl; context: { value: stripHtml(mr.msg.text || mr.msg.html || '') }"></ng-container>
                </div>
              </div>
            </button>
          </ng-container>
        </div>
      </div>
    </div>

    <!-- Substring highlighter template -->
    <ng-template #hl let-value="value">
      <ng-container *ngIf="splitMatch(value) as parts; else plain">
        {{ parts.before }}<mark class="bg-yellow-200 text-gray-900 rounded px-0.5">{{ parts.match }}</mark>{{ parts.after }}
      </ng-container>
      <ng-template #plain>{{ value }}</ng-template>
    </ng-template>
  `,
})
export class SearchModalComponent implements AfterViewInit {
  state = inject(ChatStateService);

  @Output() closed = new EventEmitter<void>();
  @Output() pickConvId = new EventEmitter<string>();
  /** Fired when the user picks a *message* result — carries the msgId so
   *  the caller can scroll the conversation pane to that message. */
  @Output() pickMessage = new EventEmitter<{ convId: string; msgId: string }>();

  @ViewChild("input") input?: ElementRef<HTMLInputElement>;

  query = signal("");
  activeIdx = signal(0);

  q = computed(() => this.query().trim().toLowerCase());

  ngAfterViewInit(): void { this.input?.nativeElement.focus(); }

  onQuery(v: string): void {
    this.query.set(v);
    this.activeIdx.set(0);
  }

  setIdx(i: number): void { this.activeIdx.set(i); }

  /* --------------------------- Result computeds --------------------------- */

  peopleResults = computed<MentionableUser[]>(() => {
    const q = this.q();
    if (!q) return [];
    return MENTIONABLE_USERS.filter(
      (u) => u.name.toLowerCase().includes(q) || (u.org || "").toLowerCase().includes(q)
    ).slice(0, 4);
  });

  convResults = computed<Conversation[]>(() => {
    const q = this.q();
    if (!q) return [];
    return this.state.conversations()
      .filter((c) => !c.isNewChat &&
        (c.name.toLowerCase().includes(q) || (c.org || "").toLowerCase().includes(q)))
      .slice(0, 5);
  });

  messageResults = computed<{ msg: Message; conv: Conversation }[]>(() => {
    const q = this.q();
    if (!q) return [];
    const out: { msg: Message; conv: Conversation }[] = [];
    const map = this.state.messagesByConv();
    const convs = this.state.conversations();
    for (const [convId, msgs] of Object.entries(map)) {
      for (const m of msgs) {
        const haystack = this.stripHtml(m.text || m.html || "").toLowerCase();
        if (haystack.includes(q)) {
          const conv = convs.find((c) => c.id === convId);
          if (!conv) continue;
          out.push({ msg: m, conv });
          if (out.length >= 8) return out;
        }
      }
    }
    return out;
  });

  flat = computed<Hit[]>(() => [
    ...this.peopleResults().map<PersonHit>((u) => ({ kind: "person", data: u })),
    ...this.convResults().map<ConvHit>((c) => ({ kind: "conv", data: c })),
    ...this.messageResults().map<MessageHit>((mr) => ({ kind: "message", data: mr })),
  ]);

  /* --------------------------- Index helpers --------------------------- */

  personIndex(i: number): number { return i; }
  convIndex(i: number): number { return this.peopleResults().length + i; }
  messageIndex(i: number): number {
    return this.peopleResults().length + this.convResults().length + i;
  }

  rowClass(idx: number): string {
    const base = "w-full flex items-center gap-3 px-4 py-2 text-left";
    return this.activeIdx() === idx ? `${base} bg-blue-50` : `${base} hover:bg-gray-50`;
  }

  /* --------------------------- Highlighter ---------------------------- */

  splitMatch(value: string): SegmentList | null {
    const q = this.q();
    if (!q || !value) return null;
    const idx = value.toLowerCase().indexOf(q);
    if (idx === -1) return null;
    return {
      before: value.slice(0, idx),
      match:  value.slice(idx, idx + q.length),
      after:  value.slice(idx + q.length),
    };
  }

  stripHtml(s: string): string { return (s || "").replace(/<[^>]+>/g, " "); }

  senderName(id?: string): string {
    if (!id) return "Unknown";
    if (id === "me") return "You";
    return SENDERS[id]?.name || "Unknown";
  }

  /* --------------------------- Picking ---------------------------- */

  pickPerson(u: MentionableUser): void {
    // Pick the conversation matching the user id (the data is built that way)
    const conv = this.state.conversations().find((c) => c.id === u.id);
    if (conv) this.pickConvId.emit(conv.id);
    this.closed.emit();
  }
  pickConv(c: Conversation): void {
    this.pickConvId.emit(c.id);
    this.closed.emit();
  }
  /** Pick a specific message result — caller scrolls the conv pane to it. */
  pickMessageHit(mr: { conv: Conversation; msg: Message }): void {
    this.pickMessage.emit({ convId: mr.conv.id, msgId: mr.msg.id });
    this.closed.emit();
  }
  pickHit(h: Hit): void {
    if (h.kind === "person")  this.pickPerson(h.data);
    else if (h.kind === "conv") this.pickConv(h.data);
    else this.pickMessageHit(h.data);
  }

  /* --------------------------- Keyboard ---------------------------- */

  handleKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      this.closed.emit();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      this.activeIdx.set(Math.min(this.flat().length - 1, this.activeIdx() + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.activeIdx.set(Math.max(0, this.activeIdx() - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = this.flat()[this.activeIdx()];
      if (hit) this.pickHit(hit);
    }
  }

  // Esc when input doesn't have focus
  @HostListener("document:keydown.escape", ["$event"]) onDocEsc(e: KeyboardEvent): void {
    e.preventDefault();
    this.closed.emit();
  }
}
