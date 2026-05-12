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
import { RenderTextPipe } from "../../pipes/render-text.pipe";
import { SidePanelShellComponent } from "../side-panel-shell/side-panel-shell.component";

interface FollowedRow extends Message {
  convId: string;
}

/**
 * FollowingPanel — list every message that has thread metadata, across
 * every conversation. Mirrors React `<FollowingPanel>` 1:1.
 */
@Component({
  selector: "app-following-panel",
  standalone: true,
  imports: [
    CommonModule, IconComponent, AvatarComponent, RenderTextPipe,
    SidePanelShellComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./following-panel.component.html",
  styleUrl: "./following-panel.component.css",
})
export class FollowingPanelComponent {
  state = inject(ChatStateService);

  @Input() fullscreen = false;
  @Input() width = 380;
  @Output() closed = new EventEmitter<void>();
  @Output() startResize = new EventEmitter<MouseEvent>();
  @Output() openThread = new EventEmitter<{ msgId: string; convId: string }>();

  rows = computed<FollowedRow[]>(() => {
    const out: FollowedRow[] = [];
    const map = this.state.messagesByConv();
    for (const [convId, msgs] of Object.entries(map)) {
      for (const m of msgs) {
        if (m.thread) out.push({ ...m, convId });
      }
    }
    return out;
  });

  senderFor(id?: string): Sender | null {
    return id ? (SENDERS[id] || null) : null;
  }

  convFor(id: string): Conversation | undefined {
    return this.state.conversations().find((c) => c.id === id);
  }
}
