import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";

/** Small "Nothing here yet" placeholder used inside dashboard sections. */
@Component({
  selector: "app-empty-mini",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./empty-mini.component.html",
  styleUrl: "./empty-mini.component.css",
})
export class EmptyMiniComponent {
  @Input() text = "";
}
