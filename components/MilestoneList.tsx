"use client";

import { useState, useTransition } from "react";
import type { Milestone } from "../lib/db/schema";
import {
  addMilestone,
  deleteMilestone,
  editMilestone,
  reorderMilestones,
  type ClimbCampsSnapshot,
} from "../actions/milestones";
import { ConfirmButton } from "./ConfirmButton";

type MilestoneListProps = {
  climbId: number;
  milestones: Milestone[];
  onCampsChanged: (snapshot: ClimbCampsSnapshot) => void;
  onMilestoneEdited: (milestone: Milestone) => void;
};

function MilestoneRow({
  milestone,
  rank,
  isFirst,
  isLast,
  isSummit = false,
  onEdited,
  onMove,
  onCampsChanged,
}: {
  milestone: Milestone;
  rank: number | null;
  isFirst: boolean;
  isLast: boolean;
  isSummit?: boolean;
  onEdited: (milestone: Milestone) => void;
  onMove: (direction: -1 | 1) => void;
  onCampsChanged: (snapshot: ClimbCampsSnapshot) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(milestone.title);
  const [reward, setReward] = useState(milestone.reward ?? "");
  const [isPending, startTransition] = useTransition();
  const reached = isSummit ? milestone.completedAt !== null : rank !== null;

  function handleSave() {
    startTransition(async () => {
      const updated = await editMilestone(milestone.id, { title, reward });
      onEdited(updated);
      setEditing(false);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const snapshot = await deleteMilestone(milestone.id);
      onCampsChanged(snapshot);
    });
  }

  if (editing) {
    return (
      <li className="flex flex-col gap-2 rounded-xl bg-navy-deep/50 p-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-11 rounded-lg border border-cream/20 bg-navy px-3 text-cream"
        />
        <input
          value={reward}
          onChange={(e) => setReward(e.target.value)}
          placeholder="Reward (optional)"
          className="h-11 rounded-lg border border-cream/20 bg-navy px-3 text-cream placeholder:text-cream/40"
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
    <li className="flex items-center gap-2 rounded-xl bg-navy-deep/50 p-3">
      <span
        className={`h-3 w-3 shrink-0 rounded-full ${reached ? "bg-gold" : "bg-slate/60"}`}
        aria-hidden
      />
      <div className="flex-1">
        <p className={reached ? "text-cream" : "text-cream/60"}>
          {isSummit ? "🏔 " : reached ? `✓ Camp ${rank} — ` : ""}
          {milestone.title}
        </p>
        {milestone.reward ? <p className="text-xs text-gold/80">{milestone.reward}</p> : null}
      </div>
      {!isSummit ? (
        <>
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={isFirst || isPending}
            aria-label={`Move "${milestone.title}" up`}
            className="h-11 min-w-11 rounded-lg text-cream/60 disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={isLast || isPending}
            aria-label={`Move "${milestone.title}" down`}
            className="h-11 min-w-11 rounded-lg text-cream/60 disabled:opacity-30"
          >
            ↓
          </button>
        </>
      ) : null}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="h-11 min-w-11 rounded-lg px-2 text-sm text-cream/60"
      >
        Edit
      </button>
      {!isSummit ? (
        <ConfirmButton
          label="Del"
          onConfirm={handleDelete}
          disabled={isPending}
          className="h-11 min-w-11 rounded-lg px-2 text-sm text-ember/80"
        />
      ) : null}
    </li>
  );
}

export function MilestoneList({
  climbId,
  milestones,
  onCampsChanged,
  onMilestoneEdited,
}: MilestoneListProps) {
  const [open, setOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  // Cosmetic display order among camps — Adam's own preference, unrelated
  // to which mountain line a camp has actually earned. The summit is
  // separate: always shown apart, never reordered.
  const camps = [...milestones].filter((m) => !m.isSummit).sort((a, b) => a.position - b.position);
  const summit = milestones.find((m) => m.isSummit) ?? null;

  // Which mountain line each camp claimed, by completion order.
  const completionRank = new Map<number, number>();
  camps
    .filter((m) => m.completedAt !== null)
    .sort((a, b) => (a.completedAt as Date).getTime() - (b.completedAt as Date).getTime())
    .forEach((m, i) => completionRank.set(m.id, i + 1));

  function handleAdd() {
    if (!newTitle.trim()) return;
    startTransition(async () => {
      const snapshot = await addMilestone(climbId, newTitle);
      onCampsChanged(snapshot);
      setNewTitle("");
    });
  }

  function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= camps.length) return;
    const reordered = [...camps];
    const a = reordered[index];
    const b = reordered[target];
    if (!a || !b) return;
    reordered[index] = b;
    reordered[target] = a;

    startTransition(async () => {
      const snapshot = await reorderMilestones(
        climbId,
        reordered.map((m) => m.id),
      );
      onCampsChanged(snapshot);
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
        {open ? "▾" : "▸"} Camps
      </button>
      {open ? (
        <div className="mt-2 flex flex-col gap-3">
          <ul className="flex flex-col gap-2">
            {camps.map((m, i) => (
              <MilestoneRow
                key={m.id}
                milestone={m}
                rank={completionRank.get(m.id) ?? null}
                isFirst={i === 0}
                isLast={i === camps.length - 1}
                onEdited={onMilestoneEdited}
                onMove={(direction) => handleMove(i, direction)}
                onCampsChanged={onCampsChanged}
              />
            ))}
          </ul>
          <div className="flex flex-col gap-2 rounded-xl bg-navy-deep/30 p-3">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="New camp name"
              className="h-11 rounded-lg border border-cream/20 bg-navy px-3 text-cream placeholder:text-cream/40"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={isPending}
              className="h-11 rounded-lg border border-gold/50 text-gold"
            >
              Add camp
            </button>
          </div>

          {summit ? (
            <div className="mt-1 flex flex-col gap-2">
              <p className="text-xs uppercase tracking-wide text-cream/40">Final goal</p>
              <ul>
                <MilestoneRow
                  milestone={summit}
                  rank={null}
                  isFirst
                  isLast
                  isSummit
                  onEdited={onMilestoneEdited}
                  onMove={() => {}}
                  onCampsChanged={onCampsChanged}
                />
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
