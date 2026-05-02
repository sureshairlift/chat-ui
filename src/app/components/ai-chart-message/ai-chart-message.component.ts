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
  template: `
    <div class="rounded-2xl bg-white border border-gray-200 max-w-md w-full overflow-hidden shadow-sm">
      <div class="px-4 pt-4 pb-2">
        <div class="flex items-center gap-2 mb-0.5">
          <app-icon name="bar-chart-3" [size]="14" class="text-blue-600"></app-icon>
          <span class="text-[14px] font-semibold text-gray-900">{{ msg.chartTitle }}</span>
        </div>
        <div class="text-[11px] text-gray-500">{{ msg.chartSubtitle }}</div>
      </div>
      <div class="px-4 py-3 space-y-2.5">
        <div *ngFor="let d of msg.chartData">
          <div class="flex items-center justify-between text-[12px] mb-1">
            <span class="text-gray-700 font-medium">{{ d.label }}</span>
            <span class="text-gray-900 font-semibold tabular-nums">{{ fmt(d.value) }}</span>
          </div>
          <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all"
              [style.width.%]="(d.value / max) * 100"
              [style.backgroundColor]="d.color"
            ></div>
          </div>
        </div>
      </div>
      <div *ngIf="msg.summary" class="px-4 py-3 border-t border-gray-100 bg-gray-50/50">
        <div class="flex gap-2 text-[12px] text-gray-700 leading-relaxed">
          <app-icon name="sparkles" [size]="12" class="text-purple-600 mt-0.5 shrink-0"></app-icon>
          <span>{{ msg.summary }}</span>
        </div>
      </div>
    </div>
  `,
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
