import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
  computed, inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { ToastService } from "../../services/toast.service";
import { SENDERS } from "../../data/senders";
import { Conversation, Message, Sender } from "../../models/types";
import { IconComponent } from "../icon/icon.component";
import { AvatarComponent } from "../avatar/avatar.component";

interface SavedRow {
  msg: Message;
  conv: Conversation;
  sender: Sender | null;
  excerpt: string;
}

/**
 * StarredView — list of every saved (bookmarked) message across all
 * conversations, newest convs first. Empty state when nothing saved.
 */
@Component({
  selector: "app-starred-view",
  standalone: true,
  imports: [CommonModule, IconComponent, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex-1 flex min-w-0 min-h-0 h-full" },
  templateUrl: "./starred-view.component.html",
  styleUrl: "./starred-view.component.css",
})
export class StarredViewComponent {
  state = inject(ChatStateService);
  toast = inject(ToastService);

  @Input() showBack = false;
  @Output() openConv = new EventEmitter<string>();
  @Output() back = new EventEmitter<void>();

  trackBy = (_: number, r: SavedRow) => r.msg.id;

  rows = computed<SavedRow[]>(() => {
    const saved = this.state.savedMsgs();
    const ids = Object.keys(saved);
    if (ids.length === 0) return [];

    const out: SavedRow[] = [];
    const map = this.state.messagesByConv();
    const convs = this.state.conversations();
    // Walk all conversations to find each saved message
    for (const [convId, msgs] of Object.entries(map)) {
      const conv = convs.find((c) => c.id === convId);
      if (!conv) continue;
      for (const m of msgs) {
        if (saved[m.id]) {
          const excerpt = m.html
            ? m.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
            : (m.text || "");
          out.push({
            msg: m,
            conv,
            sender: m.sender ? (SENDERS[m.sender] || null) : null,
            excerpt,
          });
        }
      }
    }
    return out.reverse();
  });

  onUnsave(msgId: string): void {
    if (this.state.live()) {
      void this.state.toggleSaveLive(msgId);
    } else {
      this.state.toggleSave(msgId);
    }
    this.toast.show("Removed from saved");
  }
}
