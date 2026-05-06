import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges,
  Output, SimpleChanges, computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { LiveDataService } from "../../services/live-data.service";
import { SENDERS } from "../../data/senders";
import { Attachment, Message, ThreadReply, Sender } from "../../models/types";
import { sanitizeHtml, renderTextWithLinksHtml } from "../../services/helpers";
import { FilePreviewService } from "../../services/file-preview.service";
import type { LiveMessage } from "../../services/adapters";

import { IconComponent } from "../icon/icon.component";
import { AvatarComponent } from "../avatar/avatar.component";
import { FileTypeIconComponent } from "../file-type-icon/file-type-icon.component";
import { ResizeHandleComponent } from "../resize-handle/resize-handle.component";
import { ComposerComponent } from "../composer/composer.component";
import { RenderTextPipe, SafeHtmlPipe } from "../../pipes/render-text.pipe";

interface ThreadReplyContext {
  senderId: string;
  senderName: string;
  text: string;
}

interface DisplayReply extends ThreadReply {
  html?: string;
  quoted?: { sender: string; senderId?: string; text: string };
}

/**
 * Thread side panel — parent message at top, indented replies below,
 * quick-reply chips, and a full Composer at the bottom.
 * Mirrors React `<ThreadPanel>` 1:1.
 *
 * State held locally: list of replies (rendered live, not pushed back into
 * the global state — matches React behavior), the quote-reply target, and
 * a per-thread draft.
 */
@Component({
  selector: "app-thread-panel",
  standalone: true,
  imports: [
    CommonModule, IconComponent, AvatarComponent, FileTypeIconComponent,
    ResizeHandleComponent, ComposerComponent, RenderTextPipe, SafeHtmlPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block shrink-0 h-full" },
  templateUrl: "./thread-panel.component.html",
  styleUrl: "./thread-panel.component.css",
})
export class ThreadPanelComponent implements OnChanges {
  state    = inject(ChatStateService);
  preview  = inject(FilePreviewService);
  private readonly liveData = inject(LiveDataService, { optional: true });

  /** Open the FilePreviewOverlay with the parent message's attachments
   *  as siblings, so the user can flip through all of them. */
  openPreview(att: Attachment, siblings: Attachment[]): void {
    this.preview.open(att, siblings);
  }

  @Input({ required: true }) parent!: Message;
  @Input() fullscreen = false;
  @Input() width = 380;
  @Output() closed = new EventEmitter<void>();
  @Output() startResize = new EventEmitter<MouseEvent>();

  closing = signal(false);
  replies = signal<DisplayReply[]>([]);
  threadReplyingTo = signal<ThreadReplyContext | null>(null);
  threadDraft = signal("");

  readonly QUICK_REPLIES = ["Okay, sure", "Sure, will do", "Okay, done"];

  ngOnChanges(c: SimpleChanges): void {
    if ("parent" in c && this.parent) {
      this.replies.set([...((this.parent.thread?.replies as DisplayReply[]) || [])]);
      this.threadReplyingTo.set(null);
      this.threadDraft.set("");

      // Live messages have thread_meta.reply_count but no inline replies —
      // the bubble's adapter sets thread.replies to []. Fetch them on
      // demand from chat-service so the panel actually shows them.
      const live = (this.parent as LiveMessage).api;
      const needsFetch = live && this.parent.thread && this.parent.thread.count > 0
        && (this.replies().length === 0);
      if (needsFetch && this.liveData) {
        void this.liveData.loadThread(this.parent.id).then((msgs) => {
          // Skip the parent message if Go's listThread includes it (some
          // implementations return parent + replies; ours returns replies only,
          // but we filter defensively).
          const onlyReplies = msgs.filter((m) => m.id !== this.parent.id);
          this.replies.set(onlyReplies.map(liveToDisplayReply));
        });
      }
    }
  }

  get parentSender(): Sender | null {
    return this.parent?.sender ? (SENDERS[this.parent.sender] || null) : null;
  }

  senderFor(id: string): Sender | null {
    return SENDERS[id] || null;
  }

  get asideClass(): string {
    // Fullscreen mode covers the viewport via fixed positioning. In dock mode
    // we need explicit h-full so the inner flex layout (header / scrollable
    // replies / composer) actually fills the host height.
    //
    // `relative` is only included in dock mode — it's needed there to anchor
    // the absolutely-positioned resize handle. On fullscreen mobile, having
    // `relative` would override `fixed` (Tailwind's CSS source orders
    // `relative` after `fixed`, so the later rule wins) — that drops the
    // panel out of fullscreen and into normal flow, leaving content at the
    // top and a blank gap below the composer.
    const fs = this.fullscreen ? "fixed inset-0 z-50" : "shrink-0 h-full relative";
    const anim = this.closing() ? "side-panel-out" : "side-panel-in";
    return `group/threadpanel ${fs} flex flex-col border-l border-gray-200 bg-white overflow-hidden ${anim}`;
  }

  replyBubbleClass(r: DisplayReply): string {
    const tone = r.sender === "me" ? "bg-blue-100" : "bg-gray-100";
    return `text-[14px] mt-1 rounded-2xl rounded-tl-sm px-3 py-1.5 inline-block max-w-full break-words ${tone}`;
  }

  startQuoteReply(senderId?: string, text?: string, html?: string): void {
    if (!senderId) return;
    const senderObj = SENDERS[senderId] || ({ name: "Unknown" } as Sender);
    const excerpt = html
      ? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : (text || "");
    this.threadReplyingTo.set({
      senderId,
      senderName: senderObj.name,
      text: excerpt.slice(0, 200),
    });
  }

  sendReply(payload: string | { html: string; text: string }): void {
    let html = "", plain = "";
    if (typeof payload === "string") {
      plain = payload.trim(); html = plain;
    } else {
      html = payload.html || "";
      plain = (payload.text || "").trim();
    }
    if (!plain) return;
    const stripped = html.replace(/<[^>]+>/g, "").trim();
    const useHtml = html && (stripped !== plain
      || /<(strong|em|u|s|code|ul|ol|li|table|h[1-3]|blockquote|span|a)\b/i.test(html));
    const target = this.threadReplyingTo();

    // Live mode: persist via the chat-service so the reply survives a
    // refresh and other channel members see it via FCM. Reads the parent
    // message's API doc for channel_id (the panel's `parent` is whatever
    // was passed in; we trust LiveMessage's channelId).
    const liveParent = (this.parent as LiveMessage).api;
    if (this.liveData && liveParent) {
      // Optimistic local append so the bubble appears instantly while the
      // POST is in flight. The full message gets refetched from
      // listThread on the next openThread; the local entry is the same
      // shape, just synthetic.
      const optimistic: DisplayReply = { sender: "me", time: "now", text: "" };
      if (useHtml) optimistic.html = html;
      else optimistic.text = plain;
      if (target) optimistic.quoted = {
        sender: target.senderName,
        senderId: target.senderId,
        text: target.text,
      };
      this.replies.set([...this.replies(), optimistic]);
      this.threadDraft.set("");
      this.threadReplyingTo.set(null);

      void this.liveData.sendNormal(liveParent.channel_id, {
        content: useHtml ? html : plain,
        content_format: useHtml ? "markdown" : "text",
        thread_root_id: liveParent.id,
        // Carry the in-thread reply target as a quoted parent so the
        // reply bubble's "Replying to X" pill renders for other clients.
        quoted: target ? {
          message_id: this.parent.id,
          sender: target.senderId,
          snippet: (target.text || "").slice(0, 200),
        } : undefined,
        client_message_id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      }).then((persisted) => {
        // Nudge the parent's thread_meta count + last_reply_at — the
        // parent bubble's "X replies" chip in the main feed will repaint
        // on next refresh. Avoiding a heavy refetch here.
        if (persisted && this.parent.thread) {
          this.parent.thread.count = (this.parent.thread.count || 0) + 1;
          this.parent.thread.lastTime = persisted.time;
        }
      });
      return;
    }

    // Mock-data fallback: stays local (the legacy demo behavior).
    const newReply: DisplayReply = { sender: "me", time: "now", text: "" };
    if (useHtml) {
      newReply.html = html;
      newReply.text = "";
    } else {
      newReply.text = plain;
    }
    if (target) {
      newReply.quoted = {
        sender: target.senderName,
        senderId: target.senderId,
        text: target.text,
      };
    }
    this.replies.set([...this.replies(), newReply]);
    this.threadDraft.set("");
    this.threadReplyingTo.set(null);
  }

  onSend(e: { html: string; text: string }): void { this.sendReply(e); }

  handleClose(): void {
    if (this.closing()) return;
    this.closing.set(true);
    setTimeout(() => this.closed.emit(), 180);
  }
}

/** Convert a fetched LiveMessage reply into the DisplayReply shape the
 *  panel template expects. The legacy ThreadReply only carries sender id,
 *  text, time, optional reactions — we map from the API payload. */
function liveToDisplayReply(m: LiveMessage): DisplayReply {
  return {
    sender: m.sender ?? "",
    text: m.text ?? "",
    time: m.time ?? "",
    reactions: m.reactions,
    html: m.html,
  };
}
