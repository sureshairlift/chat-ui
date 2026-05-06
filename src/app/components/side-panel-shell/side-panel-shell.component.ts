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
  @Output() closed = new EventEmitter<void>();

  closing = signal(false);

  get asideClass(): string {
    const dock = this.relativeWhenDocked ? "shrink-0 h-full relative" : "shrink-0 h-full";
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
