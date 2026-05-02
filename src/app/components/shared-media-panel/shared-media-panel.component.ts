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
  templateUrl: "./shared-media-panel.component.html",
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
