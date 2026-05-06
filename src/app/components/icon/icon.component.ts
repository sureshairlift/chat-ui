import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";

/**
 * <app-icon name="..." [size]="..." [strokeWidth]="..." class="...">
 *
 * Inlined SVG library covering every lucide-react icon used by the React file.
 * Each icon is a faithful re-render of the lucide source so visual parity is
 * maintained. The component sets `width`/`height` directly so callers can
 * combine with Tailwind utility classes for color via `currentColor`.
 *
 * Names match the lucide-react import names (PascalCase converted to kebab-case
 * for templates, and accepted in lowercase for convenience):
 *   MessageSquare → "message-square"
 *   ChevronRight  → "chevron-right"
 *   etc.
 */
@Component({
  selector: "app-icon",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./icon.component.html",
  styleUrl: "./icon.component.css",
})
export class IconComponent {
  @Input() name!: string;
  @Input() size: number = 18;
  @Input() strokeWidth: number = 2;
  @Input() fill: string = "none";

  // Helper for templates — normalizes name to kebab-case lower
  get key(): string {
    return (this.name || "").toLowerCase().replace(/\s+/g, "-");
  }
}
