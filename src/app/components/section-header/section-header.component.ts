import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { IconComponent } from "../icon/icon.component";

/** Section header row used in the sidebar (Direct messages, Test Section, Spaces, etc). */
@Component({
  selector: "app-section-header",
  standalone: true,
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./section-header.component.html",
  styleUrl: "./section-header.component.css",
})
export class SectionHeaderComponent {
  @Input() label = "";
  @Input() active = false;
  @Input() count?: number | null;
  @Output() clicked = new EventEmitter<void>();
}
