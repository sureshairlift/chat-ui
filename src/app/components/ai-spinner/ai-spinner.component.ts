import {
  ChangeDetectionStrategy,
  Component,
  HostBinding,
  Input,
} from "@angular/core";
import { CommonModule } from "@angular/common";

/**
 * AI Sparkle Loading Indicator — wraps the v15 stagger-out SVG choreography
 * in a small Angular component. Renders the four-spark composition with a
 * drifting aura; pairs with optional streaming-text on the right so the
 * indicator + live preview move together.
 *
 * Inputs:
 *  - size     : px (default 32) — both width & height of the SVG.
 *  - text     : optional short string shown next to the spinner (e.g. the
 *               last few tokens streamed from the AI SSE response). Auto-
 *               truncates with ellipsis on overflow.
 *  - inline   : when true, renders as inline-flex so the parent's text flow
 *               wraps it naturally. Default true.
 *
 * Note: animations are scoped via `:host .ai-spinner__*` selectors so the
 * SVG keeps its choreography even when the component is reused across the
 * app (no global class collisions).
 */
let _aiSpinnerInstance = 0;

@Component({
  selector: "app-ai-spinner",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./ai-spinner.component.html",
  styleUrl: "./ai-spinner.component.css",
})
export class AiSpinnerComponent {
  @Input() size = 32;
  /** Short live preview of streamed AI tokens shown next to the spinner. */
  @Input() text: string | null | undefined = null;
  /** Render inline (default) vs block-level. */
  @Input() inline = true;

  /** Per-instance suffix on the SVG `<defs>` ids. Without this, two
   *  spinners on the same page collide on `id="aiSpinnerGradient"` and
   *  some browsers render the paths grey because the second `<defs>`
   *  shadows the first one's URL resolution. The IDs the template
   *  references are derived from this. */
  readonly uid = `aispn-${++_aiSpinnerInstance}`;
  get gradientId(): string { return `${this.uid}-grad`; }
  get auraId(): string { return `${this.uid}-aura`; }
  get gradientUrl(): string { return `url(#${this.gradientId})`; }
  get auraUrl(): string { return `url(#${this.auraId})`; }

  @HostBinding("class") get hostClass(): string {
    return this.inline ? "inline-flex items-center gap-2" : "flex items-center gap-2";
  }
}
