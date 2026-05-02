import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Message, AIListItem } from "../../models/types";
import { IconComponent } from "../icon/icon.component";

/**
 * AI message that renders a task list with status pills.
 * Mirrors React `<AIListMessage>`.
 */
@Component({
  selector: "app-ai-list-message",
  standalone: true,
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-2xl bg-white border border-gray-200 max-w-md w-full overflow-hidden shadow-sm">
      <div class="px-4 pt-4 pb-2">
        <div class="flex items-center gap-2 mb-0.5">
          <app-icon name="check-circle-2" [size]="14" class="text-emerald-600"></app-icon>
          <span class="text-[14px] font-semibold text-gray-900">{{ msg.listTitle }}</span>
        </div>
        <div class="text-[11px] text-gray-500">{{ msg.listSubtitle }}</div>
      </div>
      <div class="divide-y divide-gray-100">
        <div *ngFor="let item of msg.items" class="flex items-start gap-3 px-4 py-2.5">
          <div [class]="iconBgFor(item.status) + ' h-7 w-7 rounded-full flex items-center justify-center shrink-0'">
            <app-icon [name]="iconNameFor(item.icon)" [size]="14" class="shrink-0"></app-icon>
          </div>
          <div class="flex-1 min-w-0">
            <div [class]="'text-[13px] font-medium ' + (item.status === 'done' ? 'text-gray-500 line-through' : 'text-gray-900')">
              {{ item.title }}
            </div>
            <div class="text-[11px] text-gray-500 mt-0.5">{{ item.meta }}</div>
          </div>
          <span [class]="'text-[10px] px-1.5 py-0.5 rounded-full border capitalize shrink-0 ' + statusBorderFor(item.status)">
            {{ item.status }}
          </span>
        </div>
      </div>
      <div *ngIf="msg.summary" class="px-4 py-3 border-t border-gray-100 bg-gray-50/50">
        <div class="flex gap-2 text-[12px] text-gray-700 leading-relaxed">
          <app-icon name="sparkles" [size]="12" class="text-purple-600 mt-0.5 shrink-0"></app-icon>
          <span>{{ msg.summary }}</span>
        </div>
      </div>
    </div>
  `,
})
export class AIListMessageComponent {
  @Input() msg!: Message;

  iconNameFor(key: AIListItem["icon"]): string {
    switch (key) {
      case "phone":    return "phone";
      case "users":    return "users";
      case "dollar":   return "dollar-sign";
      case "target":   return "target";
      case "trending": return "trending-up";
      case "check":    return "check-circle";
      default:         return "clock";
    }
  }
  iconBgFor(status: AIListItem["status"]): string {
    if (status === "done")   return "bg-emerald-50 text-emerald-700";
    if (status === "active") return "bg-blue-50 text-blue-700";
    return "bg-gray-50 text-gray-500";
  }
  statusBorderFor(status: AIListItem["status"]): string {
    if (status === "done")   return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (status === "active") return "bg-blue-50 text-blue-700 border-blue-200";
    return "bg-gray-50 text-gray-600 border-gray-200";
  }
}
