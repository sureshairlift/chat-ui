import {
  ChangeDetectionStrategy, Component, HostListener, computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";

import { ChatStateService } from "../../services/chat-state.service";
import { SafeHtmlPipe, RenderTextPipe } from "../../pipes/render-text.pipe";
import { SENDERS } from "../../data/senders";
import type { Sender } from "../../models/types";

import { IconComponent } from "../icon/icon.component";
import { AvatarComponent } from "../avatar/avatar.component";

/**
 * MessageFullscreenComponent — modal viewer for a single message. Open
 * via ChatStateService.openMessageFullscreen(msg) (wired to the
 * "Expand" item in the message-bubble more menu); close on Esc, the
 * close button, or backdrop click.
 *
 * Renders:
 *   - Sender avatar + name + timestamp header
 *   - The full message body (sanitized HTML or rich text), no clipping,
 *     no overflow, fully scrollable inside the modal so very long
 *     messages stay readable.
 *
 * Lives at AppComponent's root so it overlays everything else (sidebar,
 * thread panel, etc). Pure UI — no backend calls.
 */
@Component({
  selector: "app-message-fullscreen",
  standalone: true,
  imports: [CommonModule, IconComponent, AvatarComponent, SafeHtmlPipe, RenderTextPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./message-fullscreen.component.html",
  styleUrl: "./message-fullscreen.component.css",
})
export class MessageFullscreenComponent {
  state = inject(ChatStateService);

  msg = computed(() => this.state.expandedMessage());

  senderObj = computed<Sender | null>(() => {
    const m = this.msg();
    if (!m?.sender) return null;
    // Live messages carry a structured senderRecord; mock messages fall
    // back to the SENDERS directory keyed by short id.
    const live = (m as { senderRecord?: Sender }).senderRecord;
    if (live) return live;
    return SENDERS[m.sender] ?? null;
  });

  @HostListener("document:keydown.escape")
  onEsc(): void { if (this.msg()) this.close(); }

  close(): void { this.state.closeMessageFullscreen(); }
}
