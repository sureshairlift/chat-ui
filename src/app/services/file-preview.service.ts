import { Injectable, computed, signal } from "@angular/core";
import { Attachment } from "../models/types";

interface PreviewState {
  /** Sibling list for prev/next nav. Always at least 1 entry. */
  list: Attachment[];
  /** Index into `list` of the currently shown attachment. */
  index: number;
}

/**
 * Drives the FilePreviewOverlay. Anywhere that renders an attachment can
 * open the overlay by calling `open(att, siblings)`; the overlay itself is
 * mounted once at AppComponent root and listens to `current()`.
 *
 * The sibling list lets the overlay show prev/next chevrons (Google Chat
 * style) so users can flip through every attachment on a single message
 * without going back to the chat.
 */
@Injectable({ providedIn: "root" })
export class FilePreviewService {
  /** Null when nothing is being previewed. */
  current = signal<PreviewState | null>(null);

  /** Convenience signal for templates: the active attachment, or null. */
  active = computed<Attachment | null>(() => {
    const c = this.current();
    return c ? c.list[c.index] : null;
  });

  /** Whether prev / next navigation is available (>1 sibling). */
  canPrev = computed<boolean>(() => {
    const c = this.current();
    return !!c && c.index > 0;
  });
  canNext = computed<boolean>(() => {
    const c = this.current();
    return !!c && c.index < c.list.length - 1;
  });

  open(att: Attachment, siblings: Attachment[] = [att]): void {
    const list = siblings.length > 0 ? siblings : [att];
    const idx = Math.max(0, list.indexOf(att));
    this.current.set({ list, index: idx === -1 ? 0 : idx });
  }

  close(): void { this.current.set(null); }

  next(): void {
    this.current.update((c) => (c && c.index < c.list.length - 1
      ? { ...c, index: c.index + 1 } : c));
  }
  prev(): void {
    this.current.update((c) => (c && c.index > 0
      ? { ...c, index: c.index - 1 } : c));
  }
}
