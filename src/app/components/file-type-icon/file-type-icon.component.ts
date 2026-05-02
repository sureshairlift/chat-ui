import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FILE_TYPE_INFO } from "../../data/file-type-info";

/**
 * SVG document-shape icon with folded corner + extension label baked in.
 * Used by FileAttachment. Self-contained — no external dependencies.
 * Matches React `<FileTypeIcon>` exactly.
 */
@Component({
  selector: "app-file-type-icon",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      viewBox="0 0 36 44"
      [attr.width]="width"
      [attr.height]="size"
      class="shrink-0"
      xmlns="http://www.w3.org/2000/svg"
    >
      <!-- Document body — rounded rect with notched top-right -->
      <path
        d="M4 0 H24 L36 12 V40 Q36 44 32 44 H4 Q0 44 0 40 V4 Q0 0 4 0 Z"
        [attr.fill]="info.color"
      />
      <!-- Folded-corner highlight -->
      <path
        d="M24 0 L36 12 H28 Q24 12 24 8 V0 Z"
        fill="white"
        fill-opacity="0.25"
      />
      <!-- "Page lines" hint -->
      <rect x="6" y="16" width="14" height="1.2" rx="0.6" fill="white" fill-opacity="0.35" />
      <rect x="6" y="20" width="10" height="1.2" rx="0.6" fill="white" fill-opacity="0.35" />
      <!-- Extension label -->
      <text
        x="18"
        y="34"
        text-anchor="middle"
        [attr.font-size]="fontSize"
        font-weight="700"
        fill="white"
        font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        letter-spacing="0.3"
      >{{ label }}</text>
    </svg>
  `,
})
export class FileTypeIconComponent {
  @Input() ext: string = "";
  @Input() size: number = 40;

  get info() { return FILE_TYPE_INFO[this.ext?.toLowerCase()] || FILE_TYPE_INFO["default"]; }
  get label(): string {
    const l = this.info.label;
    return l.length > 5 ? l.slice(0, 5) : l;
  }
  get fontSize(): number {
    const len = this.label.length;
    if (len >= 5) return 5.5;
    if (len === 4) return 6.5;
    if (len === 3) return 8;
    return 9.5;
  }
  get width(): number { return this.size * (36 / 44); }
}
