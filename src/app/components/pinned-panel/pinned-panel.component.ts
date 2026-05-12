import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output,
  SimpleChanges, computed, inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { SENDERS } from "../../data/senders";
import { Conversation, Message, Sender } from "../../models/types";

import { IconComponent } from "../icon/icon.component";
import { AvatarComponent } from "../avatar/avatar.component";
import { SidePanelShellComponent } from "../side-panel-shell/side-panel-shell.component";

/**
 * PinnedPanel — list of pinned messages for the current conversation.
 * Mirrors React `<PinnedPanel>` 1:1.
 */
@Component({
  selector: "app-pinned-panel",
  standalone: true,
  imports: [CommonModule, IconComponent, AvatarComponent, SidePanelShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./pinned-panel.component.html",
  styleUrl: "./pinned-panel.component.css",
})
export class PinnedPanelComponent implements OnChanges {
  state = inject(ChatStateService);

  @Input() conv: Conversation | null = null;
  @Input() fullscreen = false;
  @Input() width = 380;
  @Output() closed = new EventEmitter<void>();
  @Output() startResize = new EventEmitter<MouseEvent>();

  pinnedMessages = computed<Message[]>(() => {
    if (!this.conv) return [];
    const ids = this.state.pinnedMsgs()[this.conv.id] || [];
    const msgs = this.state.messagesByConv()[this.conv.id] || [];
    return msgs.filter((m) => ids.includes(m.id));
  });

  ngOnChanges(changes: SimpleChanges): void {
    // Live mode: pull the canonical pinned list from the backend whenever
    // the panel is bound to a (different) conversation. Without this the
    // panel would only show messages pinned this session — a fresh load
    // wouldn't see what other members pinned earlier.
    if (changes["conv"] && this.conv && this.state.live()) {
      void this.state.loadPinnedLive(this.conv.id);
    }
  }

  senderFor(id?: string): Sender | null {
    return id ? (SENDERS[id] || null) : null;
  }
  excerptOf(m: Message): string {
    return m.html
      ? m.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : (m.text || "");
  }

  onUnpin(msgId: string): void {
    if (!this.conv) return;
    if (this.state.live()) {
      void this.state.togglePinLive(this.conv.id, msgId);
    } else {
      this.state.unpin(this.conv.id, msgId);
    }
  }
}
