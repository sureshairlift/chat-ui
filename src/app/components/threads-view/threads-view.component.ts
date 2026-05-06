import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
  computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { MentionDetectorService } from "../../services/mention-detector.service";
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
  templateUrl: "./threads-view.component.html",
  styleUrl: "./threads-view.component.css",
})
export class ThreadsViewComponent {
  state = inject(ChatStateService);
  private mentionDetector = inject(MentionDetectorService);

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

  private computeItems(): ThreadItem[] {
    const matchFn = this.mentionDetector.buildSelfMatcher(this.currentUserId);
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
        const iMentionInParent = this.mentionDetector.containsSelfMention(m.text || "", m.html || "", matchFn);
        const iMentionInReply = replies.some((r) =>
          this.mentionDetector.containsSelfMention(r.text || "", "", matchFn)
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
