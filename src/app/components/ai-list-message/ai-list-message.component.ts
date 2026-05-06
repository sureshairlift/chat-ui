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
  templateUrl: "./ai-list-message.component.html",
  styleUrl: "./ai-list-message.component.css",
})
export class AIListMessageComponent {
  @Input() msg!: Message;

  iconNameFor(key: AIListItem["icon"]): string {
    switch (key) {
      case "phone": return "phone";
      case "users": return "users";
      case "dollar": return "dollar-sign";
      case "target": return "target";
      case "trending": return "trending-up";
      case "check": return "check-circle";
      default: return "clock";
    }
  }
  iconBgFor(status: AIListItem["status"]): string {
    if (status === "done") return "bg-emerald-50 text-emerald-700";
    if (status === "active") return "bg-blue-50 text-blue-700";
    return "bg-gray-50 text-gray-500";
  }
  statusBorderFor(status: AIListItem["status"]): string {
    if (status === "done") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (status === "active") return "bg-blue-50 text-blue-700 border-blue-200";
    return "bg-gray-50 text-gray-600 border-gray-200";
  }
}
