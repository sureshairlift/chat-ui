import { ChangeDetectionStrategy, Component, HostListener, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ConfirmService } from "../../services/confirm.service";

/**
 * Promise-driven confirm modal. Mounted once at the app root; reads
 * the ConfirmService state signal and renders an overlay when a
 * confirm is pending. Replaces the native window.confirm() so delete
 * / leave / clear flows get a consistent, themeable modal instead of
 * the browser-styled blocking dialog.
 *
 *   confirm.ask({title, message, danger: true})  →  resolves true/false
 *
 * Esc and backdrop click resolve false. Enter resolves true so common
 * "yes, delete" presses keep their flow.
 */
@Component({
  selector: "app-confirm-modal",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="svc.state() as s">
      <div class="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center px-4"
           (click)="onBackdrop($event)">
        <div class="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden side-panel-in"
             (click)="$event.stopPropagation()">
          <div class="px-5 pt-4 pb-2">
            <h3 class="text-[15px] font-semibold text-gray-900">{{ s.req.title }}</h3>
            <p class="text-[13px] text-gray-600 mt-1 leading-relaxed">{{ s.req.message }}</p>
          </div>
          <div class="flex items-center justify-end gap-2 px-4 py-3 bg-gray-50 border-t border-gray-100">
            <button (click)="svc.resolve(false)"
                    class="text-[13px] font-medium px-3 py-1.5 rounded-md hover:bg-gray-200 text-gray-700 transition">
              {{ s.req.cancelLabel || 'Cancel' }}
            </button>
            <button (click)="svc.resolve(true)" #confirmBtn
                    [class]="btnClass(!!s.req.danger)">
              {{ s.req.confirmLabel || 'Confirm' }}
            </button>
          </div>
        </div>
      </div>
    </ng-container>
  `,
})
export class ConfirmModalComponent {
  svc = inject(ConfirmService);

  btnClass(danger: boolean): string {
    return (
      "text-[13px] font-medium px-3 py-1.5 rounded-md transition text-white " +
      (danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700")
    );
  }

  onBackdrop(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.svc.resolve(false);
  }

  @HostListener("document:keydown.escape")
  onEsc(): void {
    if (this.svc.state()) this.svc.resolve(false);
  }

  @HostListener("document:keydown.enter", ["$event"])
  onEnter(e: KeyboardEvent): void {
    // Only react when the modal is open AND focus isn't on an
    // input/textarea/contenteditable (where Enter has its own meaning).
    if (!this.svc.state()) return;
    const tag = (document.activeElement?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if ((document.activeElement as HTMLElement | null)?.isContentEditable) return;
    e.preventDefault();
    this.svc.resolve(true);
  }
}
