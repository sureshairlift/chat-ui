import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ChatStateService } from "../../services/chat-state.service";
import { BreakpointService } from "../../services/breakpoint.service";
import { IconComponent } from "../icon/icon.component";
import { SidebarItemComponent } from "../sidebar-item/sidebar-item.component";
import { SectionHeaderComponent } from "../section-header/section-header.component";

/**
 * Full Sidebar — 260px wide. Search box + New chat button + shortcuts group +
 * collapsible sections + custom section creator. Mirrors React `<Sidebar>` 1:1.
 */
@Component({
  selector: "app-sidebar",
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, SidebarItemComponent, SectionHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block shrink-0 h-full" },
  templateUrl: "./sidebar.component.html",
})
export class SidebarComponent {
  state = inject(ChatStateService);
  bp    = inject(BreakpointService);

  shortcutsOpen = signal(true);
  addingSection = signal(false);
  newSectionName = signal("");

  counts = computed(() => {
    const convs = this.state.conversations();
    return {
      direct:    convs.filter((c) => c.section === "direct").length,
      test:      convs.filter((c) => c.section === "test").length,
      spaces:    convs.filter((c) => c.section === "spaces").length,
      ai:        convs.filter((c) => c.section === "ai" && !c.isNewChat).length,
      customers: convs.filter((c) => c.section === "customers").length,
    };
  });
  unreadCount = computed(() => this.state.conversations().filter((c) => c.unread).length);
  pinnedCount = computed(() => this.state.conversations().filter((c) => c.pinned).length);

  get asideClass(): string {
    const w = (this.state.sidebarFullScreen() || this.bp.isMobile()) ? "w-full" : "w-[260px]";
    // h-full so the inner aside stretches across the host's full height —
    // this is what lets `flex-1` on the scrollable body push the footer
    // (Collapse button) to the bottom.
    return `${w} h-full shrink-0 flex flex-col bg-white border-r border-gray-200`;
  }

  customersBtnClass(): string {
    const active = this.state.selectedSection() === "customers";
    return "group flex w-full items-center gap-3 px-3 py-2 rounded-r-full text-[14px] mt-2 transition " +
      (active ? "bg-amber-100 text-amber-900 font-medium" : "text-gray-800 hover:bg-gray-100");
  }
  customersBadgeClass(): string {
    const active = this.state.selectedSection() === "customers";
    return "text-[11px] px-1.5 rounded-full " +
      (active ? "bg-amber-200 text-amber-900" : "bg-gray-200 text-gray-700");
  }

  aiBtnClass(): string {
    const active = this.state.selectedSection() === "ai";
    return "group flex w-full items-center gap-3 px-3 py-2 rounded-r-full text-[14px] mt-2 transition " +
      (active
        ? "bg-gradient-to-r from-blue-100 via-purple-100 to-pink-100 text-purple-900 font-medium"
        : "text-gray-800 hover:bg-gray-100");
  }
  aiBadgeClass(): string {
    const active = this.state.selectedSection() === "ai";
    return "text-[11px] px-1.5 rounded-full " +
      (active ? "bg-purple-200 text-purple-900" : "bg-gray-200 text-gray-700");
  }

  customSectionCount(id: string): number {
    return this.state.conversations().filter((c) => c.section === id).length;
  }

  confirmAddSection(): void {
    const name = this.newSectionName().trim();
    if (!name) return;
    this.state.addCustomSection(name);
    this.newSectionName.set("");
    this.addingSection.set(false);
  }
  cancelAddSection(): void {
    this.newSectionName.set("");
    this.addingSection.set(false);
  }
}
