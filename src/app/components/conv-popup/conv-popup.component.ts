import {
  AfterViewChecked, AfterViewInit, ChangeDetectionStrategy, Component,
  ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild,
  computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { BreakpointService } from "../../services/breakpoint.service";
import { Conversation, Message } from "../../models/types";
import { SENDERS } from "../../data/senders";
import { getDayKey, formatDayLabel } from "../../services/helpers";

import { AvatarComponent } from "../avatar/avatar.component";
import { IconComponent } from "../icon/icon.component";
import { MessageBubbleComponent } from "../message-bubble/message-bubble.component";
import { ComposerComponent } from "../composer/composer.component";

interface DayGroup { key: string; label: string; messages: Message[]; }

/**
 * Floating Gmail/GChat-style conversation popup.
 *
 * Lives at the bottom-right of the viewport, positioned in a stacking
 * container by AppComponent. Each popup is bound to a single conversation
 * and reuses MessageBubble + Composer to keep behavior consistent with
 * the main pane.
 *
 * Two display states:
 *   - **Expanded** (default) — full card with header, scrollable messages,
 *     and composer. Width 360px, height 520px.
 *   - **Minimized** — just the title bar visible. Click to expand.
 *
 * Header actions:
 *   - Minimize / restore (chevron-down / chevron-up)
 *   - Maximize → closes the popup and switches the main window to this
 *     conversation
 *   - Close (X) — drops the popup
 */
@Component({
  selector: "app-conv-popup",
  standalone: true,
  imports: [
    CommonModule, AvatarComponent, IconComponent,
    MessageBubbleComponent, ComposerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./conv-popup.component.html",
  styles: [`
    :host { display: block; pointer-events: auto; }
  `],
})
export class ConvPopupComponent implements AfterViewInit, AfterViewChecked, OnChanges, OnDestroy {
  state = inject(ChatStateService);
  bp    = inject(BreakpointService);

  @Input({ required: true }) convId!: string;
  @Input() minimized = false;

  @ViewChild("scroll") scrollRef?: ElementRef<HTMLElement>;
  @ViewChild("loadEarlierSentinel") loadEarlierSentinel?: ElementRef<HTMLElement>;
  private earlierObserver?: IntersectionObserver;
  private observedSentinelEl: HTMLElement | null = null;
  private isLoadingEarlier = false;

  /** Reactive lookup signals. They re-evaluate any time state changes. */
  conv: Conversation | null = null;
  messages = computed<Message[]>(() => {
    return this.state.messagesByConv()[this.convId] ?? [];
  });

  /** Day-grouped messages, mirrors what AppComponent does for the main pane.
   *  Windowed: only the last `msgWindowSize` messages render. The "Load
   *  earlier" sentinel below expands the window. */
  dayGroups = computed<DayGroup[]>(() => {
    const all = this.messages();
    const win = this.msgWindowSize();
    const slice = all.length <= win ? all : all.slice(all.length - win);
    const groups: DayGroup[] = [];
    let lastKey: string | null = null;
    for (const m of slice) {
      const iso = (m as { api?: { created_on?: string } })?.api?.created_on;
      const key = getDayKey(m.time, iso);
      if (key !== lastKey) {
        groups.push({ key, label: formatDayLabel(key), messages: [] });
        lastKey = key;
      }
      groups[groups.length - 1].messages.push(m);
    }
    return groups;
  });

  /** Windowed rendering — popup uses a smaller initial window since it's
   *  a smaller surface. */
  private static readonly POPUP_INITIAL_WINDOW = 30;
  private static readonly POPUP_PAGE_SIZE = 30;
  msgWindowSize = signal<number>(ConvPopupComponent.POPUP_INITIAL_WINDOW);
  hasMoreEarlier = computed<boolean>(() => this.messages().length > this.msgWindowSize());
  hiddenEarlierCount = computed<number>(() =>
    Math.max(0, this.messages().length - this.msgWindowSize()),
  );

  /** Per-conversation draft from the shared drafts map — same source as the
   *  main composer, so a draft typed in the popup is preserved if the user
   *  re-opens the same conv in the main pane (and vice-versa). */
  draft = computed<string>(() => this.state.drafts()[this.convId]?.html ?? "");

  /** Subtitle text shown under the name in the header (e.g. "10 members"). */
  subtitle = computed<string>(() => {
    const c = this.conv;
    if (!c) return "";
    if (c.type === "space") return `${c.members ?? ""} members`;
    if (c.type === "external-group") return `${c.members ?? ""} members · ${c.org ?? ""}`;
    if (c.type === "external") return c.org ?? "Customer";
    if (c.isAI) return "Airlift Intelligence";
    if (c.presence === "active") return "Active now";
    return "";
  });

  /** Sub-header line (member count or org / type info). */
  metaLine = computed<string>(() => {
    const c = this.conv;
    if (!c) return "";
    if (c.type === "space") return `${c.members ?? ""} members${c.org ? " · " + c.org : ""}`;
    if (c.type === "external-group") return `${c.members ?? ""} members · ${c.org ?? ""}`;
    if (c.type === "external") return `Customer · ${c.org ?? ""}`;
    return "";
  });

  /** Popup width — fills (almost) the viewport on mobile so the chat is
   *  legible, sits at the desktop dimensions otherwise. Returns a string
   *  with unit so the template's `[style.width]` binding accepts it. */
  popupWidth(): string {
    if (this.bp.isMobile()) {
      return this.minimized ? "calc(100vw - 16px)" : "calc(100vw - 16px)";
    }
    return this.minimized ? "280px" : "360px";
  }

  /** Popup height — minimized is always a thin pill; expanded uses 75vh
   *  on mobile (leaves room for the on-screen keyboard) and a fixed 520px
   *  on desktop. */
  popupHeight(): string {
    if (this.minimized) return "44px";
    return this.bp.isMobile() ? "75vh" : "520px";
  }

  rootClass(): string {
    return [
      "flex flex-col bg-white rounded-xl shadow-2xl ring-1 ring-gray-200",
      "overflow-hidden transition-all duration-150",
      this.minimized ? "" : "side-panel-in",
    ].join(" ");
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Refresh the conv pointer whenever convId changes.
    this.conv = this.state.conversations().find((c) => c.id === this.convId) ?? null;
    // Reset the windowed render whenever the popup is rebound to a different
    // conv — without this the new conv would inherit the previous one's
    // expanded window size.
    if (changes["convId"]) {
      this.msgWindowSize.set(ConvPopupComponent.POPUP_INITIAL_WINDOW);
    }
  }

  ngAfterViewInit(): void {
    // Scroll to bottom on open. We do this in a microtask so the messages
    // ng-for has actually painted.
    setTimeout(() => this.scrollToBottom(), 0);
  }

  ngAfterViewChecked(): void {
    const el = this.loadEarlierSentinel?.nativeElement ?? null;
    if (el === this.observedSentinelEl) return;
    this.earlierObserver?.disconnect();
    this.earlierObserver = undefined;
    this.observedSentinelEl = el;
    if (!el || typeof IntersectionObserver === "undefined") return;
    this.earlierObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) this.loadEarlier();
        }
      },
      { root: this.scrollRef?.nativeElement ?? null, rootMargin: "120px 0px 0px 0px" },
    );
    this.earlierObserver.observe(el);
  }

  ngOnDestroy(): void {
    this.earlierObserver?.disconnect();
  }

  /** Expand the window by one page, preserving scroll offset so the user's
   *  viewport stays anchored to the same content rather than jumping. */
  loadEarlier(): void {
    if (this.isLoadingEarlier) return;
    if (!this.hasMoreEarlier()) return;
    this.isLoadingEarlier = true;
    const el = this.scrollRef?.nativeElement;
    const prevHeight = el?.scrollHeight ?? 0;
    const prevTop    = el?.scrollTop ?? 0;
    this.msgWindowSize.update((n) => n + ConvPopupComponent.POPUP_PAGE_SIZE);
    requestAnimationFrame(() => {
      if (el) {
        const delta = el.scrollHeight - prevHeight;
        el.scrollTop = prevTop + delta;
      }
      this.isLoadingEarlier = false;
    });
  }

  private scrollToBottom(): void {
    const el = this.scrollRef?.nativeElement;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  /* ============== Actions ============== */

  onHeaderClick(): void {
    if (this.minimized) this.toggleMinimize();
  }
  toggleMinimize(): void {
    this.state.toggleConvPopupMinimized(this.convId);
  }
  maximize(): void {
    this.state.restoreConvPopupToMain(this.convId);
  }
  close(): void {
    this.state.closeConvPopup(this.convId);
  }

  /* ============== Composer ============== */

  onSend(payload: { html: string; text: string }): void {
    if (!this.conv) return;
    const stripped = payload.html.replace(/<[^>]+>/g, "").trim();
    const isRich = stripped !== payload.text
      || /<(strong|em|u|s|code|ul|ol|li|table|h[1-3]|blockquote|span|a)\b/i.test(payload.html);

    // Live mode: round-trip through chat-service so the message lands
    // in the channel for every member, FCM fans out, and the popup
    // shares persistence with the main pane (no fork between the two
    // surfaces). Mock fallback below covers the offline demo path.
    if (this.state.live()) {
      void this.state.sendMessageLive(this.convId, {
        content: isRich ? payload.html : payload.text,
        content_format: isRich ? "markdown" : "text",
        client_message_id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });
      this.state.clearDraft(this.convId);
      setTimeout(() => this.scrollToBottom(), 0);
      return;
    }

    const id = `m-${Date.now()}`;
    const msg: Message = {
      id, sender: "me", time: "now",
      ...(isRich ? { html: payload.html } : { text: payload.text }),
    };
    this.state.appendMessage(this.convId, msg);
    this.state.clearDraft(this.convId);
    setTimeout(() => this.scrollToBottom(), 0);
  }

  onDraftChange(html: string): void {
    if (!html) this.state.clearDraft(this.convId);
    else this.state.setDraft(this.convId, { text: html.replace(/<[^>]+>/g, " "), html });
  }
}
