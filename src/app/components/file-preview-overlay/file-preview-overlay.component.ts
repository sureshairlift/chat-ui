import {
  ChangeDetectionStrategy, Component, HostListener, computed, inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FilePreviewService } from "../../services/file-preview.service";
import { synthesizeFileContent, PreviewContent } from "../../services/synth-file-content";
import { ToastService } from "../../services/toast.service";
import { Attachment } from "../../models/types";
import { FILE_TYPE_INFO } from "../../data/file-type-info";
import { IconComponent } from "../icon/icon.component";
import { FileTypeIconComponent } from "../file-type-icon/file-type-icon.component";

/**
 * Google Chat–style fullscreen file preview overlay.
 *
 * Mounted once at AppComponent root. Listens to FilePreviewService and
 * shows nothing until something is being previewed. Renderers per type:
 *   - image  → real <img-style> div using the attachment's preview gradient
 *   - video  → mock player UI (the seed data has no real video URLs)
 *   - audio  → mock waveform + transport
 *   - text/code/markdown/json/csv/yaml → synthesized realistic content
 *   - doc/pdf/slides → styled mock pages
 *   - archive → file listing
 *   - binary → "Preview not available" with download CTA
 *
 * Sibling navigation: prev/next chevrons cycle through every attachment
 * in the list passed by the caller (typically all attachments on a single
 * message), matching Google Chat's lightbox behavior.
 */
@Component({
  selector: "app-file-preview-overlay",
  standalone: true,
  imports: [CommonModule, IconComponent, FileTypeIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./file-preview-overlay.component.html",
  styleUrl: "./file-preview-overlay.component.css",
})
export class FilePreviewOverlayComponent {
  svc   = inject(FilePreviewService);
  toast = inject(ToastService);

  /** Current attachment being shown (or null). */
  att = computed<Attachment | null>(() => this.svc.active());

  /** Synthesized preview content for the active file-type attachment. */
  content = computed<PreviewContent>(() => {
    const a = this.svc.active();
    if (!a || a.type !== "file") return { kind: "binary" };
    return synthesizeFileContent(a.name || "untitled", this.extOf(a));
  });

  hasMultiple = computed<boolean>(() => {
    const c = this.svc.current();
    return !!c && c.list.length > 1;
  });

  position = computed<string>(() => {
    const c = this.svc.current();
    return c ? `${c.index + 1} of ${c.list.length}` : "";
  });

  /** Markdown blocks parsed from synthesized markdown body. Tiny parser:
   *  recognises h1/h2, blockquote (>), unordered (-), ordered (1.) lists, and
   *  paragraph fallthrough. Doesn't attempt full markdown — just enough to
   *  make the preview look like a rendered doc rather than raw text. */
  mdBlocks = computed<{ kind: "h1" | "h2" | "p" | "ul" | "ol" | "quote";
                       text?: string; items?: string[] }[]>(() => {
    const c = this.svc.active();
    const body = c?.type === "file" ? this.content().body ?? "" : "";
    if (!body) return [];
    const lines = body.split(/\r?\n/);
    const out: { kind: "h1" | "h2" | "p" | "ul" | "ol" | "quote";
                 text?: string; items?: string[] }[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      if (line.startsWith("# "))      { out.push({ kind: "h1", text: line.slice(2).trim() }); i++; continue; }
      if (line.startsWith("## "))     { out.push({ kind: "h2", text: line.slice(3).trim() }); i++; continue; }
      if (line.startsWith("> "))      { out.push({ kind: "quote", text: line.slice(2).trim() }); i++; continue; }
      if (/^[-*]\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^[-*]\s+/, "")); i++;
        }
        out.push({ kind: "ul", items }); continue;
      }
      if (/^\d+\.\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\d+\.\s+/, "")); i++;
        }
        out.push({ kind: "ol", items }); continue;
      }
      out.push({ kind: "p", text: line }); i++;
    }
    return out;
  });

  canCopy = computed<boolean>(() => {
    const k = this.content().kind;
    return k === "text" || k === "code" || k === "json" || k === "markdown" || k === "csv" || k === "table";
  });

  /** Pre-baked decorative gradient backgrounds for the slide mocks. */
  private static SLIDE_BGS = [
    "linear-gradient(135deg,#1e3a8a,#6366f1)",
    "linear-gradient(135deg,#7c3aed,#ec4899)",
    "linear-gradient(135deg,#0f766e,#22d3ee)",
    "linear-gradient(135deg,#b91c1c,#f97316)",
    "linear-gradient(135deg,#1f2937,#475569)",
  ];
  slideBg(i: number): string {
    return FilePreviewOverlayComponent.SLIDE_BGS[i % FilePreviewOverlayComponent.SLIDE_BGS.length];
  }

  readonly WAVE = [
    8, 14, 10, 18, 12, 22, 14, 26, 16, 24, 12, 20,
    14, 22, 18, 14, 10, 16, 12, 18, 8, 14, 10, 16,
    12, 18, 14, 22, 18, 14, 10, 6,
  ];

  /* ============================ Helpers ============================ */

  extOf(a: Attachment): string {
    return ((a.ext || a.name?.split(".").pop()) || "").toLowerCase();
  }

  swatchBg(a: Attachment): string {
    if (a.type === "image") return "linear-gradient(135deg,#60a5fa,#a78bfa)";
    if (a.type === "video") return "linear-gradient(135deg,#1f2937,#475569)";
    if (a.type === "audio") return "linear-gradient(135deg,#2563eb,#7c3aed)";
    const meta = FILE_TYPE_INFO[this.extOf(a)] || FILE_TYPE_INFO["default"];
    return meta.color;
  }

  swatchLabel(a: Attachment): string {
    if (a.type === "image") return "IMG";
    if (a.type === "video") return "VID";
    if (a.type === "audio") return "AUD";
    const meta = FILE_TYPE_INFO[this.extOf(a)] || FILE_TYPE_INFO["default"];
    return meta.label;
  }

  entryExt(name: string): string {
    return (name.split(".").pop() || "").toLowerCase();
  }

  isDocHeading(p: string): boolean {
    // Matches "1. Background", "2. Current state", etc., but not body paragraphs
    return /^\d+\.\s+[A-Z]/.test(p) && p.length < 60;
  }

  /* ============================ Actions ============================ */

  onBackdropClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.svc.close();
  }

  download(a: Attachment): void {
    // The seed data has no real file URLs, so we synthesise the body for
    // text-shaped types and trigger a download. For binary/image/video/audio
    // we just toast — the demo doesn't ship real bytes.
    const c = this.content();
    if (a.type === "file" && (c.kind === "text" || c.kind === "code"
        || c.kind === "json" || c.kind === "markdown")) {
      const blob = new Blob([c.body || ""], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = a.name || "file.txt";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    if (a.type === "file" && (c.kind === "csv" || c.kind === "table")) {
      const csv = (c.rows || []).map((row) =>
        row.map((cell) => /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell).join(",")
      ).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = a.name || "file.csv";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    this.toast.show(`Download started · ${a.name || "file"}`);
  }

  copyContent(a: Attachment): void {
    const c = this.content();
    let text = "";
    if (c.body) text = c.body;
    else if (c.rows) text = c.rows.map((r) => r.join("\t")).join("\n");
    if (!text) { this.toast.show("Nothing to copy"); return; }
    navigator.clipboard?.writeText(text).then(
      () => this.toast.show("Copied to clipboard"),
      () => this.toast.show("Copy failed"),
    );
  }

  /* ============================ Keyboard ============================ */

  @HostListener("document:keydown", ["$event"])
  onKey(e: KeyboardEvent): void {
    if (!this.svc.current()) return;
    if (e.key === "Escape")    { this.svc.close(); e.preventDefault(); return; }
    if (e.key === "ArrowLeft") { this.svc.prev();  e.preventDefault(); return; }
    if (e.key === "ArrowRight"){ this.svc.next();  e.preventDefault(); return; }
  }
}
