import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";

/** Dashboard KPI card with optional pulse + click handler. */
@Component({
  selector: "app-kpi-card",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      *ngIf="clickable; else divTpl"
      (click)="clicked.emit()"
      [class]="containerClass"
    >
      <ng-container *ngTemplateOutlet="body"></ng-container>
    </button>
    <ng-template #divTpl>
      <div [class]="containerClass">
        <ng-container *ngTemplateOutlet="body"></ng-container>
      </div>
    </ng-template>

    <ng-template #body>
      <div [class]="'relative ' + accentClass">
        <ng-content></ng-content>
        <span *ngIf="pulse"
              class="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 truncate">
          {{ label }}
        </div>
        <div class="flex items-baseline gap-1.5">
          <span [class]="'text-[20px] font-semibold leading-none ' + textClass">{{ value }}</span>
          <span class="text-[11px] text-gray-500 truncate">{{ hint }}</span>
        </div>
      </div>
    </ng-template>
  `,
})
export class KpiCardComponent {
  @Input() label = "";
  @Input() value: string | number = "";
  @Input() tone: "red" | "amber" | "blue" | "purple" | "violet" | "emerald" | "gray" = "gray";
  @Input() pulse = false;
  @Input() hint = "";
  @Input() clickable = false;
  @Output() clicked = new EventEmitter<void>();

  private get tones() {
    return {
      red:    { bg: "bg-red-50",     text: "text-red-700",     accent: "text-red-600",    hover: "hover:bg-red-100" },
      amber:  { bg: "bg-amber-50",   text: "text-amber-700",   accent: "text-amber-600",  hover: "hover:bg-amber-100" },
      blue:   { bg: "bg-blue-50",    text: "text-blue-700",    accent: "text-blue-600",   hover: "hover:bg-blue-100" },
      purple: { bg: "bg-purple-50",  text: "text-purple-700",  accent: "text-purple-600", hover: "hover:bg-purple-100" },
      violet: { bg: "bg-violet-50",  text: "text-violet-700",  accent: "text-violet-600", hover: "hover:bg-violet-100" },
      emerald:{ bg: "bg-emerald-50", text: "text-emerald-700", accent: "text-emerald-600",hover: "hover:bg-emerald-100" },
      gray:   { bg: "bg-gray-50",    text: "text-gray-600",    accent: "text-gray-500",   hover: "hover:bg-gray-100" },
    };
  }
  get t() { return this.tones[this.tone] || this.tones.gray; }
  get textClass(): string  { return this.t.text; }
  get accentClass(): string { return this.t.accent; }
  get containerClass(): string {
    const click = this.clickable ? `${this.t.hover} cursor-pointer transition active:scale-[0.99]` : "";
    return `text-left rounded-lg ${this.t.bg} ${click} px-3 py-2.5 flex items-center gap-2.5 w-full`;
  }
}
