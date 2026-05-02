import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
  computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { SENDERS } from "../../data/senders";
import { Conversation, Message, Sender, ThreadReply } from "../../models/types";
import { IconComponent } from "../icon/icon.component";
import { AvatarComponent } from "../avatar/avatar.component";

interface ThreadItem {
  key: string;
  convId: string;
  parentMsgId: string;
  conv: Conversation | undefined;
  parent: Message;
  parentSender: Sender;
  parentExcerpt: string;
  parentTime?: string;
  replyCount: number;
  lastReplyTime?: string;
  lastReplier: Sender;
  lastReplyExcerpt: string;
  reasonLabel: "You replied" | "Mentions you" | "Following";
  isUnread: boolean;
  unreadCount: number;
  iReplied: boolean;
  iMentioned: boolean;
  iManuallyFollowed: boolean;
}

type ThreadFilter = "all" | "replied" | "mentioned" | "followed";

/**
 * Google-Chat-style unified view of every thread the current user is following:
 *  - Threads they've replied to
 *  - Threads where they were @mentioned (parent or any reply)
 *  - Threads they manually followed
 *
 * Newest activity first. Filter pills: All / You replied / Mentions you / Followed.
 * Mirrors React `<ThreadsView>` 1:1.
 */
@Component({
  selector: "app-threads-view",
  standalone: true,
  imports: [CommonModule, IconComponent, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex-1 flex min-w-0 min-h-0 h-full" },
  template: `
    <div class="flex-1 flex flex-col bg-white h-full w-full min-h-0">
      <!-- ============== Header ============== -->
      <div class="px-4 sm:px-6 pt-5 pb-3 border-b border-gray-100">
        <div class="flex items-start gap-2">
          <button
            *ngIf="showBack"
            (click)="back.emit()"
            class="p-1.5 -ml-1 rounded-full hover:bg-gray-100 shrink-0"
            title="Back"
          >
            <app-icon name="arrow-left" [size]="20" class="text-gray-700"></app-icon>
          </button>
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline gap-2 flex-wrap">
              <h1 class="text-[22px] font-normal text-gray-900">Threads</h1>
              <span *ngIf="unreadTotal() > 0"
                    class="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {{ unreadTotal() }} new
              </span>
            </div>
            <p class="text-[12px] text-gray-500 mt-0.5">
              {{ items().length === 0
                ? 'Threads you reply to or are mentioned in will appear here'
                : items().length + ' thread' + (items().length === 1 ? '' : 's') + " you're following" }}
            </p>
          </div>
          <button
            *ngIf="unreadTotal() > 0"
            (click)="markAllRead()"
            class="hidden sm:inline-flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-900 font-medium px-2 py-1 rounded transition shrink-0"
            title="Mark all threads as read"
          >
            <app-icon name="check-circle" [size]="12"></app-icon>
            Mark all read
          </button>
        </div>

        <!-- Filter pills -->
        <div *ngIf="items().length > 0"
             class="flex items-center gap-1.5 mt-3 overflow-x-auto scrollable">
          <button
            *ngFor="let f of FILTERS"
            (click)="filter.set(f.v)"
            [class]="filterClass(f.v)"
          >
            {{ f.label }}
            <span *ngIf="counts()[f.v] > 0"
                  [class]="'ml-1.5 ' + (filter() === f.v ? 'text-blue-100' : 'text-gray-500')">
              {{ counts()[f.v] }}
            </span>
          </button>
        </div>
      </div>

      <!-- ============== List ============== -->
      <div *ngIf="filtered().length === 0; else listTpl"
           class="flex-1 flex flex-col items-center justify-center text-center px-6 text-gray-500">
        <app-icon name="message-circle-more" [size]="40" class="text-gray-300 mb-2"></app-icon>
        <h3 class="text-[15px] font-medium text-gray-700">
          {{ items().length === 0 ? 'No threads yet' : 'Nothing matches this filter' }}
        </h3>
        <p class="text-[13px] text-gray-500 mt-1 max-w-xs">
          {{ items().length === 0
            ? "When you reply to a message or someone @mentions you in a thread, it'll show up here."
            : 'Switch back to All to see every thread you\\'re following.' }}
        </p>
      </div>

      <ng-template #listTpl>
        <div class="flex-1 overflow-y-auto scrollable divide-y divide-gray-50">
          <div *ngFor="let it of filtered(); trackBy: trackByThread"
               class="group/threadrow relative">
            <button
              (click)="openThread.emit({ msgId: it.parentMsgId, convId: it.convId })"
              [class]="'block w-full text-left px-4 sm:px-5 py-4 hover:bg-gray-50 transition ' +
                (it.isUnread ? 'bg-blue-50/30' : '')"
            >
              <div class="flex items-start gap-3">
                <app-avatar [user]="it.parentSender" [size]="36"></app-avatar>
                <div class="flex-1 min-w-0">
                  <!-- Parent header -->
                  <div class="flex items-baseline gap-2 flex-wrap">
                    <span class="text-[14px] font-semibold text-gray-900 truncate">{{ it.parentSender.name }}</span>
                    <span *ngIf="it.conv" class="text-[12px] text-gray-500 truncate">in {{ it.conv.name }}</span>
                    <span [class]="'ml-auto text-[11px] font-semibold px-1.5 py-0.5 rounded shrink-0 ' + reasonClass(it.reasonLabel)">
                      {{ it.reasonLabel }}
                    </span>
                    <span *ngIf="it.isUnread" class="h-2 w-2 rounded-full bg-blue-500 shrink-0"></span>
                  </div>
                  <div class="text-[13px] text-gray-700 mt-1 line-clamp-2 break-words">
                    {{ it.parentExcerpt }}
                  </div>
                  <!-- Last reply summary -->
                  <div class="flex items-start gap-2 mt-2 pl-3 border-l-2 border-gray-200">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-baseline gap-1.5 flex-wrap">
                        <app-icon name="message-circle-more" [size]="11" class="text-blue-600 shrink-0 self-center"></app-icon>
                        <span [class]="'text-[12px] font-medium ' + (it.isUnread ? 'text-blue-700' : 'text-gray-700')">
                          {{ it.unreadCount > 0
                            ? it.unreadCount + ' new ' + (it.replyCount === 1 ? 'reply' : 'replies')
                            : it.replyCount + ' ' + (it.replyCount === 1 ? 'reply' : 'replies') }}
                        </span>
                        <span class="text-[11px] text-gray-500">· last by {{ it.lastReplier.name }}</span>
                        <span class="text-[11px] text-gray-400 ml-auto shrink-0">{{ it.lastReplyTime }}</span>
                      </div>
                      <div *ngIf="it.lastReplyExcerpt"
                           class="text-[12px] text-gray-600 mt-0.5 line-clamp-1 break-words">
                        {{ it.lastReplyExcerpt }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </button>
            <!-- Hover unfollow button -->
            <button
              (click)="$event.stopPropagation(); unfollow(it.key)"
              class="absolute top-3 right-3 opacity-0 group-hover/threadrow:opacity-100 text-[11px] text-gray-500 hover:text-gray-900 hover:bg-white px-2 py-1 rounded ring-1 ring-gray-200 transition"
              title="Unfollow this thread"
            >
              Unfollow
            </button>
          </div>
        </div>
      </ng-template>
    </div>
  `,
})
export class ThreadsViewComponent {
  state = inject(ChatStateService);

  @Input() currentUserId = "me";
  @Input() showBack = false;
  @Output() openThread = new EventEmitter<{ msgId: string; convId: string }>();
  @Output() back = new EventEmitter<void>();

  filter = signal<ThreadFilter>("all");
  readonly FILTERS: { v: ThreadFilter; label: string }[] = [
    { v: "all",       label: "All" },
    { v: "replied",   label: "You replied" },
    { v: "mentioned", label: "Mentions you" },
    { v: "followed",  label: "Followed" },
  ];

  trackByThread = (_: number, it: ThreadItem) => it.key;

  filterClass(v: ThreadFilter): string {
    const base = "text-[12px] font-medium px-3 py-1 rounded-full transition shrink-0";
    return this.filter() === v
      ? `${base} bg-blue-600 text-white`
      : `${base} bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50`;
  }

  reasonClass(label: ThreadItem["reasonLabel"]): string {
    if (label === "You replied")  return "bg-emerald-50 text-emerald-700";
    if (label === "Mentions you") return "bg-violet-50 text-violet-700";
    return "bg-gray-100 text-gray-600";
  }

  unfollow(key: string): void { this.state.unfollowThread(key); }
  markAllRead(): void {
    this.state.markAllThreadsRead(this.items().map((i) => i.key));
  }

  /* ============================ Thread aggregation ============================ */

  items = computed<ThreadItem[]>(() => this.computeItems());

  filtered = computed<ThreadItem[]>(() => {
    const f = this.filter();
    return this.items().filter((it) => {
      if (f === "replied")   return it.iReplied;
      if (f === "mentioned") return it.iMentioned;
      if (f === "followed")  return it.iManuallyFollowed;
      return true;
    });
  });

  counts = computed<Record<ThreadFilter, number>>(() => {
    const items = this.items();
    return {
      all: items.length,
      replied: items.filter((i) => i.iReplied).length,
      mentioned: items.filter((i) => i.iMentioned).length,
      followed: items.filter((i) => i.iManuallyFollowed).length,
    };
  });

  unreadTotal = computed(() => this.items().filter((i) => i.isUnread).length);

  private static readonly MENTION_RE =
    /@([A-Z][A-Za-z]*(?:\s[A-Z][A-Za-z]*)?)/g;

  private buildAliases(): { matchFn: (n: string) => boolean } {
    const me = SENDERS[this.currentUserId] || ({} as Sender);
    const set = new Set<string>();
    if (me.name) {
      me.name.split(/\s+/).forEach((t) => { if (t) set.add(t.toLowerCase()); });
      set.add(me.name.toLowerCase());
    }
    if (this.currentUserId === "me") {
      ["suresh", "rajsuresh", "rajsuresh airlift", "suresh r"]
        .forEach((t) => set.add(t));
    }
    const matchFn = (n: string): boolean => {
      const lc = (n || "").toLowerCase();
      if (set.has(lc)) return true;
      for (const t of set) {
        if (t.length >= 4 && lc.includes(t)) return true;
      }
      return false;
    };
    return { matchFn };
  }

  private containsMyMention(text = "", html = "", isMe: (n: string) => boolean): boolean {
    const ms = new Set<string>();
    if (text) {
      const re = new RegExp(ThreadsViewComponent.MENTION_RE.source, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) ms.add(m[1]);
    }
    if (html) {
      const chipRe = /class="mention-chip"[^>]*>@([^<]+)</g;
      let cm: RegExpExecArray | null;
      while ((cm = chipRe.exec(html)) !== null) ms.add(cm[1].trim());
      const stripped = html.replace(/<[^>]+>/g, " ");
      const re = new RegExp(ThreadsViewComponent.MENTION_RE.source, "g");
      let tm: RegExpExecArray | null;
      while ((tm = re.exec(stripped)) !== null) ms.add(tm[1]);
    }
    return Array.from(ms).some(isMe);
  }

  private computeItems(): ThreadItem[] {
    const { matchFn } = this.buildAliases();
    const conversations = this.state.conversations();
    const messagesByConv = this.state.messagesByConv();
    const followed = this.state.manuallyFollowedThreads();
    const unfollowed = this.state.manuallyUnfollowedThreads();
    const read = this.state.readThreads();

    const out: ThreadItem[] = [];
    for (const [convId, msgs] of Object.entries(messagesByConv)) {
      const conv = conversations.find((c) => c.id === convId);
      if (!conv) continue;
      for (const m of msgs) {
        if (!m.thread || !m.thread.replies) continue;
        const key = `${convId}:${m.id}`;
        if (unfollowed.has(key)) continue;

        const replies: ThreadReply[] = m.thread.replies || [];
        const iReplied = replies.some((r) => r.sender === this.currentUserId);
        const iMentionInParent = this.containsMyMention(m.text || "", m.html || "", matchFn);
        const iMentionInReply = replies.some((r) =>
          this.containsMyMention(r.text || "", "", matchFn)
        );
        const iManually = followed.has(key);
        const iAmFollowing = iReplied || iMentionInParent || iMentionInReply || iManually;
        if (!iAmFollowing) continue;

        const reasonLabel: ThreadItem["reasonLabel"] = iManually
          ? "Following"
          : iReplied
            ? "You replied"
            : (iMentionInParent || iMentionInReply)
              ? "Mentions you"
              : "Following";

        const lastReply = replies[replies.length - 1] || ({} as ThreadReply);
        const lastReplier = SENDERS[lastReply.sender] ||
          ({ name: "Unknown", color: "bg-gray-400", initials: "?" } as Sender);
        const isUnread = !read.has(key);
        const unreadCount = isUnread ? replies.length : 0;
        const parentSender = SENDERS[m.sender || ""] ||
          ({ name: "Unknown", color: "bg-gray-400", initials: "?" } as Sender);
        const excerpt = m.html
          ? m.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
          : (m.text || "");
        const lastReplyExcerpt = (lastReply as any).text ||
          ((lastReply as any).html ? (lastReply as any).html.replace(/<[^>]+>/g, " ").trim() : "");

        out.push({
          key, convId, parentMsgId: m.id, conv, parent: m,
          parentSender, parentExcerpt: excerpt, parentTime: m.time,
          replyCount: replies.length,
          lastReplyTime: m.thread.lastTime || lastReply.time || m.time,
          lastReplier, lastReplyExcerpt,
          reasonLabel, isUnread, unreadCount,
          iReplied, iMentioned: iMentionInParent || iMentionInReply, iManuallyFollowed: iManually,
        });
      }
    }
    return out.reverse();
  }
}
