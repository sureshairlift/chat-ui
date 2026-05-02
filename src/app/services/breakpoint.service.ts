import { Injectable, signal } from "@angular/core";

/**
 * Tracks viewport size and exposes a reactive signal for components.
 * Mirrors the React `useBreakpoint` hook.
 *
 * Breakpoints:
 *   isMobile : width < 768
 *   isTablet : 768  <= width < 1024
 *   isDesktop: width >= 1024
 */
@Injectable({ providedIn: "root" })
export class BreakpointService {
  readonly isMobile = signal<boolean>(false);
  readonly isTablet = signal<boolean>(false);
  readonly isDesktop = signal<boolean>(true);
  readonly width = signal<number>(typeof window !== "undefined" ? window.innerWidth : 1200);

  constructor() {
    if (typeof window !== "undefined") {
      this.update();
      window.addEventListener("resize", () => this.update());
    }
  }

  private update(): void {
    const w = window.innerWidth;
    this.width.set(w);
    this.isMobile.set(w < 768);
    this.isTablet.set(w >= 768 && w < 1024);
    this.isDesktop.set(w >= 1024);
  }
}
