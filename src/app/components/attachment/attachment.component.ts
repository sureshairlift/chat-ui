import { ChangeDetectionStrategy, Component, Input, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Attachment } from "../../models/types";
import { FilePreviewService } from "../../services/file-preview.service";
import { IconComponent } from "../icon/icon.component";
import { FileTypeIconComponent } from "../file-type-icon/file-type-icon.component";

/* =========================== FileAttachment ============================= */
@Component({
  selector: "app-file-attachment",
  standalone: true,
  imports: [CommonModule, IconComponent, FileTypeIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./attachment.component.html",
  styleUrl: "./attachment.component.css",
})
export class FileAttachmentComponent {
  private preview = inject(FilePreviewService);
  @Input() att!: Attachment;
  /** Sibling attachments to enable prev/next nav inside the overlay. */
  @Input() siblings: Attachment[] = [];
  get ext(): string {
    return (this.att.ext || this.att.name?.split(".").pop() || "").toLowerCase();
  }
  onPreview(): void {
    this.preview.open(this.att, this.siblings.length ? this.siblings : [this.att]);
  }
}

/* =========================== ImageAttachment ============================ */
@Component({
  selector: "app-image-attachment",
  standalone: true,
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div (click)="onPreview()"
         class="rounded-xl overflow-hidden border border-gray-200 max-w-[320px] group/img cursor-pointer bg-white">
      <!-- Real <img> when we have a source URL — proper aspect ratio
           from the image itself, lazy loading, error swap to the
           gradient placeholder. The wrapping anchor keeps the click
           behaviour (open preview overlay) unchanged. -->
      <div class="relative">
        <img *ngIf="att.url || att.preview; else placeholder"
             [src]="att.url || att.preview"
             [alt]="att.name || 'image'"
             loading="lazy"
             (error)="onError($event)"
             class="block w-full max-h-[400px] object-contain bg-gray-50" />
        <ng-template #placeholder>
          <div class="relative w-full"
               [style.aspectRatio]="att.aspectRatio || '16 / 10'"
               style="background: linear-gradient(135deg, #93c5fd 0%, #c4b5fd 50%, #f9a8d4 100%);">
            <div class="absolute inset-0 flex items-center justify-center">
              <app-icon name="image" [size]="36" [strokeWidth]="1.5" class="text-white/80"></app-icon>
            </div>
          </div>
        </ng-template>
        <button
          (click)="$event.stopPropagation(); onPreview()"
          class="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white opacity-0 group-hover/img:opacity-100 transition"
          title="Open preview"
        >
          <app-icon name="maximize-2" [size]="13"></app-icon>
        </button>
      </div>
      <div *ngIf="att.name" class="px-3 py-1.5 text-[12px] text-gray-700 truncate flex items-center gap-1.5">
        <span class="flex-1 truncate">{{ att.name }}</span>
        <span *ngIf="att.size" class="text-[11px] text-gray-500 tabular-nums shrink-0">{{ att.size }}</span>
      </div>
    </div>
  `,
})
export class ImageAttachmentComponent {
  private preview = inject(FilePreviewService);
  @Input() att!: Attachment;
  @Input() siblings: Attachment[] = [];
  /** Hide the broken <img> and let the gradient placeholder render
   *  via the `*ngIf="att.url || att.preview"` branch. We zero out
   *  both fields on the local input so the template re-evaluates. */
  onError(_e: Event): void {
    this.att = { ...this.att, url: undefined, preview: undefined };
  }
  onPreview(): void {
    this.preview.open(this.att, this.siblings.length ? this.siblings : [this.att]);
  }
}

/* =========================== VideoAttachment ============================ */
@Component({
  selector: "app-video-attachment",
  standalone: true,
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-xl overflow-hidden border border-gray-200 max-w-[320px] bg-white">
      <!-- Real <video> when URL is present — native controls, native
           preview frame, no fake play button. Falls back to the
           gradient-with-play placeholder only when the URL is missing
           (the rare malformed case). -->
      <video *ngIf="att.url; else placeholder" controls preload="metadata"
             [poster]="att.preview && att.preview !== att.url ? att.preview : null"
             [src]="att.url" class="w-full block"
             style="aspect-ratio: 16 / 9; background: #000;"></video>
      <ng-template #placeholder>
        <div (click)="onPreview()"
             class="relative w-full cursor-pointer"
             style="aspect-ratio: 16 / 9; background: linear-gradient(135deg, #1f2937 0%, #4b5563 100%);">
          <div class="absolute inset-0 flex items-center justify-center">
            <div class="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" class="text-gray-900 ml-0.5">
                <polygon points="5,3 19,12 5,21"></polygon>
              </svg>
            </div>
          </div>
        </div>
      </ng-template>
      <div *ngIf="att.name" class="px-3 py-1.5 text-[12px] text-gray-700 truncate flex items-center gap-1.5">
        <app-icon name="film" [size]="12" class="text-gray-500"></app-icon>
        <span class="flex-1 truncate">{{ att.name }}</span>
        <span *ngIf="att.size" class="text-[11px] text-gray-500 tabular-nums shrink-0">{{ att.size }}</span>
      </div>
    </div>
  `,
})
export class VideoAttachmentComponent {
  private preview = inject(FilePreviewService);
  @Input() att!: Attachment;
  @Input() siblings: Attachment[] = [];
  onPreview(): void {
    this.preview.open(this.att, this.siblings.length ? this.siblings : [this.att]);
  }
}

/* =========================== AudioAttachment ============================ */
@Component({
  selector: "app-audio-attachment",
  standalone: true,
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-1.5 px-3 py-2.5 border border-gray-200 rounded-xl bg-white max-w-[320px]">
      <div class="flex items-center gap-2 min-w-0">
        <app-icon name="music" [size]="14" class="text-gray-500 shrink-0"></app-icon>
        <span class="flex-1 text-[13px] font-medium text-gray-900 truncate"
              (click)="onPreview()" style="cursor: pointer;">
          {{ att.name || "Voice message" }}
        </span>
        <span *ngIf="att.size" class="text-[11px] text-gray-500 tabular-nums shrink-0">{{ att.size }}</span>
      </div>
      <!-- Real <audio> element when we have a source URL — gives the
           user actual playback controls + scrubbing. Falls back to a
           static type chip + open-in-preview when the URL is missing
           (rare; happens for malformed legacy uploads). -->
      <audio *ngIf="att.url; else noAudio" controls preload="none"
             [src]="att.url" class="w-full h-8"></audio>
      <ng-template #noAudio>
        <button (click)="onPreview()"
                class="text-[12px] text-blue-700 hover:underline self-start">
          Open audio file
        </button>
      </ng-template>
    </div>
  `,
})
export class AudioAttachmentComponent {
  private preview = inject(FilePreviewService);
  @Input() att!: Attachment;
  @Input() siblings: Attachment[] = [];
  onPreview(): void {
    this.preview.open(this.att, this.siblings.length ? this.siblings : [this.att]);
  }
}

/* ============================ AttachmentRenderer ========================= */
@Component({
  selector: "app-attachment-renderer",
  standalone: true,
  imports: [
    CommonModule, FileAttachmentComponent, ImageAttachmentComponent,
    VideoAttachmentComponent, AudioAttachmentComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div *ngIf="attachments && attachments.length > 0" class="flex flex-col gap-2 mt-1">
      <ng-container *ngFor="let att of attachments; let i = index">
        <ng-container [ngSwitch]="att.type">
          <app-image-attachment *ngSwitchCase="'image'" [att]="att" [siblings]="attachments"></app-image-attachment>
          <app-video-attachment *ngSwitchCase="'video'" [att]="att" [siblings]="attachments"></app-video-attachment>
          <app-audio-attachment *ngSwitchCase="'audio'" [att]="att" [siblings]="attachments"></app-audio-attachment>
          <app-file-attachment  *ngSwitchDefault       [att]="att" [siblings]="attachments"></app-file-attachment>
        </ng-container>
      </ng-container>
    </div>
  `,
})
export class AttachmentRendererComponent {
  @Input() attachments: Attachment[] | undefined;
}
