import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Sender, Conversation } from "../../models/types";
import { colorForUserRef, initialsForName } from "../../services/avatar-helpers";

/**
 * Avatar — circular badge with initials. Optional green presence dot.
 *
 * `user` may be a Sender, a Conversation, or a minimal `{id, name}`-
 * shaped object. The component uses any explicit `color` / `initials`
 * supplied; when they're missing, it derives BOTH from the same
 * shared helpers used by the adapter — so the same user_ref renders
 * the same hue + initials everywhere in the app, regardless of which
 * caller constructed the input object.
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

  /** Stable seed used by both color + initials fallbacks.
   *  Resolution order:
   *    1. `avatarSeed` — set by adaptChannel on DM channels to the
   *       OTHER person's user_ref so the header avatar matches the
   *       bubble's avatar for that same person.
   *    2. `id`         — Sender.ref (e.g. "op:42") or Channel.id.
   *    3. ""           — falls through to gray + "?".
   *  The same seed picks the same hue everywhere thanks to the
   *  deterministic `paletteIndexFor` rule (id % 20). */
  private get seed(): string {
    const u = this.user as { id?: string; avatarSeed?: string } | null | undefined;
    return u?.avatarSeed || u?.id || "";
  }

  /** Color resolves in this order:
   *    1. explicit `user.color`              — caller's choice wins
   *    2. derived from `user.id`              — deterministic, shared
   *    3. fallback gray                       — empty input */
  get resolvedColor(): string {
    const explicit = this.user?.color;
    if (explicit && explicit.trim()) return explicit;
    if (this.seed) return colorForUserRef(this.seed);
    return "bg-gray-400";
  }

  /** Initials resolve similarly — explicit → derived from name+id → "?". */
  get resolvedInitials(): string {
    const explicit = (this.user as { initials?: string } | null | undefined)?.initials;
    if (explicit && explicit.trim()) return explicit;
    return initialsForName(this.user?.name, this.seed);
  }

  /** Recreates the React class composition rule:
   *    if color contains "text-" it's already a tinted pill, use as-is.
   *    otherwise append "text-white". */
  get containerClass(): string {
    const color = this.resolvedColor;
    const cls = color.includes("text-") ? color : `${color} text-white`;
    return `relative shrink-0 rounded-full flex items-center justify-center font-medium ${cls}`;
  }
}
