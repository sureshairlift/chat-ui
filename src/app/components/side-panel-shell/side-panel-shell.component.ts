import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";

/**
 * Shared shell for the right-side dock panels (board, pinned, following,
 * tasks, shared-media). Owns the <aside> wrapper, fullscreen-vs-dock
 * sizing, and the slide-out close animation.
 *
 * Each consumer projects its own header + body and triggers the close
 * animation via a template ref:
 *
 *   <app-side-panel-shell #shell [fullscreen]="fullscreen" (closed)="closed.emit()">
 *     <header>... <button (click)="shell.handleClose()">×</button></header>
 *     <body>...</body>
 *   </app-side-panel-shell>
 */
@Component({
  selector: "app-side-panel-shell",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block shrink-0 h-full" },
  templateUrl: "./side-panel-shell.component.html",
  styleUrl: "./side-panel-shell.component.css",
})
export class SidePanelShellComponent {
  @Input() fullscreen = false;
  /** Add `relative` to the dock-mode class. Set to true when the body
   *  contains absolutely-positioned children (e.g. following-panel's
   *  floating filter pill row). */
  @Input() relativeWhenDocked = false;
  @Input() width = 380;
  /** When true (default), the panel grows a left-edge drag grip that
   *  emits `startResize` with the mousedown event. Parent (AppComponent)
   *  listens, captures mouse moves on the document, and updates the
   *  bound width signal. Set to false for panels that should stay
   *  fixed-width (none today, but the option is here). */
  @Input() resizable = true;
  @Output() closed = new EventEmitter<void>();
  @Output() startResize = new EventEmitter<MouseEvent>();

  closing = signal(false);

  get asideClass(): string {
    // Always relative in dock mode so the absolute resize grip on
    // the left edge anchors correctly. The previous behavior gated
    // `relative` on `relativeWhenDocked` for components that had
    // floating children — keep that opt-in but extend the default.
    const dock = "shrink-0 h-full relative";
    const fs = this.fullscreen ? "fixed inset-0 z-50" : dock;
    const anim = this.closing() ? "side-panel-out" : "side-panel-in";
    return `${fs} flex flex-col border-l border-gray-200 bg-white overflow-hidden ${anim}`;
  }

  handleClose(): void {
    if (this.closing()) return;
    this.closing.set(true);
    setTimeout(() => this.closed.emit(), 180);
  }
}
