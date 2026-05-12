import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges,
  Output, SimpleChanges, computed, inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { SENDERS } from "../../data/senders";
import { Conversation, Message, Sender, Attachment } from "../../models/types";
import { IconComponent } from "../icon/icon.component";
import { AvatarComponent } from "../avatar/avatar.component";
import { SidePanelShellComponent } from "../side-panel-shell/side-panel-shell.component";
import { FilePreviewService } from "../../services/file-preview.service";
import { RenderTextPipe, SafeHtmlPipe } from "../../pipes/render-text.pipe";

/** One row on the Board's Resources/Docs tab — a pinned attachment
 *  hoisted out of its parent message so it lists alongside hand-added
 *  resources cleanly. */
interface ResourceRow {
  msgId: string;
  attachment: Attachment;
  sender?: Sender | null;
  time?: string;
}

/**
 * BoardPanel — the channel's pinboard. Two tabs:
 *   - Messages: every message someone pinned via the bubble's More menu
 *   - Resources / Docs: attachments lifted out of pinned messages so
 *     files/docs/images are easy to find without scrolling the message
 *     stack
 *
 * Replaces the previous static-demo placeholder. Reads from the same
 * `pinnedMsgs` signal that the bubble's Pin action writes to, so the
 * panel stays in sync with the live backend.
 */
@Component({
  selector: "app-board-panel",
  standalone: true,
  imports: [
    CommonModule, IconComponent, AvatarComponent, SidePanelShellComponent,
    RenderTextPipe, SafeHtmlPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./board-panel.component.html",
  styleUrl: "./board-panel.component.css",
})
export class BoardPanelComponent implements OnChanges {
  state = inject(ChatStateService);
  private preview = inject(FilePreviewService);

  @Input() conv: Conversation | null = null;
  @Input() fullscreen = false;
  @Input() width = 380;
  @Output() closed = new EventEmitter<void>();
  @Output() startResize = new EventEmitter<MouseEvent>();
  /** Emitted when the user clicks a pinned message row. Parent
   *  (AppComponent) routes this to focusMessage() which scrolls the
   *  conversation pane to the target and applies a brief highlight. */
  @Output() openMessage = new EventEmitter<string>();

  /** Pinned messages for the current channel — drives both tabs
   *  (Messages renders all; Resources extracts attachments from this
   *  set). Reads from the dedicated `pinnedMessagesByConv` cache
   *  filled by `state.loadPinnedLive()` from `GET /channels/:id/pinned`,
   *  so the panel shows pins from any point in history, not just
   *  what's in the current scroll window. Falls back to the legacy
   *  intersect-with-loaded-cache path for offline/demo mode. */
  pinnedMessages = computed<Message[]>(() => {
    if (!this.conv) return [];
    const fromBackend = this.state.pinnedMessagesByConv()[this.conv.id];
    if (fromBackend && fromBackend.length > 0) return fromBackend;
    // Fallback: mock-data / offline mode never calls loadPinnedLive,
    // so derive from the local in-memory pinnedMsgs ids ∩ message
    // cache the way the legacy PinnedPanel did.
    const ids = this.state.pinnedMsgs()[this.conv.id] || [];
    const msgs = this.state.messagesByConv()[this.conv.id] || [];
    return msgs.filter((m) => ids.includes(m.id));
  });

  /** Flattened attachment rows for the Resources tab. Each pinned
   *  message contributes one row per attachment so docs and files
   *  surface independently of their text body. */
  resources = computed<ResourceRow[]>(() => {
    const out: ResourceRow[] = [];
    for (const m of this.pinnedMessages()) {
      for (const att of m.attachments || []) {
        out.push({
          msgId: m.id,
          attachment: att,
          sender: this.senderFor(m.sender),
          time: m.time,
        });
      }
    }
    return out;
  });

  /** Active tab. Defaults to Messages since it's the most common
   *  reason to open the board. */
  tab: "messages" | "resources" = "messages";
  setTab(t: "messages" | "resources"): void { this.tab = t; }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["conv"] && this.conv && this.state.live()) {
      // Pull the canonical pinned list from the backend so the panel
      // shows messages pinned in earlier sessions, not just this one.
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

  /** Inline file-type label for the resource row's right column. */
  extOf(a: Attachment): string {
    return (a.ext || a.name?.split(".").pop() || "file").toUpperCase();
  }

  /** Click on a pinned message row → jump to it in the conversation
   *  pane. Auto-closes the panel on mobile/fullscreen since the panel
   *  takes over the viewport there; keeps it open in side-by-side
   *  desktop mode so the user can pick another pin without re-opening. */
  onOpenMessage(msgId: string): void {
    this.openMessage.emit(msgId);
    if (this.fullscreen) {
      this.closed.emit();
    }
  }

  onUnpin(msgId: string): void {
    if (!this.conv) return;
    if (this.state.live()) {
      void this.state.togglePinLive(this.conv.id, msgId);
    } else {
      this.state.unpin(this.conv.id, msgId);
    }
  }

  /** Open the file in the fullscreen preview overlay (same path the
   *  bubble attachment renderer uses). Siblings = every resource on
   *  the board so the user can flip through with prev/next. */
  onOpenResource(r: ResourceRow): void {
    const siblings = this.resources().map((rr) => rr.attachment);
    this.preview.open(r.attachment, siblings);
  }
}
