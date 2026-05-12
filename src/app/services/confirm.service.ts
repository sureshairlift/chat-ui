import { Injectable, signal } from "@angular/core";

/** Confirm-modal request — drives ConfirmModalComponent's render. */
export interface ConfirmRequest {
  title: string;
  message: string;
  /** Button label for the confirm action. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Button label for the cancel action. Defaults to "Cancel". */
  cancelLabel?: string;
  /** When true the confirm button is rendered in red — use for
   *  destructive actions (delete, leave, clear). */
  danger?: boolean;
}

interface OpenState {
  req: ConfirmRequest;
  resolve: (ok: boolean) => void;
}

/**
 * Promise-based replacement for window.confirm().
 *
 *   const ok = await confirm.ask({ title: "Delete message?", danger: true });
 *   if (!ok) return;
 *
 * The overlay component (ConfirmModalComponent) mounts once at root,
 * reads the `state` signal, and calls back into `resolve` / `cancel`
 * when the user clicks. Multiple concurrent calls are not supported —
 * the second .ask() throws until the first resolves.
 */
@Injectable({ providedIn: "root" })
export class ConfirmService {
  readonly state = signal<OpenState | null>(null);

  ask(req: ConfirmRequest): Promise<boolean> {
    if (this.state()) {
      // Caller should never stack confirmations. Resolve outstanding
      // as cancelled so the second prompt can take over.
      this.state()!.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      this.state.set({ req, resolve });
    });
  }

  resolve(ok: boolean): void {
    const s = this.state();
    if (!s) return;
    this.state.set(null);
    s.resolve(ok);
  }
}
