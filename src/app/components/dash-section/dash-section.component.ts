import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";

/** Dashboard section wrapper — title row + count chip + content slot. */
@Component({
  selector: "app-dash-section",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section>
      <div class="flex items-baseline justify-between mb-2 px-1">
        <div class="flex items-baseline gap-2 min-w-0">
          <h2 class="text-[14px] font-semibold text-gray-900 truncate">{{ title }}</h2>
          <span
            *ngIf="count !== undefined && count !== null && count > 0 && accent"
            [class]="'text-[11px] font-semibold px-1.5 py-0.5 rounded ' + accentColor"
          >{{ count }}</span>
          <span *ngIf="subtitle" class="text-[12px] text-gray-500 truncate">· {{ subtitle }}</span>
        </div>
        <ng-content select="[action]"></ng-content>
      </div>
      <ng-content></ng-content>
    </section>
  `,
})
export class DashSectionComponent {
  @Input() title = "";
  @Input() count?: number | null;
  @Input() accent: "red" | "amber" | "blue" | "purple" | "emerald" | undefined;
  @Input() subtitle = "";

  get accentColor(): string {
    const map: Record<string, string> = {
      red:     "text-red-700 bg-red-50",
      amber:   "text-amber-700 bg-amber-50",
      blue:    "text-blue-700 bg-blue-50",
      purple:  "text-purple-700 bg-purple-50",
      emerald: "text-emerald-700 bg-emerald-50",
    };
    return map[this.accent || "blue"] || map["blue"];
  }
}
