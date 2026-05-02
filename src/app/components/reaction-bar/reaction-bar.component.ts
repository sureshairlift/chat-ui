import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";

/** Quick-reaction picker shown above the message bubble. */
@Component({
  selector: "app-reaction-bar",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center gap-0.5 bg-white border border-gray-200 rounded-full px-1 py-0.5 shadow-md">
      <button
        *ngFor="let emoji of EMOJIS"
        (click)="react.emit({ msgId, emoji })"
        class="text-[16px] hover:bg-gray-100 rounded-full w-7 h-7 flex items-center justify-center"
      >{{ emoji }}</button>
    </div>
  `,
})
export class ReactionBarComponent {
  @Input() msgId!: string;
  @Output() react = new EventEmitter<{ msgId: string; emoji: string }>();
  readonly EMOJIS = ["👍", "😂", "🎉", "❤️", "😢", "😮"];
}
