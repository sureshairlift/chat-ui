import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";

/**
 * Toolbar button used by the composer's formatting bar.
 * Mirrors React `<ToolbarBtn>`. Uses mousedown preventDefault so the editor
 * keeps focus while a button is clicked.
 */
@Component({
  selector: "app-toolbar-btn",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./toolbar-btn.component.html",
  styleUrl: "./toolbar-btn.component.css",
})
export class ToolbarBtnComponent {
  @Input() label = "";
  @Input() active = false;
  @Input() disabled = false;
  @Input() title = "";
  @Input() className = "";
  @Output() clicked = new EventEmitter<MouseEvent>();

  get btnClass(): string {
    const base = "h-7 min-w-7 px-1.5 rounded flex items-center justify-center gap-1 text-[13px] transition";
    const active = this.active ? "bg-blue-100 text-blue-700" : "text-gray-700 hover:bg-gray-100";
    const dis = this.disabled ? "opacity-40 cursor-not-allowed" : "";
    return `${base} ${active} ${dis} ${this.className}`;
  }
}

/* ----------------------------- ToolbarDivider ----------------------------- */
@Component({
  selector: "app-toolbar-divider",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="w-px h-5 bg-gray-200 mx-0.5"></div>`,
})
export class ToolbarDividerComponent { }
