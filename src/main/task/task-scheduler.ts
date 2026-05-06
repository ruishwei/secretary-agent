import type { Task, TaskRelation, TaskSnapshot, TaskStatus } from "./task-types";
import type { PlanItem } from "../../shared/types";

export class TaskScheduler {
  private tasks = new Map<string, Task>();
  private taskOrder: string[] = []; // ordered by priority then creation
  private activeTaskId: string | null = null;

  createTask(input: { title: string; priority?: number; tabId?: string; deadline?: number }): Task {
    const id = "task-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
    const task: Task = {
      id,
      title: input.title,
      status: "pending",
      priority: input.priority ?? 5,
      plan: [],
      conversationId: "conv-" + id,
      tabId: input.tabId,
      createdAt: Date.now(),
      deadline: input.deadline,
    };
    this.tasks.set(id, task);
    this.insertSorted(task);
    return task;
  }

  activate(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status === "completed" || task.status === "cancelled") return false;
    if (this.activeTaskId && this.activeTaskId !== taskId) {
      // Mark previous active as pending (or blocked if it has plan items remaining)
      const prev = this.tasks.get(this.activeTaskId);
      if (prev && prev.status === "active") {
        prev.status = "pending";
      }
    }
    task.status = "active";
    this.activeTaskId = taskId;
    return true;
  }

  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.status = "cancelled";
    if (this.activeTaskId === taskId) {
      this.activeTaskId = null;
    }
    return true;
  }

  completeTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.status = "completed";
    if (this.activeTaskId === taskId) {
      this.activeTaskId = null;
    }
    return true;
  }

  blockTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.status = "blocked";
    if (this.activeTaskId === taskId) {
      this.activeTaskId = null;
    }
    return true;
  }

  setPriority(taskId: string, priority: number): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.priority = Math.max(1, Math.min(10, priority));
    this.reorder();
    return true;
  }

  setPlan(taskId: string, plan: PlanItem[]): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.plan = plan;
    return true;
  }

  updatePlanItemStatus(taskId: string, itemId: string, status: PlanItem["status"]): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    const item = task.plan.find((p) => p.id === itemId);
    if (!item) return false;
    item.status = status;
    return true;
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getActiveTask(): Task | undefined {
    if (!this.activeTaskId) return undefined;
    return this.tasks.get(this.activeTaskId);
  }

  getActiveTaskId(): string | null {
    return this.activeTaskId;
  }

  getAllTasks(): Task[] {
    return this.taskOrder.map((id) => this.tasks.get(id)!).filter(Boolean);
  }

  getPendingTasks(): Task[] {
    return this.getAllTasks().filter((t) => t.status === "pending");
  }

  getNextTask(): Task | undefined {
    return this.getPendingTasks()[0];
  }

  getSnapshot(): TaskSnapshot {
    const tasks = this.getAllTasks();
    const completedToday = tasks.filter(
      (t) => t.status === "completed" && t.createdAt > Date.now() - 86400000
    ).length;
    return {
      tasks,
      activeTaskId: this.activeTaskId,
      pendingCount: tasks.filter((t) => t.status === "pending").length,
      activeCount: tasks.filter((t) => t.status === "active").length,
      completedToday,
    };
  }

  removeTask(taskId: string): boolean {
    if (taskId === this.activeTaskId) return false;
    this.tasks.delete(taskId);
    this.taskOrder = this.taskOrder.filter((id) => id !== taskId);
    return true;
  }

  cleanupCompleted(): number {
    let removed = 0;
    for (const [id, task] of this.tasks) {
      if ((task.status === "completed" || task.status === "cancelled") && id !== this.activeTaskId) {
        this.tasks.delete(id);
        removed++;
      }
    }
    this.taskOrder = this.taskOrder.filter((id) => this.tasks.has(id));
    return removed;
  }

  // ===== Private =====

  private insertSorted(task: Task): void {
    let i = 0;
    for (; i < this.taskOrder.length; i++) {
      const other = this.tasks.get(this.taskOrder[i]);
      if (!other) continue;
      if (task.priority < other.priority) break;
      if (task.priority === other.priority && task.createdAt < other.createdAt) break;
    }
    this.taskOrder.splice(i, 0, task.id);
  }

  private reorder(): void {
    const all = Array.from(this.tasks.values());
    all.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.createdAt - b.createdAt;
    });
    this.taskOrder = all.map((t) => t.id);
  }

  // ===== Task Relationships =====

  setRelation(taskId: string, relation: { type: TaskRelation; taskId: string }): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.relation = relation;
    return true;
  }

  setSummary(taskId: string, summary: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.summary = summary;
    return true;
  }

  /** Get tasks that were completed in the last N minutes (for context enrichment). */
  getRecentlyCompleted(withinMinutes = 30): Task[] {
    const cutoff = Date.now() - withinMinutes * 60 * 1000;
    return this.getAllTasks().filter(
      (t) => t.status === "completed" && t.createdAt > cutoff
    );
  }

  /** Get all tasks related to the given task (directly depends-on or supersedes). */
  getRelatedTasks(taskId: string): Task[] {
    const task = this.tasks.get(taskId);
    if (!task?.relation) return [];
    const related = this.tasks.get(task.relation.taskId);
    return related ? [related] : [];
  }

  /** Build a context summary about recently finished tasks for the next pending task. */
  buildTaskContext(): string | null {
    const recent = this.getRecentlyCompleted(30);
    if (recent.length === 0) return null;

    const lines = recent.map((t) => {
      const planStatus = t.plan.length > 0
        ? ` [${t.plan.filter((p) => p.status === "completed").length}/${t.plan.length} steps done]`
        : "";
      const summary = t.summary ? `\n    Summary: ${t.summary}` : "";
      return `  - "${t.title}"${planStatus}${summary}`;
    });

    return `Recently completed tasks:\n${lines.join("\n")}\n\nIf your current task relates to any of these, you may continue from where they left off, supersede them, or declare a dependency.`;
  }
}
