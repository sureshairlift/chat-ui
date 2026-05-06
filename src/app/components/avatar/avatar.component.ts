import { ChangeDetectionStrategy, Component, Input, computed, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Sender, Conversation } from "../../models/types";

/**
 * Avatar — circular badge with initials. Optional green presence dot.
 * Mirrors React `<Avatar>` 1:1.
 *
 * `user` may be either a Sender or a Conversation (both expose `name`,
 * `color`, `initials`, and optional `presence`).
 */
@Component({
  selector: "app-avatar",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./avatar.component.html",
  styleUrl: "./avatar.component.css",
})
export class AvatarComponent {
  @Input() user!: Sender | Conversation | null | undefined;
  @Input() size = 36;

  get fontSize(): number {
    if (this.size <= 20) return 9;
    if (this.size <= 24) return 10;
    if (this.size <= 32) return 12;
    return 14;
  }

  /** Recreates the React class composition rule:
   *    if color contains "text-" it's already a tinted pill, use as-is.
   *    otherwise append "text-white". */
  get containerClass(): string {
    const color = this.user?.color || "bg-gray-400";
    const cls = typeof color === "string" && color.includes("text-")
      ? color
      : `${color} text-white`;
    return `relative shrink-0 rounded-full flex items-center justify-center font-medium ${cls}`;
  }
}
