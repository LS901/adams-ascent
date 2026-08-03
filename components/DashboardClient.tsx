"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Blip, Climb, Milestone, Task } from "../lib/db/schema";
import { addTask, completeTask, undoTaskStatus, type AltitudeMutationResult } from "../actions/tasks";
import { reachSummit } from "../actions/climbs";
import { computeAltitudeHistory } from "../lib/altitude";
import { evenlySpacedAltitudes } from "../lib/campMath";
import { MAX_ALTITUDE, UNDO_WINDOW_SECONDS } from "../lib/constants";
import { MountainScene, type MountainLine } from "./MountainScene";
import { QuoteBanner } from "./QuoteBanner";
import { BlipButton } from "./BlipButton";
import { MilestoneList } from "./MilestoneList";
import { HistoryList } from "./HistoryList";
import { MilestonePopupModal } from "./MilestonePopupModal";
import { SummitModal } from "./SummitModal";
import { TaskRow } from "./TaskRow";
import { logout } from "../actions/auth";
import type { ClimbCampsSnapshot } from "../actions/milestones";
import { ResetButton } from "./ResetButton";

type DashboardClientProps = {
  climb: Climb;
  initialTasks: Task[];
  initialMilestones: Milestone[];
  initialBlips: Blip[];
  initialAltitude: number;
};

type CampCompletionSignal = {
  camp: Milestone | null;
  summit: Milestone | null;
};

export function DashboardClient({
  climb,
  initialTasks,
  initialMilestones,
  initialBlips,
  initialAltitude,
}: DashboardClientProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [milestones, setMilestones] = useState(initialMilestones);
  const [blips, setBlips] = useState(initialBlips);
  const [altitude, setAltitude] = useState(initialAltitude);
  const [undoableIds, setUndoableIds] = useState<Set<number>>(new Set());
  const [milestonePopupQueue, setMilestonePopupQueue] = useState<Milestone[]>([]);
  const [activeSummit, setActiveSummit] = useState<Milestone | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const undoTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Cosmetic only — Adam's intended working order among camps. Every camp
  // is always freely selectable; there's no locking. The summit is a
  // separate, fixed milestone — never part of this reorderable list.
  const camps = useMemo(
    () => [...milestones].filter((m) => !m.isSummit).sort((a, b) => a.position - b.position),
    [milestones],
  );
  const summit = useMemo(() => milestones.find((m) => m.isSummit) ?? null, [milestones]);

  // The summit is locked until every camp is done — vacuously true if there
  // are no camps at all.
  const allCampsComplete = useMemo(() => camps.every((m) => m.completedAt !== null), [camps]);

  const selectedMilestone = useMemo(() => {
    if (selectedMilestoneId !== null) {
      const target = milestones.find((m) => m.id === selectedMilestoneId);
      if (target && !(target.isSummit && !allCampsComplete)) return target;
    }
    return camps[0] ?? summit ?? null;
  }, [selectedMilestoneId, milestones, camps, summit, allCampsComplete]);

  // Which mountain line (1st, 2nd, ...) each completed camp claimed, purely
  // by how soon it finished — not by position or creation order. The
  // summit's line is always the last one, never earned this way.
  const completionRank = useMemo(() => {
    const ranks = new Map<number, number>();
    camps
      .filter((m) => m.completedAt !== null)
      .sort((a, b) => (a.completedAt as Date).getTime() - (b.completedAt as Date).getTime())
      .forEach((m, i) => ranks.set(m.id, i + 1));
    return ranks;
  }, [camps]);

  const mountainLines: MountainLine[] = useMemo(() => {
    const totalSlots = camps.length + (summit ? 1 : 0);
    const thresholds = evenlySpacedAltitudes(totalSlots, MAX_ALTITUDE);
    const completedCampsInOrder = camps
      .filter((m) => m.completedAt !== null)
      .sort((a, b) => (a.completedAt as Date).getTime() - (b.completedAt as Date).getTime());
    return thresholds.map((threshold, i) => {
      if (summit && i === thresholds.length - 1) {
        return { threshold, milestone: summit.completedAt !== null ? summit : null };
      }
      return { threshold, milestone: completedCampsInOrder[i] ?? null };
    });
  }, [camps, summit]);

  const campTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.milestoneId === selectedMilestone?.id && (t.status === "pending" || undoableIds.has(t.id)),
      ),
    [tasks, selectedMilestone, undoableIds],
  );
  const resting = useMemo(() => tasks.every((t) => t.status === "done"), [tasks]);

  const history = useMemo(
    () => computeAltitudeHistory(tasks, blips, milestones.length),
    [tasks, blips, milestones.length],
  );

  function markUndoable(taskId: number) {
    setUndoableIds((prev) => new Set(prev).add(taskId));
    const existing = undoTimers.current.get(taskId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      setUndoableIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
      undoTimers.current.delete(taskId);
    }, UNDO_WINDOW_SECONDS * 1000);
    undoTimers.current.set(taskId, timer);
  }

  function clearUndoable(taskId: number) {
    const existing = undoTimers.current.get(taskId);
    if (existing) clearTimeout(existing);
    undoTimers.current.delete(taskId);
    setUndoableIds((prev) => {
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });
  }

  function handleCampCompletion({ camp, summit }: CampCompletionSignal) {
    if (camp) {
      setMilestones((prev) => prev.map((m) => (m.id === camp.id ? camp : m)));
      setMilestonePopupQueue((prev) => [...prev, camp]);
    }
    if (summit) {
      setMilestones((prev) => prev.map((m) => (m.id === summit.id ? summit : m)));
      setActiveSummit(summit);
    }
  }

  function handleComplete(taskId: number) {
    startTransition(async () => {
      const result = await completeTask(taskId);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? result.task : t)));
      setAltitude(result.altitude);
      markUndoable(taskId);
      handleCampCompletion(result);
    });
  }

  function handleUndo(taskId: number) {
    startTransition(async () => {
      const result = await undoTaskStatus(taskId);
      if (result.ok) {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? result.task : t)));
        setAltitude(result.altitude);
      }
      clearUndoable(taskId);
    });
  }

  function handleTaskDeleted(taskId: number, result: AltitudeMutationResult & CampCompletionSignal) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setAltitude(result.altitude);
    clearUndoable(taskId);
    handleCampCompletion(result);
  }

  function handleTaskEdited(task: Task) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
  }

  function handleAddTask() {
    if (!newTaskTitle.trim() || selectedMilestone === null) return;
    startTransition(async () => {
      const snapshot = await addTask(selectedMilestone.id, newTaskTitle);
      setMilestones(snapshot.milestones);
      setTasks(snapshot.tasks);
      setAltitude(snapshot.altitude);
      setNewTaskTitle("");
    });
  }

  function handleReachSummit() {
    if (!summit) return;
    startTransition(async () => {
      const result = await reachSummit(climb.id);
      setAltitude(result.altitude);
      setMilestones((prev) => prev.map((m) => (m.id === result.summit.id ? result.summit : m)));
      setActiveSummit(result.summit);
    });
  }

  function handleTaskAdded(snapshot: { altitude: number } & ClimbCampsSnapshot) {
    setMilestones(snapshot.milestones);
    setTasks(snapshot.tasks);
    setAltitude(snapshot.altitude);
  }

  function handleCampsChanged(snapshot: ClimbCampsSnapshot) {
    setMilestones(snapshot.milestones);
    setTasks(snapshot.tasks);
  }

  function handleMilestoneEdited(milestone: Milestone) {
    setMilestones((prev) => prev.map((m) => (m.id === milestone.id ? milestone : m)));
  }

  function handleBlipLogged(newAltitude: number, blip: Blip) {
    setAltitude(newAltitude);
    setBlips((prev) => [...prev, blip]);
  }

  function handleTaskRestored(snapshot: { altitude: number } & ClimbCampsSnapshot) {
    setMilestones(snapshot.milestones);
    setTasks(snapshot.tasks);
    setAltitude(snapshot.altitude);
  }

  const currentPopup = milestonePopupQueue[0] ?? null;

  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-4 py-8">
      <header className="flex w-full max-w-sm items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-cream">Adam&apos;s Ascent</h1>
        <div className="flex items-center gap-1">
          <ResetButton />
          <form action={logout}>
            <button type="submit" className="flex h-11 min-w-11 items-center justify-center text-sm text-cream/50">
              Log out
            </button>
          </form>
        </div>
      </header>

      <QuoteBanner />

      <MountainScene altitude={altitude} history={history} lines={mountainLines} resting={resting} />

      <section className="w-full max-w-sm flex flex-col gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Camps">
          {camps.map((m) => {
            const rank = completionRank.get(m.id);
            const selected = m.id === selectedMilestone?.id;
            return (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setSelectedMilestoneId(m.id)}
                className={`h-11 shrink-0 rounded-lg border px-3 text-sm whitespace-nowrap ${
                  selected
                    ? "border-gold bg-gold/10 text-gold"
                    : rank
                      ? "border-cream/20 text-cream/70"
                      : "border-cream/10 text-cream/50"
                }`}
              >
                {rank ? `✓#${rank} ` : ""}
                {m.title}
              </button>
            );
          })}
          {summit ? (
            <button
              type="button"
              role="tab"
              aria-selected={summit.id === selectedMilestone?.id}
              disabled={!allCampsComplete}
              onClick={() => setSelectedMilestoneId(summit.id)}
              className={`h-11 shrink-0 rounded-lg border-2 px-3 text-sm whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-40 ${
                summit.id === selectedMilestone?.id
                  ? "border-gold bg-gold/10 text-gold"
                  : summit.completedAt
                    ? "border-gold/60 text-gold/80"
                    : "border-gold/30 text-cream/60"
              }`}
            >
              {!allCampsComplete ? "🔒 " : summit.completedAt ? "✓ " : "🏔 "}
              {summit.title}
            </button>
          ) : null}
        </div>
        {!allCampsComplete ? (
          <p className="text-xs text-cream/40">Finish every camp to unlock the summit.</p>
        ) : null}

        <h2 className="font-display text-lg text-cream">{selectedMilestone?.title ?? "Camp"}</h2>
        {campTasks.length === 0 ? (
          <p className="text-cream/60 text-sm">
            Resting at camp. No pending tasks — add one below whenever you&apos;re ready.
          </p>
        ) : null}
        <ul className="flex flex-col gap-2">
          {campTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              isUndoable={undoableIds.has(task.id)}
              onComplete={handleComplete}
              onUndo={handleUndo}
              onUpdated={handleTaskEdited}
              onDeleted={handleTaskDeleted}
            />
          ))}
        </ul>

        {selectedMilestone?.isSummit && selectedMilestone.completedAt === null ? (
          <button
            type="button"
            onClick={handleReachSummit}
            disabled={isPending}
            className="h-12 rounded-lg bg-gold font-display text-lg font-semibold text-navy-deep disabled:opacity-60"
          >
            Reach the Summit
          </button>
        ) : null}

        <div className="flex gap-2">
          <input
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddTask();
            }}
            placeholder={`Add a task to "${selectedMilestone?.title ?? ""}"`}
            className="h-11 flex-1 rounded-lg border border-cream/20 bg-navy-deep/50 px-3 text-cream placeholder:text-cream/40"
          />
          <button
            type="button"
            onClick={handleAddTask}
            disabled={isPending || selectedMilestone === null}
            className="h-11 rounded-lg bg-amber px-4 font-semibold text-navy-deep disabled:opacity-60"
          >
            Add
          </button>
        </div>
      </section>

      <BlipButton
        climbId={climb.id}
        milestoneId={selectedMilestone?.id ?? null}
        milestoneTitle={selectedMilestone?.title ?? null}
        onLogged={handleBlipLogged}
        onTaskAdded={handleTaskAdded}
      />

      <MilestoneList
        climbId={climb.id}
        milestones={milestones}
        onCampsChanged={handleCampsChanged}
        onMilestoneEdited={handleMilestoneEdited}
      />

      <HistoryList tasks={tasks} onDeleted={handleTaskDeleted} onRestored={handleTaskRestored} />

      {currentPopup ? (
        <MilestonePopupModal
          milestone={currentPopup}
          onDismiss={() => setMilestonePopupQueue((prev) => prev.slice(1))}
        />
      ) : null}

      {activeSummit ? (
        <SummitModal
          climbId={climb.id}
          onCompleted={() => router.refresh()}
          onNewClimbStarted={() => router.refresh()}
        />
      ) : null}
    </main>
  );
}
