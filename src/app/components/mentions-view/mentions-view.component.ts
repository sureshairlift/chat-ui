import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
  computed, inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { MentionDetectorService } from "../../services/mention-detector.service";
import { SENDERS } from "../../data/senders";
import { Conversation, Sender } from "../../models/types";
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
  styleUrl: "./mentions-view.component.css",
})
export class MentionsViewComponent {
  state = inject(ChatStateService);
  private mentionDetector = inject(MentionDetectorService);

  @Input() currentUserId = "me";
  @Input() showBack = false;
  @Output() openConv = new EventEmitter<string>();
  @Output() back = new EventEmitter<void>();

  items = computed<MentionItem[]>(() => this.computeItems());

  trackByMention = (_: number, it: MentionItem) => `${it.convId}-${it.msgId}`;

  private computeItems(): MentionItem[] {
    const isMeMention = this.mentionDetector.buildSelfMatcher(this.currentUserId);

    const results: MentionItem[] = [];
    const conversations = this.state.conversations();
    const messagesByConv = this.state.messagesByConv();

    for (const [convId, msgs] of Object.entries(messagesByConv)) {
      const conv = conversations.find((c) => c.id === convId);
      if (!conv) continue;
      for (const m of msgs) {
        if (!m.text && !m.html) continue;
        const mentions = this.mentionDetector.extractMentions(m.text || "", m.html || "");
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
