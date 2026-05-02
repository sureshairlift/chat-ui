import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";

/** Small "Nothing here yet" placeholder used inside dashboard sections. */
@Component({
  selector: "app-empty-mini",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-6 text-center text-[13px] text-gray-500">
      <div class="mx-auto mb-2 flex justify-center">
        <ng-content></ng-content>
      </div>
      {{ text }}
    </div>
  `,
})
export class EmptyMiniComponent {
  @Input() text = "";
}
