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
  templateUrl: "./file-type-icon.component.html",
  styleUrl: "./file-type-icon.component.css",
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
