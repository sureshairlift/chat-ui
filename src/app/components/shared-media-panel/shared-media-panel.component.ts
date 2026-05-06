import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output,
  SimpleChanges, computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { LiveDataService } from "../../services/live-data.service";
import { ToastService } from "../../services/toast.service";
import { FilePreviewService } from "../../services/file-preview.service";
import { SENDERS } from "../../data/senders";
import { Attachment, Conversation } from "../../models/types";

import { IconComponent } from "../icon/icon.component";
import { FileTypeIconComponent } from "../file-type-icon/file-type-icon.component";
import { SidePanelShellComponent } from "../side-panel-shell/side-panel-shell.component";

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
  imports: [CommonModule, IconComponent, FileTypeIconComponent, SidePanelShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./shared-media-panel.component.html",
  styleUrl: "./shared-media-panel.component.css",
})
export class SharedMediaPanelComponent implements OnChanges {
  state   = inject(ChatStateService);
  liveData = inject(LiveDataService, { optional: true });
  toast   = inject(ToastService);
  preview = inject(FilePreviewService);

  @Input() conv: Conversation | null = null;
  @Input() fullscreen = false;
  @Output() closed = new EventEmitter<void>();

  tab = signal<TabKey>("all");

  /** Server-loaded shared items (live mode). When null, the computed
   *  `all` falls back to walking the in-memory message list. The panel
   *  hydrates this on bind and on tab change so the list reflects every
   *  attachment the channel has ever held, not just the loaded window. */
  serverItems = signal<SharedItem[] | null>(null);

  /** Flatten all attachments in the current conv with sender + time context.
   *  Prefers server-side hydration when live; falls back to walking the
   *  cached message list (covers offline/demo mode). */
  all = computed<SharedItem[]>(() => {
    const server = this.serverItems();
    if (server) return server;
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

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["conv"] && this.conv) {
      void this.hydrate();
    }
  }

  /** Pull the channel-wide shared list from the backend so the panel
   *  shows files older than the loaded message window. Quiet on
   *  failure — fallback to in-memory walk via the computed signal. */
  private async hydrate(): Promise<void> {
    if (!this.conv || !this.state.live() || !this.liveData) {
      this.serverItems.set(null);
      return;
    }
    const items = await this.liveData.loadSharedInfo(this.conv.id, "all", { limit: 200 });
    if (items.length === 0) {
      this.serverItems.set([]);
      return;
    }
    // Adapt backend SharedItem to the legacy local shape so the existing
    // template (filtering by `att.type`) keeps working. Drop "link"
    // entries — the shared-media panel only shows files/media.
    const flattened: SharedItem[] = items
      .filter((it) => it.kind !== "link")
      .map((it, i) => ({
        type: it.kind as Attachment["type"],
        name: it.filename ?? it.url,
        ext: it.filename?.split(".").pop()?.toLowerCase(),
        size: it.size ? humanReadableSize(it.size) : undefined,
        mime: it.mime,
        preview: it.thumb_url,
        msgId: it.message_id,
        attIdx: i,
        sender: it.shared_by?.ref,
        time: it.shared_on,
      } as SharedItem));
    this.serverItems.set(flattened);
  }

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

  onPreview(att: SharedItem): void {
    // Open the FilePreviewOverlay with siblings from the same tab so the
    // overlay's prev/next chevrons walk every shared item the user is
    // currently looking at, not just one.
    this.preview.open(att, this.filtered());
  }
}

/** "1.4 MB", "230 KB", "8 B" — matches what the legacy `Attachment.size`
 *  string is meant to look like in the bubble row. */
function humanReadableSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
