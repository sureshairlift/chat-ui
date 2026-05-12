import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { EmojiComponent } from "../emoji/emoji.component";
import { IconComponent } from "../icon/icon.component";
import { REACTION_QUICK_PICK, EMOJI_CATALOG, emojiToUnicode } from "../../data/emoji-catalog";

/** Quick-reaction picker shown above the message bubble. Emits the
 *  Unicode codepoint on click so the persistence layer keeps storing
 *  emoji as portable text — the Noto image is just a render choice.
 *
 *  Two modes:
 *   - Collapsed (default): 6 curated quick-pick emojis in a horizontal
 *     pill, with a trailing "+" button.
 *   - Expanded: clicking "+" reveals a grid of all 150+ catalog emojis
 *     plus a search box. Same emit semantics — picking an emoji fires
 *     `react` and the bubble's container handles dismissal. */
@Component({
  selector: "app-reaction-bar",
  standalone: true,
  imports: [CommonModule, FormsModule, EmojiComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./reaction-bar.component.html",
  styleUrl: "./reaction-bar.component.css",
})
export class ReactionBarComponent {
  @Input() msgId!: string;
  @Output() react = new EventEmitter<{ msgId: string; emoji: string }>();
  readonly QUICK_PICK = REACTION_QUICK_PICK;
  readonly CATALOG = EMOJI_CATALOG;

  expanded = signal(false);
  search = signal("");

  filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.CATALOG;
    return this.CATALOG.filter(
      (e) => e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q),
    );
  });

  toggleExpand(): void {
    this.expanded.update((v) => !v);
    if (!this.expanded()) this.search.set("");
  }

  onReact(code: string): void {
    this.react.emit({ msgId: this.msgId, emoji: emojiToUnicode(code) });
  }
}
