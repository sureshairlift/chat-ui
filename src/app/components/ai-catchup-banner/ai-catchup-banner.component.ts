import { ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { IconComponent } from "../icon/icon.component";

/**
 * "Catch me up" banner shown inline at the top of an unread conversation.
 * If the AI has prepared a summary for this conv (via AI_UNREAD_SUMMARIES),
 * the user gets a one-tap recap with the actions the AI thinks they should
 * take next — saves them having to scroll back through dozens of messages.
 *
 * Visibility rules:
 *   - The conv must have an entry in AI_UNREAD_SUMMARIES
 *   - The conv must be unread (no summary banner needed if you've already
 *     caught up)
 *   - The user can dismiss the banner — that state is per-tab (signal),
 *     not persisted; refreshing brings it back so the user can re-check.
 */
@Component({
  selector: "app-ai-catchup-banner",
  standalone: true,
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./ai-catchup-banner.component.html",
  styleUrl: "./ai-catchup-banner.component.css",
})
export class AICatchupBannerComponent implements OnChanges {
  state = inject(ChatStateService);

  @Input({ required: true }) convId!: string;

  /** Per-instance dismissal — cleared on refresh so the banner returns. */
  private dismissed = signal(false);

  /** Backend-loaded summary (live mode). Populated by `hydrate` when
   *  the conv is unread. Stays null in offline/demo mode → banner hides. */
  private serverSummary = signal<{ severity: string; summary: string; actions: string[] } | null>(null);

  /** True while the AI is producing the summary. Used to render a
   *  pulsing skeleton in the banner instead of empty content. */
  loading = signal(false);

  summary = computed(() => this.serverSummary());

  /** Show whenever a summary is available (or being loaded) and the
   *  user hasn't dismissed it. The "must be unread" gate was removed
   *  on purpose — users want a recap on read conversations too, e.g.
   *  re-opening a chat from yesterday. The summary is cached at
   *  chat-state.aiSummaryByConv so flipping between convs doesn't
   *  hammer the LLM. */
  visible = computed(() => {
    if (this.dismissed()) return false;
    return !!this.summary() || this.loading();
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["convId"]) {
      this.dismissed.set(false);
      this.serverSummary.set(null);
      void this.hydrate();
    }
  }

  /** Pull the AI catch-up summary for the active conv. Routes through
   *  chat-state's cache so flipping between convs doesn't refire the
   *  LLM call. The cache is invalidated automatically when a new
   *  message.created FCM payload arrives for this channel. */
  private async hydrate(): Promise<void> {
    if (!this.state.live()) return;
    this.loading.set(true);
    try {
      const res = await this.state.loadAISummaryLive(this.convId);
      if (!res || !res.summary) {
        this.serverSummary.set(null);
        return;
      }
      this.serverSummary.set({
        severity: this.severityFromCount(res.messageCount ?? 0),
        summary: res.summary,
        actions: extractActionsFromMarkdown(res.summary),
      });
    } finally {
      this.loading.set(false);
    }
  }

  /** Heuristic — purely cosmetic; the LLM doesn't return severity. */
  private severityFromCount(n: number): string {
    if (n >= 25) return "high";
    if (n >= 10) return "medium";
    return "low";
  }

  severityClass = computed(() => {
    const sev = this.summary()?.severity;
    const base = "text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded";
    if (sev === "high")   return `${base} bg-red-100 text-red-700`;
    if (sev === "medium") return `${base} bg-amber-100 text-amber-700`;
    return `${base} bg-gray-100 text-gray-600`;
  });

  markRead(): void {
    if (this.state.live()) {
      void this.state.markConvReadLive(this.convId);
    } else {
      this.state.markConvRead(this.convId);
    }
  }

  dismiss(): void {
    this.dismissed.set(true);
  }
}

/** Pull short markdown bullets out of the LLM's summary string and
 *  surface them as action chips beside the headline. The first bullet
 *  is treated as the headline; the rest become chips. */
function extractActionsFromMarkdown(md: string): string[] {
  const lines = md.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const bullets = lines
    .filter((l) => l.startsWith("- ") || l.startsWith("* "))
    .map((l) => l.replace(/^[-*]\s+/, ""));
  // First bullet stays in `summary` as the main line; remainders become chips.
  return bullets.slice(1, 4);
}
