import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { IconComponent } from "../icon/icon.component";
import { SectionId, ViewKey } from "../../models/types";
import { NotoEmojiPipe, notoWebpFallback } from "../../services/noto-emoji.pipe";

interface CollapsedItem {
  key: string;
  iconName: string;
  iconCustom?: "dashboard" | "threads";
  tip: string;
  info: string;
  active: boolean;
  onClick: () => void;
  external?: boolean;
  gradient?: boolean;
}

/**
 * CollapsedSidebar — 60px wide rail with icon-only navigation.
 * Mirrors React `<CollapsedSidebar>` 1:1.
 *
 * Sections are taken straight from React's items[] array.
 * Custom sections appear as colored Hash chips below a divider.
 * Tooltip shows on hover via the `group` Tailwind pattern.
 */
@Component({
  selector: "app-collapsed-sidebar",
  standalone: true,
  imports: [CommonModule, IconComponent, NotoEmojiPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block shrink-0 h-full" },
  templateUrl: "./collapsed-sidebar.component.html",
  styleUrl: "./collapsed-sidebar.component.css",
})
export class CollapsedSidebarComponent {
  state = inject(ChatStateService);
  notoWebpFallback = notoWebpFallback;

  /** Item list, computed reactively from current state. */
  items = computed<CollapsedItem[]>(() => {
    const convs = this.state.conversations();
    const view = this.state.view();
    const sec = this.state.selectedSection();

    const unreadCount    = convs.filter((c) => c.unread).length;
    const pinnedCount    = convs.filter((c) => c.pinned).length;
    const customerCount  = convs.filter((c) => c.section === "customers").length;
    const directCount    = convs.filter((c) => c.section === "direct").length;
    const spacesCount    = convs.filter((c) => c.section === "spaces").length;

    return [
      { key: "dashboard", iconName: "", iconCustom: "dashboard",
        tip: "Dashboard", info: "Today's overview, handoffs, and tasks",
        active: view === "dashboard",
        onClick: () => this.state.setView("dashboard") },
      { key: "home", iconName: "home",
        tip: "Home", info: "All conversations",
        active: view === "home" && sec === "all",
        onClick: () => this.state.setView("home") },
      { key: "mentions", iconName: "at-sign",
        tip: "Mentions", info: "Where someone @mentioned you",
        active: view === "mentions",
        onClick: () => this.state.setView("mentions") },
      { key: "threads", iconName: "", iconCustom: "threads",
        tip: "Threads", info: "Threads you've replied to or been mentioned in",
        active: view === "threads",
        onClick: () => this.state.setView("threads") },
      { key: "unread", iconName: "inbox",
        tip: "Unread",
        info: unreadCount > 0 ? `${unreadCount} unread conversation${unreadCount === 1 ? "" : "s"}` : "All caught up",
        active: view === "home" && sec === "unread",
        onClick: () => this.state.setSection("unread") },
      { key: "pinned", iconName: "pin",
        tip: "Pinned chats",
        info: pinnedCount > 0 ? `${pinnedCount} pinned` : "Pin chats to keep them on top",
        active: view === "home" && sec === "pinned",
        onClick: () => this.state.setSection("pinned") },
      { key: "starred", iconName: "bookmark",
        tip: "Saved messages", info: "Bookmarked messages for later",
        active: view === "starred",
        onClick: () => this.state.setView("starred") },
      { key: "sent", iconName: "send",
        tip: "Sent", info: "Your messages, newest first",
        active: view === "sent",
        onClick: () => this.state.setView("sent") },
      { key: "external", iconName: "globe",
        tip: "Customer Conversations",
        info: customerCount > 0 ? `${customerCount} customer chats` : "Chats with external customers",
        active: sec === "customers", external: true,
        onClick: () => this.state.setSection("customers") },
      { key: "ai", iconName: "sparkles",
        tip: "Airlift Intelligence", info: "AI assistant powered by your data",
        active: sec === "ai", gradient: true,
        onClick: () => this.state.setSection("ai") },
      { key: "direct", iconName: "message-square",
        tip: "Direct messages", info: `${directCount} 1:1 conversation${directCount === 1 ? "" : "s"}`,
        active: sec === "direct",
        onClick: () => this.state.setSection("direct") },
      // "test" no longer a built-in — collapsed sidebar drops the
      // shortcut. Custom sections appear elsewhere in this rail.
      { key: "spaces", iconName: "users",
        tip: "Spaces", info: `${spacesCount} group space${spacesCount === 1 ? "" : "s"}`,
        active: sec === "spaces",
        onClick: () => this.state.setSection("spaces") },
    ];
  });

  /** Active hover-tooltip state. We render a single `position: fixed`
   *  element from this signal, computed from the hovered button's
   *  bounding rect. Using `fixed` instead of per-row `absolute` is what
   *  lets the tooltip escape the icon list's overflow-y:auto container —
   *  otherwise the tooltip would extend horizontally inside the scroller
   *  and trigger a horizontal scrollbar (browsers force overflow-x:auto
   *  whenever overflow-y:auto is set, which clips & scrolls). */
  tooltip = signal<{ label: string; info?: string; top: number; left: number } | null>(null);

  showTip(e: MouseEvent | FocusEvent, label: string, info?: string): void {
    const t = (e.currentTarget as HTMLElement | null) ?? (e.target as HTMLElement | null);
    if (!t) return;
    const r = t.getBoundingClientRect();
    this.tooltip.set({
      label,
      info: info || undefined,
      top: r.top + r.height / 2,
      left: r.right + 12,
    });
  }
  hideTip(): void { this.tooltip.set(null); }

  btnClassFor(it: CollapsedItem): string {
    const base = "h-9 w-9 rounded-full flex items-center justify-center transition";
    if (it.active) {
      if (it.gradient) return `${base} bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100 text-purple-700`;
      if (it.external) return `${base} bg-amber-100 text-amber-700`;
      return `${base} bg-blue-100 text-blue-700`;
    }
    if (it.gradient) return `${base} text-purple-500 hover:bg-purple-50`;
    if (it.external) return `${base} text-amber-600 hover:bg-amber-50`;
    return `${base} text-gray-600 hover:bg-gray-100`;
  }
}
