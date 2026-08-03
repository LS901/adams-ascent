"use client";

import { useState, useTransition } from "react";
import type { Milestone, Task } from "../lib/db/schema";
import { deleteTask, restoreTaskFromHistory, type AltitudeMutationResult } from "../actions/tasks";
import type { ClimbCampsSnapshot } from "../actions/milestones";
import { ConfirmButton } from "./ConfirmButton";

type CampCompletionSignal = {
  camp: Milestone | null;
  summit: Milestone | null;
};

type HistoryListProps = {
  tasks: Task[];
  onDeleted: (taskId: number, result: AltitudeMutationResult & CampCompletionSignal) => void;
  onRestored: (snapshot: { altitude: number } & ClimbCampsSnapshot) => void;
};

export function HistoryList({ tasks, onDeleted, onRestored }: HistoryListProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Every resolved task is Done now — there's no "missed" status anymore,
  // just pending, done, or deleted.
  const resolved = tasks
    .filter((t) => t.status === "done")
    .sort((a, b) => (b.resolvedAt?.getTime() ?? 0) - (a.resolvedAt?.getTime() ?? 0));

  function handleDelete(taskId: number) {
    startTransition(async () => {
      const result = await deleteTask(taskId);
      onDeleted(taskId, result);
    });
  }

  function handleRestore(taskId: number) {
    startTransition(async () => {
      const snapshot = await restoreTaskFromHistory(taskId);
      onRestored(snapshot);
    });
  }

  return (
    <section className="w-full max-w-sm mx-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="h-11 w-full rounded-lg text-left font-display text-lg text-cream"
      >
        {open ? "▾" : "▸"} History
      </button>
      {open ? (
        resolved.length === 0 ? (
          <p className="mt-2 text-sm text-cream/50">Nothing resolved yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {resolved.map((task) => (
              <li key={task.id} className="flex items-center gap-3 rounded-xl bg-navy-deep/40 p-3">
                <span className="text-lg text-pine-light" aria-hidden>
                  ✓
                </span>
                <span className="flex-1 text-cream/70 line-through decoration-cream/30">
                  {task.title}
                </span>
                <ConfirmButton
                  label="Undo"
                  onConfirm={() => handleRestore(task.id)}
                  disabled={isPending}
                  className="h-11 min-w-11 rounded-lg px-3 text-sm text-gold/80"
                />
                <ConfirmButton
                  label="Del"
                  onConfirm={() => handleDelete(task.id)}
                  disabled={isPending}
                  className="h-11 min-w-11 rounded-lg px-3 text-sm text-cream/40"
                />
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}
