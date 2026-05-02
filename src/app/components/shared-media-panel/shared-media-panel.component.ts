import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
  computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { ToastService } from "../../services/toast.service";
import { FilePreviewService } from "../../services/file-preview.service";
import { SENDERS } from "../../data/senders";
import { Attachment, Conversation, Message, Sender } from "../../models/types";

import { IconComponent } from "../icon/icon.component";
import { FileTypeIconComponent } from "../file-type-icon/file-type-icon.component";

interface SharedItem extends Attachment {
  msgId: string;
  attIdx: number;
  sender?: string;
  time?: string;
}

type TabKey = "all" | "images" | "media" | "files";

/**
 * SharedMediaPanel — every attachment in the active conv, grouped by tab.
 * Mirrors React `<SharedMediaPanel>` 1:1.
 *
 *  - Images tab: 2-column grid of preview thumbnails
 *  - All / Files / Media tabs: list view with sender + time + size/duration
 */
@Component({
  selector: "app-shared-media-panel",
  standalone: true,
  imports: [CommonModule, IconComponent, FileTypeIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block shrink-0 h-full" },
  template: `
    <aside [class]="asideClass" [style.width.px]="fullscreen ? null : 380">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <div class="flex items-center gap-2 min-w-0">
          <app-icon name="folder-open" [size]="16" class="text-gray-600 shrink-0"></app-icon>
          <h3 class="text-[16px] font-medium text-gray-900 truncate">Shared files & media</h3>
          <span class="text-[12px] text-gray-500 shrink-0">· {{ all().length }}</span>
        </div>
        <button (click)="handleClose()" class="p-1.5 hover:bg-gray-100 rounded-full text-gray-600 shrink-0" title="Close">
          <app-icon name="x" [size]="16"></app-icon>
        </button>
      </div>

      <!-- Tab strip -->
      <div class="flex items-center gap-0 border-b border-gray-100 px-2 shrink-0 overflow-x-auto scrollable">
        <button *ngFor="let t of tabs()"
                (click)="tab.set(t.key)"
                [class]="tabClass(t.key)">
          {{ t.label }}
          <span *ngIf="t.count > 0" class="ml-1.5 text-[11px] text-gray-500">{{ t.count }}</span>
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto scrollable p-3">
        <ng-container *ngIf="filtered().length === 0; else hasItems">
          <div class="flex flex-col items-center justify-center text-center py-16 px-6 text-gray-500">
            <app-icon name="folder-open" [size]="32" class="mb-2 text-gray-300"></app-icon>
            <div class="text-[13px] font-medium text-gray-700">{{ emptyText() }}</div>
            <div class="text-[12px] text-gray-500 mt-1 max-w-[260px]">
              Files and media shared in this conversation will appear here.
            </div>
          </div>
        </ng-container>

        <ng-template #hasItems>
          <!-- Images: 2-col grid -->
          <div *ngIf="tab() === 'images'" class="grid grid-cols-2 gap-2">
            <button *ngFor="let att of filtered()"
                    (click)="onPreview(att)"
                    class="relative aspect-square rounded-lg overflow-hidden border border-gray-200 group hover:ring-2 hover:ring-blue-300 transition"
                    [style.background]="att.preview || 'linear-gradient(135deg, #93c5fd 0%, #c4b5fd 50%, #f9a8d4 100%)'"
                    style="background-size: cover; background-position: center;"
                    [title]="att.name">
              <div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition"></div>
              <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 text-white text-[10px] truncate">
                {{ att.name }}
              </div>
            </button>
          </div>

          <!-- All / Files / Media: list -->
          <div *ngIf="tab() !== 'images'" class="flex flex-col gap-1.5">
            <button *ngFor="let att of filtered()"
                    (click)="onPreview(att)"
                    class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 text-left transition group">
              <!-- Icon based on type -->
              <ng-container [ngSwitch]="att.type">
                <div *ngSwitchCase="'image'"
                     class="w-10 h-10 shrink-0 rounded-md overflow-hidden border border-gray-200"
                     [style.background]="att.preview || 'linear-gradient(135deg, #93c5fd, #f9a8d4)'"
                     style="background-size: cover;">
                </div>
                <div *ngSwitchCase="'video'"
                     class="w-10 h-10 shrink-0 rounded-md flex items-center justify-center"
                     [style.background]="att.preview || 'linear-gradient(135deg, #1e3a8a, #6366f1)'">
                  <app-icon name="film" [size]="16" class="text-white"></app-icon>
                </div>
                <div *ngSwitchCase="'audio'"
                     class="w-10 h-10 shrink-0 rounded-md bg-blue-100 flex items-center justify-center">
                  <app-icon name="music" [size]="16" class="text-blue-700"></app-icon>
                </div>
                <app-file-type-icon *ngSwitchDefault
                                    [ext]="extOf(att)"
                                    [size]="36">
                </app-file-type-icon>
              </ng-container>

              <div class="flex-1 min-w-0">
                <div class="text-[13px] font-medium text-gray-900 truncate">{{ att.name }}</div>
                <div class="text-[11px] text-gray-500 truncate">
                  {{ senderName(att.sender) }} · {{ att.time }}<ng-container *ngIf="att.size"> · {{ att.size }}</ng-container><ng-container *ngIf="att.duration"> · {{ att.duration }}</ng-container>
                </div>
              </div>
              <app-icon name="download" [size]="14" class="text-gray-400 opacity-0 group-hover:opacity-100 transition shrink-0"></app-icon>
            </button>
          </div>
        </ng-template>
      </div>
    </aside>
  `,
})
export class SharedMediaPanelComponent {
  state   = inject(ChatStateService);
  toast   = inject(ToastService);
  preview = inject(FilePreviewService);

  @Input() conv: Conversation | null = null;
  @Input() fullscreen = false;
  @Output() closed = new EventEmitter<void>();

  closing = signal(false);
  tab = signal<TabKey>("all");

  /** Flatten all attachments in the current conv with sender + time context. */
  all = computed<SharedItem[]>(() => {
    if (!this.conv) return [];
    const msgs = this.state.messagesByConv()[this.conv.id] || [];
    const out: SharedItem[] = [];
    for (const m of msgs) {
      if (!m.attachments?.length) continue;
      m.attachments.forEach((att, i) => {
        out.push({ ...att, msgId: m.id, attIdx: i, sender: m.sender, time: m.time });
      });
    }
    return out;
  });

  images = computed(() => this.all().filter((a) => a.type === "image"));
  videos = computed(() => this.all().filter((a) => a.type === "video"));
  audios = computed(() => this.all().filter((a) => a.type === "audio"));
  files  = computed(() => this.all().filter((a) =>
    !a.type || (a.type !== "image" && a.type !== "video" && a.type !== "audio")
  ));

  tabs = computed(() => [
    { key: "all" as TabKey,    label: "All",            count: this.all().length },
    { key: "images" as TabKey, label: "Images",         count: this.images().length },
    { key: "media" as TabKey,  label: "Audio & video",  count: this.videos().length + this.audios().length },
    { key: "files" as TabKey,  label: "Files",          count: this.files().length },
  ]);

  filtered = computed<SharedItem[]>(() => {
    switch (this.tab()) {
      case "images": return this.images();
      case "media":  return [...this.videos(), ...this.audios()];
      case "files":  return this.files();
      default:       return this.all();
    }
  });

  emptyText = computed(() => {
    switch (this.tab()) {
      case "images": return "No images shared yet";
      case "media":  return "No audio or video shared yet";
      case "files":  return "No files shared yet";
      default:       return "No files shared yet";
    }
  });

  tabClass(key: TabKey): string {
    const base = "px-3 py-2.5 text-[12.5px] font-medium border-b-2 transition whitespace-nowrap";
    return this.tab() === key
      ? `${base} border-blue-600 text-blue-700`
      : `${base} border-transparent text-gray-600 hover:text-gray-900`;
  }

  senderName(id?: string): string {
    return (id && SENDERS[id]?.name) || "Unknown";
  }

  extOf(att: Attachment): string {
    return (att.ext || att.name?.split(".").pop() || "").toLowerCase();
  }

  get asideClass(): string {
    const fs = this.fullscreen ? "fixed inset-0 z-50" : "shrink-0 h-full";
    const anim = this.closing() ? "side-panel-out" : "side-panel-in";
    return `${fs} flex flex-col border-l border-gray-200 bg-white overflow-hidden ${anim}`;
  }

  onPreview(att: SharedItem): void {
    // Open the FilePreviewOverlay with siblings from the same tab so the
    // overlay's prev/next chevrons walk every shared item the user is
    // currently looking at, not just one.
    this.preview.open(att, this.filtered());
  }

  handleClose(): void {
    if (this.closing()) return;
    this.closing.set(true);
    setTimeout(() => this.closed.emit(), 180);
  }
}
