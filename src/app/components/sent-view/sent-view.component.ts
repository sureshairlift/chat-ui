import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
  computed, inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { Conversation } from "../../models/types";
import { IconComponent } from "../icon/icon.component";
import { AvatarComponent } from "../avatar/avatar.component";

interface SentItem {
  convId: string;
  convName: string;
  conv: Conversation;
  time?: string;
  excerpt: string;
  msgId: string;
  orderHint: number;
}

/**
 * Lists every message the user has sent, newest first, with conv context.
 * Mirrors React `<SentView>` 1:1.
 */
@Component({
  selector: "app-sent-view",
  standalone: true,
  imports: [CommonModule, IconComponent, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex-1 flex min-w-0 min-h-0 h-full" },
  templateUrl: "./sent-view.component.html",
  styleUrl: "./sent-view.component.css",
})
export class SentViewComponent {
  state = inject(ChatStateService);

  @Input() showBack = false;
  @Output() openConv = new EventEmitter<string>();
  @Output() back = new EventEmitter<void>();

  trackBy = (_: number, it: SentItem) => `${it.convId}-${it.msgId}-${it.orderHint}`;

  items = computed<SentItem[]>(() => {
    const result: SentItem[] = [];
    const convs = this.state.conversations();
    const messagesByConv = this.state.messagesByConv();
    for (const conv of convs) {
      const msgs = messagesByConv[conv.id] || [];
      msgs.forEach((m, idx) => {
        if (m.sender !== "me") return;
        const raw = m.html
          ? m.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
          : (m.text || "");
        result.push({
          convId: conv.id, convName: conv.name, conv,
          time: m.time, excerpt: raw, msgId: m.id, orderHint: idx,
        });
      });
    }
    return result.reverse();
  });
}
