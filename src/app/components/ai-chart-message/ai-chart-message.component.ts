import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Message } from "../../models/types";
import { IconComponent } from "../icon/icon.component";

/**
 * AI message that renders a horizontal bar chart card.
 * Mirrors React `<AIChartMessage>`.
 */
@Component({
  selector: "app-ai-chart-message",
  standalone: true,
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./ai-chart-message.component.html",
  styleUrl: "./ai-chart-message.component.css",
})
export class AIChartMessageComponent {
  @Input() msg!: Message;

  get max(): number {
    return Math.max(...(this.msg.chartData || []).map((d) => d.value));
  }
  fmt(n: number): string {
    return "$" + (n >= 1000 ? (n / 1000).toFixed(0) + "K" : n);
  }
}
