"use client";

import { useState, useTransition } from "react";
import type { Milestone, Task } from "../lib/db/schema";
import { deleteTask, editTask, type AltitudeMutationResult } from "../actions/tasks";
import { ConfirmButton } from "./ConfirmButton";

type CampCompletionSignal = {
  camp: Milestone | null;
  summit: Milestone | null;
};

type TaskRowProps = {
  task: Task;
  isUndoable: boolean;
  onComplete: (taskId: number) => void;
  onUndo: (taskId: number) => void;
  onUpdated: (task: Task) => void;
  onDeleted: (taskId: number, result: AltitudeMutationResult & CampCompletionSignal) => void;
};

export function TaskRow({ task, isUndoable, onComplete, onUndo, onUpdated, onDeleted }: TaskRowProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const updated = await editTask(task.id, { title });
      onUpdated(updated);
      setEditing(false);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteTask(task.id);
      onDeleted(task.id, result);
    });
  }

  if (editing) {
    return (
      <li className="flex flex-col gap-2 rounded-xl bg-navy/60 p-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-11 rounded-lg border border-cream/20 bg-navy-deep/50 px-3 text-cream"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="h-11 flex-1 rounded-lg bg-gold font-semibold text-navy-deep"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="h-11 rounded-lg border border-cream/25 px-4 text-cream/70"
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 rounded-xl bg-navy/60 p-3">
      <span
        className={`flex-1 ${task.status !== "pending" ? "text-cream/50 line-through decoration-cream/30" : "text-cream"}`}
      >
        {task.title}
      </span>
      {isUndoable ? (
        <button
          type="button"
          onClick={() => onUndo(task.id)}
          disabled={isPending}
          className="h-11 min-w-16 rounded-lg border border-gold px-3 text-sm text-gold disabled:opacity-60"
        >
          Undo
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={() => onComplete(task.id)}
            disabled={isPending}
            aria-label={`Mark "${task.title}" done`}
            className="h-11 w-11 shrink-0 rounded-full bg-pine text-lg text-cream disabled:opacity-60"
          >
            ✓
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="h-11 min-w-11 rounded-lg px-2 text-xs text-cream/50"
          >
            Edit
          </button>
          <ConfirmButton
            label="Del"
            onConfirm={handleDelete}
            disabled={isPending}
            className="h-11 min-w-11 rounded-lg px-2 text-xs text-ember/70"
          />
        </>
      )}
    </li>
  );
}
