import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges,
  Output, SimpleChanges, computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { IconComponent } from "../icon/icon.component";
import { AvatarComponent } from "../avatar/avatar.component";
import { EmojiComponent } from "../emoji/emoji.component";
import { SidePanelShellComponent } from "../side-panel-shell/side-panel-shell.component";
import { ChatStateService } from "../../services/chat-state.service";
import { unicodeToCode } from "../../data/emoji-catalog";
import { RenderTextPipe } from "../../pipes/render-text.pipe";

/**
 * Message Info side panel — read-receipt + reactor breakdown for a
 * single message. Mirrors the Board / Pinned / Tasks panel shape so
 * it docks alongside the conversation in the same right-side dock.
 *
 * Header preview shows which message is being inspected; three tabs
 * partition the body (Viewed / Not viewed / Reactions). Avatars and
 * timestamps are rendered consistently across all three.
 */
@Component({
  selector: "app-message-info-panel",
  standalone: true,
  imports: [
    CommonModule, IconComponent, AvatarComponent, EmojiComponent,
    SidePanelShellComponent, RenderTextPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./message-info-panel.component.html",
})
export class MessageInfoPanelComponent implements OnChanges {
  state = inject(ChatStateService);

  /** Target message id — the panel fetches info on first open. */
  @Input({ required: true }) msgId!: string;
  @Input() fullscreen = false;
  @Input() width = 380;
  @Output() closed = new EventEmitter<void>();
  @Output() startResize = new EventEmitter<MouseEvent>();

  /** Reactive read of the cache so the panel re-renders when load completes. */
  info = computed(() => this.state.messageInfoCache()[this.msgId]?.data ?? null);
  loading = computed(() => !!this.state.messageInfoCache()[this.msgId]?.loading);

  /** Raw message body — bound via [innerHTML] | renderText so the
   *  panel header renders the same formatted HTML as the conversation
   *  bubble (links, mentions, line breaks). Office/Word paste artifacts
   *  (<style> blocks, <o:p> tags, script handlers, etc.) are stripped
   *  by the shared sanitizer the bubble already uses. The whole thing
   *  is clamped via Tailwind line-clamp in the template so it can't
   *  grow past 3 lines. */
  preview = computed<string>(() => {
    const m = this.info()?.message;
    if (!m) return "";
    return (m.content || "").trim();
  });

  /** Sender display data for the AvatarComponent — minimal shape;
   *  Avatar derives color + initials from `id` via the shared
   *  avatar-helpers so it matches every other render of this user. */
  senderUser = computed(() => {
    const s = this.info()?.message?.sender;
    if (!s) return null;
    return { id: s.ref, name: s.user_name || s.ref, color: "", initials: "" };
  });

  /** Active tab — viewed / not-viewed / reactions. */
  tab = signal<"viewed" | "not_viewed" | "reactions">("viewed");

  ngOnChanges(c: SimpleChanges): void {
    if (c["msgId"] && this.msgId) {
      // Fire-and-forget; cache fills via the computed signal above.
      void this.state.loadMessageInfoLive(this.msgId);
      // Reset the tab to "viewed" so re-opening on a new message
      // doesn't strand the panel on an empty tab.
      this.tab.set("viewed");
    }
  }

  /** Minimal avatar input — AvatarComponent derives color + initials
   *  from `id` (user_ref) and `name` via the shared avatar-helpers,
   *  so every consumer renders the same hue/initials for the same
   *  user without each component reimplementing the algorithm. */
  userFor(ref: string, name?: string) {
    return {
      id: ref,
      name: name || ref,
      color: "",
      initials: "",
    };
  }

  /** Emoji code (e.g. "1f44d") for the reaction chip. Empty when we
   *  couldn't convert the raw Unicode — caller falls back to the
   *  raw glyph in that case. */
  codeFor(emoji: string): string {
    return unicodeToCode(emoji);
  }

  /** Render a timestamp like "Tue 10:42 AM" — keeps the panel
   *  concise. Falls back to the raw ISO when Date parsing fails. */
  formatViewedAt(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
    if (sameDay) return `Today · ${time}`;
    if (isYesterday) return `Yesterday · ${time}`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " · " + time;
  }
}
