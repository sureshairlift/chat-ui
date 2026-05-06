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
         class="rounded-xl overflow-hidden border border-gray-200 max-w-[320px] group/img cursor-pointer">
      <div
        class="relative w-full"
        [style.aspectRatio]="att.aspectRatio || '16 / 10'"
        [style.background]="att.preview || 'linear-gradient(135deg, #93c5fd 0%, #c4b5fd 50%, #f9a8d4 100%)'"
        style="background-size: cover; background-position: center;"
      >
        <div *ngIf="!att.preview" class="absolute inset-0 flex items-center justify-center">
          <app-icon name="image" [size]="36" [strokeWidth]="1.5" class="text-white/80"></app-icon>
        </div>
        <div class="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition"></div>
        <button
          (click)="$event.stopPropagation(); onPreview()"
          class="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white opacity-0 group-hover/img:opacity-100 transition"
          title="Open preview"
        >
          <app-icon name="maximize-2" [size]="13"></app-icon>
        </button>
      </div>
      <div *ngIf="att.name" class="px-3 py-1.5 text-[12px] text-gray-700 truncate bg-white">
        {{ att.name }}
      </div>
    </div>
  `,
})
export class ImageAttachmentComponent {
  private preview = inject(FilePreviewService);
  @Input() att!: Attachment;
  @Input() siblings: Attachment[] = [];
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
    <div (click)="onPreview()"
         class="rounded-xl overflow-hidden border border-gray-200 max-w-[320px] relative group/vid cursor-pointer">
      <div
        class="relative w-full"
        style="aspect-ratio: 16 / 9;"
        [style.background]="att.preview || 'linear-gradient(135deg, #1f2937 0%, #4b5563 100%)'"
      >
        <div class="absolute inset-0 flex items-center justify-center">
          <div class="w-12 h-12 rounded-full bg-white/90 group-hover/vid:bg-white flex items-center justify-center shadow-lg transition">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" class="text-gray-900 ml-0.5">
              <polygon points="5,3 19,12 5,21"></polygon>
            </svg>
          </div>
        </div>
        <span
          *ngIf="att.duration"
          class="absolute bottom-2 right-2 text-[11px] bg-black/70 text-white rounded px-1.5 py-0.5"
        >{{ att.duration }}</span>
      </div>
      <div *ngIf="att.name" class="px-3 py-1.5 text-[12px] text-gray-700 truncate bg-white flex items-center gap-1.5">
        <app-icon name="film" [size]="12" class="text-gray-500"></app-icon>
        {{ att.name }}
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
    <div (click)="onPreview()"
         class="flex items-center gap-3 px-3 py-2.5 border border-gray-200 rounded-xl bg-white max-w-[320px] cursor-pointer hover:bg-gray-50 transition">
      <button (click)="$event.stopPropagation(); onPreview()"
              class="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center text-white shrink-0">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5,3 19,12 5,21"></polygon>
        </svg>
      </button>
      <div class="flex-1 min-w-0">
        <div class="text-[13px] font-medium text-gray-900 truncate flex items-center gap-1.5">
          <app-icon name="music" [size]="12" class="text-gray-500"></app-icon>
          {{ att.name || "Voice message" }}
        </div>
        <!-- Mock waveform — fixed pattern, matches React -->
        <div class="flex items-center gap-0.5 mt-1.5 h-3">
          <div *ngFor="let h of WAVE_HEIGHTS"
               class="w-0.5 bg-gray-300 rounded-full"
               [style.height.px]="h * 1.5"></div>
        </div>
      </div>
      <span *ngIf="att.duration" class="text-[11px] text-gray-500 shrink-0 tabular-nums">
        {{ att.duration }}
      </span>
    </div>
  `,
})
export class AudioAttachmentComponent {
  private preview = inject(FilePreviewService);
  @Input() att!: Attachment;
  @Input() siblings: Attachment[] = [];
  readonly WAVE_HEIGHTS = [3, 6, 4, 8, 5, 9, 4, 7, 3, 5, 6, 8, 4, 5, 7, 3, 6, 4, 5, 8, 4, 6, 3, 5];
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
