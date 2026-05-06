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
  templateUrl: "./mode-badge.component.html",
  styleUrl: "./mode-badge.component.css",
})
export class ModeBadgeComponent {
  @Input() mode: PortalMode = "ai_only";
  @Input() compact = false;
  get m() { return MODE_INFO[this.mode] || MODE_INFO.ai_only; }
}
