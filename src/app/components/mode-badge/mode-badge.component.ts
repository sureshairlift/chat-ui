import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { PortalMode } from "../../models/types";
import { MODE_INFO } from "../../data/mode-info";

/** Portal session mode pill (AI only / Co-pilot / Human only / etc.) */
@Component({
  selector: "app-mode-badge",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span [class]="'inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 ' + m.bg + ' ' + m.text">
      <span [class]="'h-1.5 w-1.5 rounded-full ' + m.dot"></span>
      {{ m.label }}
    </span>
  `,
})
export class ModeBadgeComponent {
  @Input() mode: PortalMode = "ai_only";
  @Input() compact = false;
  get m() { return MODE_INFO[this.mode] || MODE_INFO.ai_only; }
}
