import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { IconComponent } from "../icon/icon.component";
import { SidePanelShellComponent } from "../side-panel-shell/side-panel-shell.component";

/**
 * BoardPanel — pinned messages and resources sidebar.
 * Mirrors React `<BoardPanel>` 1:1.
 *
 * The original React renders a hard-coded sample (curl install snippet,
 * "Add Resources" CTA, suggested Drive doc). We faithfully port the same
 * static layout — in production this would be data-driven.
 */
@Component({
  selector: "app-board-panel",
  standalone: true,
  imports: [CommonModule, IconComponent, SidePanelShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./board-panel.component.html",
  styleUrl: "./board-panel.component.css",
})
export class BoardPanelComponent {
  @Input() fullscreen = false;
  @Output() closed = new EventEmitter<void>();
}
