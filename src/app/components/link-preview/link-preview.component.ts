import { ChangeDetectionStrategy, Component, Input, computed, signal } from "@angular/core";
import { CommonModule } from "@angular/common";

interface PreviewMeta {
  title: string;
  description?: string;
  host: string;
  /** Background color of the small site icon tile (left of the card). */
  iconBg: string;
  /** Single character or short string drawn on the icon tile. */
  iconLabel: string;
}

/**
 * Compact inline link preview card rendered under a message that contains
 * a URL. Mock implementation: known hosts get hand-curated metadata; any
 * other URL falls back to a generic card derived from the host + path.
 *
 * Wired in production by a backend OG-meta fetch — for now the curated
 * map gives realistic previews for the demo data (github, zeplin, figma,
 * codesandbox, google meet, AWS console).
 */
@Component({
  selector: "app-link-preview",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./link-preview.component.html",
  styleUrl: "./link-preview.component.css",
})
export class LinkPreviewComponent {
  @Input({ required: true }) url!: string;

  /** Curated previews for hosts that show up in our demo data. Add more
   *  as the dataset grows; new hosts fall through to the generic builder. */
  private static readonly KNOWN: Record<string, Omit<PreviewMeta, "host">> = {
    "github.com": {
      title: "GitHub Repository",
      description: "Code, issues, pull requests, and project boards on GitHub",
      iconBg: "#0d1117",
      iconLabel: "GH",
    },
    "zpl.io": {
      title: "Zeplin design spec",
      description: "Pixel-perfect specs and assets for engineers from designers",
      iconBg: "#fdbd39",
      iconLabel: "Z",
    },
    "developers.figma.com": {
      title: "Figma Developer Docs",
      description: "API and plugin documentation for Figma integrations",
      iconBg: "#a259ff",
      iconLabel: "F",
    },
    "figma.com": {
      title: "Figma file",
      description: "Collaborative design canvas",
      iconBg: "#a259ff",
      iconLabel: "F",
    },
    "codesandbox.io": {
      title: "CodeSandbox",
      description: "Live in-browser editor for JavaScript / TypeScript / React",
      iconBg: "#040404",
      iconLabel: "CS",
    },
    "meet.google.com": {
      title: "Google Meet — video meeting",
      description: "Click to join the video call",
      iconBg: "#00897b",
      iconLabel: "M",
    },
    "console.aws.amazon.com": {
      title: "AWS Console",
      description: "Amazon Web Services management dashboard",
      iconBg: "#ff9900",
      iconLabel: "AWS",
    },
    "us-east-2.console.aws.amazon.com": {
      title: "AWS Console — us-east-2",
      description: "AWS management console (Ohio region)",
      iconBg: "#ff9900",
      iconLabel: "AWS",
    },
  };

  meta = computed<PreviewMeta>(() => {
    const host = this.hostOf(this.url);
    const known = LinkPreviewComponent.KNOWN[host];
    if (known) return { ...known, host };
    // Generic fallback — pull last path segment as a title hint.
    const path = this.pathOf(this.url);
    const last = path.split("/").filter(Boolean).pop() || host;
    return {
      title: this.humanize(last),
      description: undefined,
      host,
      iconBg: this.colorForHost(host),
      iconLabel: host.replace(/^www\./, "").charAt(0).toUpperCase(),
    };
  });

  private hostOf(url: string): string {
    try { return new URL(url).host; } catch { return url; }
  }
  private pathOf(url: string): string {
    try { return new URL(url).pathname; } catch { return ""; }
  }

  /** Deterministic accent color derived from the host so unknown sites
   *  still render with a stable, distinguishable icon tile. */
  private colorForHost(host: string): string {
    const palette = ["#3b82f6", "#10b981", "#8b5cf6", "#ef4444", "#f59e0b", "#06b6d4", "#ec4899"];
    let h = 0;
    for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  }
  private humanize(s: string): string {
    return s.replace(/[-_]+/g, " ").replace(/\.[a-z0-9]+$/i, "").trim() || "Link";
  }
}
