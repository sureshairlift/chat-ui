import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { IconComponent } from "../icon/icon.component";

/** Sidebar shortcut row — used in the expanded Sidebar's "Shortcuts" group. */
@Component({
  selector: "app-sidebar-item",
  standalone: true,
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      (click)="clicked.emit()"
      [class]="'group w-full flex items-center gap-3 px-3 py-1.5 rounded-r-full text-[14px] ' +
        (active ? 'bg-blue-100 text-blue-900 font-medium' : 'text-gray-800 hover:bg-gray-100')"
    >
      <span class="shrink-0 w-6 flex items-center justify-center">
        <ng-content></ng-content>
      </span>
      <span class="flex-1 text-left truncate">{{ label }}</span>
      <app-icon *ngIf="calendar" name="calendar" [size]="14" class="text-gray-500"></app-icon>
      <span
        *ngIf="count !== undefined && count !== null && count > 0"
        [class]="'text-[11px] px-1.5 rounded-full ' +
          (active ? 'bg-blue-200 text-blue-900' : 'bg-gray-200 text-gray-700')"
      >{{ count }}</span>
    </button>
  `,
})
export class SidebarItemComponent {
  @Input() label = "";
  @Input() active = false;
  @Input() calendar = false;
  @Input() count?: number | null;
  @Output() clicked = new EventEmitter<void>();
}
