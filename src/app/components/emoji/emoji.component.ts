import { ChangeDetectionStrategy, Component, Input, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { EMOJI_BASE_URL, pngBucketFor } from "../../data/emoji-catalog";

/**
 * Renders a single Noto Color Emoji image.
 *
 * Idle:   {base}/{code}/{pngBucketFor(size)}.png
 *           — static frame at the smallest PNG bucket >= display size.
 *             A 20px button gets the 32px PNG (~1 KB); a 56px tile gets
 *             the 72px PNG; etc. Saves bandwidth vs always pulling 512.
 *
 * Hover:  {base}/{code}/512.webp
 *           — animated WebP. Only 512 is published, browser scales down.
 *             Loaded lazily on first hover, then cached by the CDN.
 */
@Component({
  selector: "app-emoji",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <img [src]="hover() ? animated : static_"
         [alt]="name || code"
         [title]="name || ''"
         [width]="size" [height]="size"
         (mouseenter)="hover.set(true)"
         (mouseleave)="hover.set(false)"
         loading="lazy" draggable="false"
         style="display: inline-block; vertical-align: middle; user-select: none;" />
  `,
})
export class EmojiComponent {
  @Input({ required: true }) code!: string;
  @Input() name?: string;
  /** Render size in px. Drives both the inline width/height AND the
   *  PNG-size bucket we pull (so a 20px button doesn't fetch a 512px
   *  PNG when 32px would suffice). */
  @Input() size: number = 18;

  hover = signal(false);

  get static_(): string {
    return `${EMOJI_BASE_URL}/${this.code}/${pngBucketFor(this.size)}.png`;
  }
  get animated(): string {
    return `${EMOJI_BASE_URL}/${this.code}/512.webp`;
  }
}
