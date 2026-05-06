import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";

/**
 * Resize handle styled like Claude.app's chat ↔ preview divider.
 *
 * Visual hierarchy (subtle → loud):
 *   1. At rest                — wide invisible hit-zone, no visible line, no pill
 *   2. On hover                — thin neutral-gray line + a small white pill with
 *                                a two-bar grip fades in centered on the edge
 *   3. While dragging          — line + pill switch to the accent (blue), pill
 *                                lifts slightly with a soft scale
 *
 * Hit-zone is 8px wide so the user doesn't have to pixel-hunt; the visible
 * line is only 1px so the layout stays clean.
 *
 * Tailwind needs literal `group/<name>` strings (the JIT can't resolve them
 * dynamically), so we hard-code the two supported group names.
 */
@Component({
  selector: "app-resize-handle",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./resize-handle.component.html",
  styleUrl: "./resize-handle.component.css",
})
export class ResizeHandleComponent {
  @Input() side: "right" | "left" = "right";
  @Input() isResizing = false;
  @Input() groupName: "resize" | "threadresize" = "resize";
  @Output() mouseDown = new EventEmitter<MouseEvent>();

  get isRight(): boolean { return this.side === "right"; }
  get positionClass(): string { return this.isRight ? "right-0" : "left-0"; }
  get offsetClass(): string { return this.isRight ? "translate-x-1/2" : "-translate-x-1/2"; }

  /** Wide invisible hit-zone with the literal Tailwind group selector. */
  get containerClass(): string {
    const groupCls = this.groupName === "threadresize" ? "group/threadresize" : "group/resize";
    return `absolute top-0 ${this.positionClass} w-2 h-full cursor-col-resize ${groupCls} z-20`;
  }

  /** Thin 1px vertical line — neutral gray on hover, accent during drag. */
  get edgeClass(): string {
    const base = "w-px h-full mx-auto transition-colors duration-150";
    if (this.isResizing) return `${base} bg-blue-500`;
    const hoverCls = this.groupName === "threadresize"
      ? "group-hover/threadresize:bg-gray-300"
      : "group-hover/resize:bg-gray-300";
    return `${base} bg-transparent ${hoverCls}`;
  }

  /** Pill capsule containing the grip — fades in on hover, lifts on drag. */
  get capsuleClass(): string {
    const base = `absolute top-1/2 ${this.positionClass} ${this.offsetClass} -translate-y-1/2
      flex items-center justify-center gap-[2px]
      h-8 px-1.5 rounded-full border bg-white shadow-sm
      transition-all duration-150 ease-out
      pointer-events-none`;
    if (this.isResizing) {
      // Active drag: switch to accent and lift slightly so the user feels
      // the grab has registered.
      return `${base} opacity-100 border-blue-300 bg-blue-50 scale-[1.06]`;
    }
    const hoverCls = this.groupName === "threadresize"
      ? "group-hover/threadresize:opacity-100"
      : "group-hover/resize:opacity-100";
    return `${base} opacity-0 ${hoverCls} border-gray-200`;
  }

  /** Each grip bar — 2px wide, slightly shorter than the previous version
   *  to feel more refined and match Claude's compact look. */
  get gripBarClass(): string {
    const tone = this.isResizing ? "bg-blue-600" : "bg-gray-400";
    return `w-[2px] h-3.5 rounded-full transition-colors duration-150 ${tone}`;
  }
}
