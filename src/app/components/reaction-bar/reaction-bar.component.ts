import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";

/** Quick-reaction picker shown above the message bubble. */
@Component({
  selector: "app-reaction-bar",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./reaction-bar.component.html",
  styleUrl: "./reaction-bar.component.css",
})
export class ReactionBarComponent {
  @Input() msgId!: string;
  @Output() react = new EventEmitter<{ msgId: string; emoji: string }>();
  readonly EMOJIS = ["👍", "😂", "🎉", "❤️", "😢", "😮"];
}
