import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, EventEmitter,
  HostListener, Output, ViewChild, computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ChatStateService } from "../../services/chat-state.service";
import { LiveDataService } from "../../services/live-data.service";
import { MENTIONABLE_USERS, MentionableUser, SENDERS } from "../../data/senders";
import { Conversation, Message } from "../../models/types";
import type { LiveMessage } from "../../services/adapters";
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
  templateUrl: "./search-modal.component.html",
})
export class SearchModalComponent implements AfterViewInit {
  state = inject(ChatStateService);
  private readonly liveData = inject(LiveDataService, { optional: true });

  @Output() closed = new EventEmitter<void>();
  @Output() pickConvId = new EventEmitter<string>();
  /** Fired when the user picks a *message* result — carries the msgId so
   *  the caller can scroll the conversation pane to that message. */
  @Output() pickMessage = new EventEmitter<{ convId: string; msgId: string }>();

  @ViewChild("input") input?: ElementRef<HTMLInputElement>;

  query = signal("");
  activeIdx = signal(0);

  /** Live message hits from chat-service /search. Populated by a
   *  debounced query in `onQuery`. The legacy `messageResults` computed
   *  below merges these into the result list — when live results arrive
   *  they take precedence over local mock-data filtering. */
  liveMessageHits = signal<LiveMessage[]>([]);
  liveSearching = signal(false);
  private searchTimer?: ReturnType<typeof setTimeout>;

  q = computed(() => this.query().trim().toLowerCase());

  ngAfterViewInit(): void { this.input?.nativeElement.focus(); }

  onQuery(v: string): void {
    this.query.set(v);
    this.activeIdx.set(0);

    // Live mode: debounce a server-side search so we don't fire one POST
    // per keystroke. 250ms is the sweet spot for "feels instant" — the
    // local mock-data filter renders meanwhile so the user sees results
    // immediately, then live hits replace them when they arrive.
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (!this.liveData || !this.state.live()) {
      this.liveMessageHits.set([]);
      return;
    }
    const trimmed = v.trim();
    if (!trimmed) {
      this.liveMessageHits.set([]);
      this.liveSearching.set(false);
      return;
    }
    this.liveSearching.set(true);
    this.searchTimer = setTimeout(async () => {
      // searchEverything supports both plain text and Gmail-style
      // operators (`from:`, `is:pinned`, `has:attachment`, `before:`,
      // `after:`) — same endpoint, richer filtering. The legacy
      // searchMessages is still around for very simple text-only paths
      // (e.g. the conv-scoped header search bar).
      const res = await this.liveData!.searchEverything({ q: trimmed, limit: 30 });
      // If the user kept typing while we were waiting, drop these stale
      // results — only commit when they match the current query.
      if (this.query().trim() === trimmed) {
        this.liveMessageHits.set(res.results);
        this.liveSearching.set(false);
      }
    }, 250);
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

    // When live search has results, prefer them — they're scored by
    // Mongo $text (relevance) and cover EVERY channel the user belongs
    // to, not just the few cached in messagesByConv. The local map
    // search runs as a fallback when the live results are empty (e.g.
    // mock-data demo or backend down).
    const hits = this.liveMessageHits();
    const convs = this.state.conversations();
    if (hits.length > 0) {
      const out: { msg: Message; conv: Conversation }[] = [];
      for (const m of hits) {
        const conv = convs.find((c) => c.id === m.channelId);
        if (!conv) continue;
        out.push({ msg: m, conv });
        if (out.length >= 8) break;
      }
      return out;
    }

    // Fallback: local map search (covers mock data + cached live channels).
    const out: { msg: Message; conv: Conversation }[] = [];
    const map = this.state.messagesByConv();
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
