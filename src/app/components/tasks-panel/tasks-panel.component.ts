import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
  computed, inject, signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ChatStateService } from "../../services/chat-state.service";
import { SENDERS } from "../../data/senders";
import { Conversation, ConvTask, Sender } from "../../models/types";
import { ToastService } from "../../services/toast.service";

import { IconComponent } from "../icon/icon.component";
import { AvatarComponent } from "../avatar/avatar.component";

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
  imports: [CommonModule, IconComponent, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block shrink-0 h-full" },
  template: `
    <aside [class]="asideClass" [style.width.px]="fullscreen ? null : 380">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div class="flex items-center gap-2 min-w-0">
          <app-icon name="check-circle-2" [size]="16" class="text-blue-600 shrink-0"></app-icon>
          <h3 class="text-[16px] font-medium text-gray-900 truncate">Tasks</h3>
          <span *ngIf="tasks().length > 0" class="text-[12px] text-gray-500 shrink-0">
            · {{ openCount() }} open · {{ doneCount() }} done
          </span>
        </div>
        <button (click)="handleClose()" class="p-1.5 hover:bg-gray-100 rounded-full text-gray-600 shrink-0" title="Close">
          <app-icon name="x" [size]="16"></app-icon>
        </button>
      </div>

      <div *ngIf="conv" class="px-4 py-2 border-b border-gray-100 bg-gray-50/60 text-[12px] text-gray-600 truncate">
        For <span class="font-medium text-gray-800">{{ conv.name }}</span>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto scrollable">
        <div *ngIf="tasks().length === 0; else list"
             class="flex flex-col items-center justify-center text-center py-16 px-6 text-gray-500">
          <app-icon name="check-circle-2" [size]="36" class="mb-2 text-gray-300"></app-icon>
          <div class="text-[14px] font-medium text-gray-700">No tasks yet</div>
          <div class="text-[12px] text-gray-500 mt-1 max-w-[260px]">
            Tasks created from messages or added here will appear in this list.
          </div>
        </div>

        <ng-template #list>
          <div class="py-1">
            <div *ngFor="let t of tasks()"
                 class="group flex items-start gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-50 transition">
              <button
                (click)="onToggle(t.id)"
                [class]="checkboxClass(t.done)"
                [title]="t.done ? 'Mark incomplete' : 'Mark complete'"
              >
                <app-icon *ngIf="t.done" name="check" [size]="11" [strokeWidth]="3" class="text-white"></app-icon>
              </button>
              <div class="flex-1 min-w-0">
                <div [class]="'text-[14px] leading-snug break-words ' +
                  (t.done ? 'text-gray-400 line-through' : 'text-gray-800')">
                  {{ t.title }}
                </div>
                <div class="flex items-center gap-3 mt-1">
                  <div *ngIf="senderFor(t.assignee) as a" class="flex items-center gap-1.5">
                    <app-avatar [user]="a" [size]="16"></app-avatar>
                    <span class="text-[12px] text-gray-600">{{ a.name.split(' ')[0] }}</span>
                  </div>
                  <span *ngIf="t.due" class="text-[12px] text-gray-500 flex items-center gap-1">
                    <app-icon name="calendar" [size]="11"></app-icon>
                    {{ t.due }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </ng-template>
      </div>

      <!-- Footer -->
      <div class="border-t border-gray-100 px-3 py-2.5">
        <button
          (click)="onAddTask()"
          class="w-full flex items-center justify-center gap-2 text-[13px] text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg px-3 py-2 font-medium transition"
        >
          <app-icon name="plus" [size]="14"></app-icon>
          Add task
        </button>
      </div>
    </aside>
  `,
})
export class TasksPanelComponent {
  state = inject(ChatStateService);
  toast = inject(ToastService);

  @Input() conv: Conversation | null = null;
  @Input() fullscreen = false;
  @Output() closed = new EventEmitter<void>();

  closing = signal(false);

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

  get asideClass(): string {
    const fs = this.fullscreen ? "fixed inset-0 z-50" : "shrink-0 h-full";
    const anim = this.closing() ? "side-panel-out" : "side-panel-in";
    return `${fs} flex flex-col border-l border-gray-200 bg-white overflow-hidden ${anim}`;
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

  handleClose(): void {
    if (this.closing()) return;
    this.closing.set(true);
    setTimeout(() => this.closed.emit(), 180);
  }
}
