import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
  computed, inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { SENDERS } from "../../data/senders";
import { Conversation, Message, Sender } from "../../models/types";
import { IconComponent } from "../icon/icon.component";
import { AvatarComponent } from "../avatar/avatar.component";

interface MentionItem {
  msgId: string;
  convId: string;
  convName: string;
  conv: Conversation;
  senderName: string;
  sender: Sender;
  time?: string;
  mentions: string[];
  excerpt: string;
}

/**
 * Aggregates every message that @-mentions the current user, across all
 * conversations. Detects mentions in plain text via regex AND in HTML via
 * `class="mention-chip"` spans. Mirrors React `<MentionsView>`.
 */
@Component({
  selector: "app-mentions-view",
  standalone: true,
  imports: [CommonModule, IconComponent, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex-1 flex min-w-0 min-h-0 h-full" },
  templateUrl: "./mentions-view.component.html",
})
export class MentionsViewComponent {
  state = inject(ChatStateService);

  @Input() currentUserId = "me";
  @Input() showBack = false;
  @Output() openConv = new EventEmitter<string>();
  @Output() back = new EventEmitter<void>();

  items = computed<MentionItem[]>(() => this.computeItems());

  trackByMention = (_: number, it: MentionItem) => `${it.convId}-${it.msgId}`;

  /** Mention regex matching the React file's exact pattern. */
  private static readonly MENTION_RE =
    /@([A-Z][A-Za-z]*(?:\s[A-Z][A-Za-z]*)?)/g;

  private computeItems(): MentionItem[] {
    const me = SENDERS[this.currentUserId] || ({} as Sender);
    // Build alias set
    const myTokens = new Set<string>();
    if (me.name) {
      me.name.split(/\s+/).forEach((t) => { if (t) myTokens.add(t.toLowerCase()); });
      myTokens.add(me.name.toLowerCase());
    }
    if (this.currentUserId === "me") {
      ["suresh", "rajsuresh", "rajsuresh airlift", "suresh r"]
        .forEach((t) => myTokens.add(t));
    }
    const isMeMention = (n: string): boolean => {
      const lc = (n || "").toLowerCase();
      if (myTokens.has(lc)) return true;
      for (const t of myTokens) {
        if (t.length >= 4 && lc.includes(t)) return true;
      }
      return false;
    };

    const results: MentionItem[] = [];
    const conversations = this.state.conversations();
    const messagesByConv = this.state.messagesByConv();

    for (const [convId, msgs] of Object.entries(messagesByConv)) {
      const conv = conversations.find((c) => c.id === convId);
      if (!conv) continue;
      for (const m of msgs) {
        if (!m.text && !m.html) continue;
        const mentions = new Set<string>();
        // Plain text
        if (m.text) {
          const re = new RegExp(MentionsViewComponent.MENTION_RE.source, "g");
          let match: RegExpExecArray | null;
          while ((match = re.exec(m.text)) !== null) mentions.add(match[1]);
        }
        // HTML — chips and inline @Names
        if (m.html) {
          const chipRe = /class="mention-chip"[^>]*>@([^<]+)</g;
          let cm: RegExpExecArray | null;
          while ((cm = chipRe.exec(m.html)) !== null) mentions.add(cm[1].trim());
          const stripped = m.html.replace(/<[^>]+>/g, " ");
          const re = new RegExp(MentionsViewComponent.MENTION_RE.source, "g");
          let tm: RegExpExecArray | null;
          while ((tm = re.exec(stripped)) !== null) mentions.add(tm[1]);
        }
        if (mentions.size === 0) continue;
        // Keep only if at least one mention is of "me"
        const meMentions = Array.from(mentions).filter(isMeMention);
        if (meMentions.length === 0) continue;

        const sender = SENDERS[m.sender || ""] ||
          ({ name: "Unknown", color: "bg-gray-400", initials: "?" } as Sender);
        const excerpt = m.html
          ? m.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
          : (m.text || "");
        results.push({
          msgId: m.id,
          convId,
          convName: conv.name,
          conv,
          senderName: sender.name,
          sender,
          time: m.time,
          mentions: Array.from(mentions),
          excerpt,
        });
      }
    }
    // Newest first
    return results.reverse();
  }
}
