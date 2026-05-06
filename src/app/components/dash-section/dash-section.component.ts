import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";

/** Dashboard section wrapper — title row + count chip + content slot. */
@Component({
  selector: "app-dash-section",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./dash-section.component.html",
  styleUrl: "./dash-section.component.css",
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
