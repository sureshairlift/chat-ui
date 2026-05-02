import {
  ChangeDetectionStrategy, Component, EventEmitter, HostListener, Output,
  computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ChatStateService } from "../../services/chat-state.service";
import { IconComponent } from "../icon/icon.component";

interface Preset {
  emoji: string;
  text: string;
  /** Auto-clear duration in minutes (null = "Don't clear"). */
  clearMins: number | null;
}

interface ClearOption { label: string; mins: number | null; }

/**
 * Slack/GChat-style "Set status" modal. Lets the user pick (or type) an
 * emoji, free-text status, and an auto-clear duration.
 *
 * Presets jump-start common statuses (lunch, focusing, vacation, etc.).
 * Auto-clear stores an absolute timestamp on the status object; the
 * service's setInterval drops it once the deadline passes.
 */
@Component({
  selector: "app-status-editor",
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./status-editor.component.html",
})
export class StatusEditorComponent {
  state = inject(ChatStateService);

  @Output() closed = new EventEmitter<void>();

  /** Cycling pool for the emoji "click to change" affordance. */
  private readonly EMOJI_POOL = [
    "😀", "🙂", "😎", "🤔", "🥳", "😴", "🤒", "🌴", "💻",
    "🎯", "📞", "🍕", "☕", "🏠", "🚀", "🔥", "📅", "✅",
  ];

  emoji     = signal<string>(this.state.userStatus()?.emoji ?? "💻");
  text      = signal<string>(this.state.userStatus()?.text ?? "");
  /** null = "Don't clear" — status sticks until manually cleared. */
  clearMins = signal<number | null>(this.computeInitialClearMins());

  readonly presets: Preset[] = [
    { emoji: "💻", text: "Working from home", clearMins: 8 * 60 },
    { emoji: "🍽️", text: "Out for lunch",     clearMins: 60 },
    { emoji: "🎯", text: "In a meeting",      clearMins: 60 },
    { emoji: "📞", text: "On a call",         clearMins: 30 },
    { emoji: "🌴", text: "On vacation",       clearMins: null },
    { emoji: "🤒", text: "Out sick",          clearMins: 24 * 60 },
    { emoji: "🤔", text: "Focusing",          clearMins: 90 },
    { emoji: "☕", text: "Coffee break",      clearMins: 15 },
  ];

  readonly clearOptions: ClearOption[] = [
    { label: "Don't clear", mins: null },
    { label: "30 minutes",  mins: 30 },
    { label: "1 hour",      mins: 60 },
    { label: "4 hours",     mins: 4 * 60 },
    { label: "Today",       mins: 8 * 60 },
    { label: "This week",   mins: 7 * 24 * 60 },
  ];

  canSave = computed(() => this.text().trim().length > 0);

  /** Recompute remaining minutes from the persisted absolute clearAt so
   *  re-opening the modal shows roughly the same duration the user picked. */
  private computeInitialClearMins(): number | null {
    const s = this.state.userStatus();
    if (!s || s.clearAt == null) return null;
    const remainingMs = s.clearAt - Date.now();
    if (remainingMs <= 0) return null;
    const mins = Math.round(remainingMs / 60_000);
    // Snap to one of the option buckets so the chip highlight matches.
    const buckets = [30, 60, 240, 480, 7 * 24 * 60];
    for (const b of buckets) if (mins <= b) return b;
    return null;
  }

  cycleEmoji(): void {
    const i = this.EMOJI_POOL.indexOf(this.emoji());
    const next = this.EMOJI_POOL[(i + 1) % this.EMOJI_POOL.length];
    this.emoji.set(next);
  }

  applyPreset(p: Preset): void {
    this.emoji.set(p.emoji);
    this.text.set(p.text);
    this.clearMins.set(p.clearMins);
  }

  clearChipClass(mins: number | null): string {
    const active = this.clearMins() === mins;
    const base = "text-[12px] px-3 py-1 rounded-full transition";
    return active
      ? `${base} bg-blue-600 text-white`
      : `${base} bg-gray-50 hover:bg-gray-100 ring-1 ring-gray-200 text-gray-700`;
  }

  saveBtnClass(): string {
    const base = "text-[13px] font-medium px-3 py-1.5 rounded transition";
    return this.canSave()
      ? `${base} bg-blue-600 text-white hover:bg-blue-700`
      : `${base} bg-gray-100 text-gray-400 cursor-not-allowed`;
  }

  save(): void {
    if (!this.canSave()) return;
    const mins = this.clearMins();
    const clearAt = mins == null ? null : Date.now() + mins * 60_000;
    this.state.setUserStatus({
      emoji: this.emoji(),
      text: this.text().trim(),
      clearAt,
    });
    this.closed.emit();
  }

  clearStatus(): void {
    this.state.clearUserStatus();
    this.closed.emit();
  }

  @HostListener("document:keydown.escape") onEsc(): void { this.closed.emit(); }
  @HostListener("document:keydown.enter") onEnter(): void {
    if (this.canSave()) this.save();
  }
}
