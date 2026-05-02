import { ChangeDetectionStrategy, Component } from "@angular/core";
import { CommonModule } from "@angular/common";

/** Empty state shown when no conversation is selected. */
@Component({
  selector: "app-empty-state",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex-1 flex flex-col items-center justify-center text-center px-6 bg-white">
      <div class="relative mb-6">
        <svg width="200" height="160" viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="100" cy="148" rx="64" ry="6" fill="#f3f4f6"/>
          <g transform="translate(35,28)">
            <rect x="0" y="0" width="60" height="42" rx="8" fill="#fbbc04"/>
            <circle cx="30" cy="21" r="6" fill="#fff"/>
            <rect x="65" y="22" width="50" height="42" rx="8" fill="#34a853"/>
            <rect x="74" y="32" width="32" height="6" rx="3" fill="#fff"/>
            <rect x="74" y="44" width="20" height="6" rx="3" fill="#fff"/>
            <rect x="20" y="68" width="80" height="36" rx="8" fill="#ea4335"/>
          </g>
        </svg>
      </div>
      <h3 class="text-[16px] font-medium text-gray-900 mb-1">No conversation selected</h3>
      <p class="text-[13px] text-gray-600 max-w-xs">
        Use the toggle to switch between single and split pane modes
      </p>
    </div>
  `,
})
export class EmptyStateComponent {}
