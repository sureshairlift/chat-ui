import { Injectable, signal } from "@angular/core";

/**
 * Cross-pane drag state for the "drop a conv onto a sidebar section"
 * feature.
 *
 * HTML5 DnD doesn't expose the dragged payload's content to dragover
 * handlers (only the type list), so we mirror what's being dragged
 * into a service signal. Both the source (ConversationListItem) and
 * the target (Sidebar section rows) read from it:
 *
 *   - Source calls start({convId, convType}) in dragstart and end()
 *     in dragend.
 *   - Target reads dragging() in dragover to decide whether the
 *     incoming drag is one of ours and whether the drop would pass
 *     the cross-type rules (sectionAllowedForType).
 *
 * Stays null between drags so a stray dragover from some other source
 * (file drop, browser-tab drop, etc.) won't be mis-recognised.
 */
@Injectable({ providedIn: "root" })
export class SectionDragService {
  readonly dragging = signal<{ convId: string; convType: string } | null>(null);

  start(convId: string, convType: string): void {
    this.dragging.set({ convId, convType });
  }
  end(): void {
    this.dragging.set(null);
  }
}
