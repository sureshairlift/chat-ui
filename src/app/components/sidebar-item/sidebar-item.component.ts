import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { IconComponent } from "../icon/icon.component";

/** Sidebar shortcut row — used in the expanded Sidebar's "Shortcuts" group. */
@Component({
  selector: "app-sidebar-item",
  standalone: true,
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sidebar-item.component.html',
  styleUrl: './sidebar-item.component.css',
})
export class SidebarItemComponent {
  @Input() label = "";
  @Input() active = false;
  @Input() calendar = false;
  @Input() count?: number | null;
  @Output() clicked = new EventEmitter<void>();
}
