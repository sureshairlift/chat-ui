import { Injectable, signal } from "@angular/core";
import { ToastState } from "../models/types";

/**
 * Tiny toast service — mirrors the React `showToast` callback.
 * A single toast at a time; auto-dismisses after 2.5s.
 */
@Injectable({ providedIn: "root" })
export class ToastService {
  readonly toast = signal<ToastState | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private nextId = 1;

  show(message: string): void {
    const id = this.nextId++;
    this.toast.set({ id, message });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      // Only clear if no newer toast replaced it
      if (this.toast()?.id === id) this.toast.set(null);
    }, 2500);
  }

  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.toast.set(null);
  }
}
