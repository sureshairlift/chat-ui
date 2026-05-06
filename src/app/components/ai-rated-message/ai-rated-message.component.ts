import { ChangeDetectionStrategy, Component, Input, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Message } from "../../models/types";
import { IconComponent } from "../icon/icon.component";
import { ToastService } from "../../services/toast.service";

/**
 * AI rated message — long text with thumbs feedback, copy, regenerate.
 * Mirrors React `<AIRatedMessage>`.
 */
@Component({
  selector: "app-ai-rated-message",
  standalone: true,
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./ai-rated-message.component.html",
  styleUrl: "./ai-rated-message.component.css",
})
export class AIRatedMessageComponent {
  @Input() msg!: Message;
  feedback = signal<"up" | "down" | null>(null);
  copied = signal(false);

  constructor(private toast: ToastService) {}

  setFeedback(v: "up" | "down"): void {
    this.feedback.set(this.feedback() === v ? null : v);
  }

  handleCopy(): void {
    const text = this.msg.text || "";
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }
}
