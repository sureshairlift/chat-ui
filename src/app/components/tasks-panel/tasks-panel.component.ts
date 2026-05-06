import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
  computed, inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { SENDERS } from "../../data/senders";
import { Conversation, ConvTask, Sender } from "../../models/types";
import { ToastService } from "../../services/toast.service";

import { IconComponent } from "../icon/icon.component";
import { AvatarComponent } from "../avatar/avatar.component";
import { SidePanelShellComponent } from "../side-panel-shell/side-panel-shell.component";

/**
 * TasksPanel — lists tasks attached to the current conversation.
 * Mirrors React `<TasksPanel>` 1:1.
 *
 * Features:
 *  - Round checkbox to toggle done; line-through styling on completed
 *  - Assignee avatar + first-name label
 *  - Due-date pill with calendar icon
 *  - Footer "Add task" button
 *  - Open/Done counts in header
 */
@Component({
  selector: "app-tasks-panel",
  standalone: true,
  imports: [CommonModule, IconComponent, AvatarComponent, SidePanelShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./tasks-panel.component.html",
  styleUrl: "./tasks-panel.component.css",
})
export class TasksPanelComponent {
  state = inject(ChatStateService);
  toast = inject(ToastService);

  @Input() conv: Conversation | null = null;
  @Input() fullscreen = false;
  @Output() closed = new EventEmitter<void>();

  tasks = computed<ConvTask[]>(() => {
    const id = this.conv?.id;
    if (!id) return [];
    return this.state.convTasks()[id] || [];
  });

  openCount = computed(() => this.tasks().filter((t) => !t.done).length);
  doneCount = computed(() => this.tasks().filter((t) => t.done).length);

  senderFor(id?: string): Sender | null {
    return id ? (SENDERS[id] || null) : null;
  }

  checkboxClass(done: boolean): string {
    const base = "mt-0.5 w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition";
    return done
      ? `${base} bg-blue-600 border-blue-600`
      : `${base} border-gray-300 hover:border-blue-500 hover:bg-blue-50`;
  }

  onToggle(taskId: string): void {
    if (!this.conv) return;
    this.state.toggleTask(this.conv.id, taskId);
  }

  onAddTask(): void {
    if (!this.conv) return;
    const title = prompt("New task title:");
    if (!title?.trim()) return;
    this.state.addTask(this.conv.id, {
      id: `task-${Date.now()}`,
      title: title.trim(),
      done: false,
      assignee: "me",
    });
    this.toast.show("Task added");
  }
}
