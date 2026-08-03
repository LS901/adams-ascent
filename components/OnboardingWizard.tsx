"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Climb, Milestone } from "../lib/db/schema";
import { completeOnboarding } from "../actions/climbs";

type OnboardingWizardProps = {
  climb: Climb;
  initialMilestones: Milestone[];
  isFirstEverClimb: boolean;
};

type CampDraft = {
  tempId: string;
  title: string;
  reward: string;
};

type TaskDraft = {
  tempId: string;
  title: string;
  campTempId: string;
};

let tempIdCounter = 0;
function nextTempId(): string {
  tempIdCounter += 1;
  return `tmp-${tempIdCounter}`;
}

type Step = "welcome" | "camps" | "tasks";

export function OnboardingWizard({ climb, initialMilestones, isFirstEverClimb }: OnboardingWizardProps) {
  const router = useRouter();
  const initialCamps = initialMilestones.filter((m) => !m.isSummit).sort((a, b) => a.position - b.position);
  const initialSummit = initialMilestones.find((m) => m.isSummit) ?? null;

  const [step, setStep] = useState<Step>("welcome");
  const [camps, setCamps] = useState<CampDraft[]>(
    initialCamps.map((m) => ({ tempId: nextTempId(), title: m.title, reward: m.reward ?? "" })),
  );
  const [summit, setSummit] = useState<CampDraft>(() => ({
    tempId: nextTempId(),
    title: initialSummit?.title ?? "Summit: first client",
    reward: initialSummit?.reward ?? "",
  }));
  const [tasksDraft, setTasksDraft] = useState<TaskDraft[]>([]);
  const [isPending, startTransition] = useTransition();

  function finish(finalCamps: CampDraft[], finalSummit: CampDraft, finalTasks: TaskDraft[]) {
    const allCamps = [...finalCamps, finalSummit];
    const milestonesInput = finalCamps.map((c) => ({ title: c.title, reward: c.reward }));
    const summitInput = { title: finalSummit.title, reward: finalSummit.reward };
    const tasksInput = finalTasks
      .filter((t) => t.title.trim())
      .map((t) => ({
        title: t.title,
        campIndex: Math.max(
          0,
          allCamps.findIndex((c) => c.tempId === t.campTempId),
        ),
      }));

    startTransition(async () => {
      await completeOnboarding(climb.id, milestonesInput, summitInput, tasksInput);
      router.refresh();
    });
  }

  function updateSummit(fields: Partial<Pick<CampDraft, "title" | "reward">>) {
    setSummit((prev) => ({ ...prev, ...fields }));
  }

  function updateCamp(tempId: string, fields: Partial<Pick<CampDraft, "title" | "reward">>) {
    setCamps((prev) => prev.map((c) => (c.tempId === tempId ? { ...c, ...fields } : c)));
  }

  function removeCamp(tempId: string) {
    setCamps((prev) => prev.filter((c) => c.tempId !== tempId));
  }

  function moveCamp(tempId: string, direction: -1 | 1) {
    setCamps((prev) => {
      const index = prev.findIndex((c) => c.tempId === tempId);
      const swapWith = index + direction;
      if (index < 0 || swapWith < 0 || swapWith >= prev.length) return prev;
      const next = [...prev];
      const a = next[index];
      const b = next[swapWith];
      if (!a || !b) return prev;
      next[index] = b;
      next[swapWith] = a;
      return next;
    });
  }

  function addCamp() {
    setCamps((prev) => [...prev, { tempId: nextTempId(), title: "", reward: "" }]);
  }

  function updateTaskTitle(tempId: string, title: string) {
    setTasksDraft((prev) => prev.map((t) => (t.tempId === tempId ? { ...t, title } : t)));
  }

  function addTaskField(campTempId: string) {
    setTasksDraft((prev) => [...prev, { tempId: nextTempId(), title: "", campTempId }]);
  }

  function removeTaskField(tempId: string) {
    setTasksDraft((prev) => prev.filter((t) => t.tempId !== tempId));
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-6 py-12">
      {step === "welcome" ? (
        <div className="flex max-w-sm flex-col items-center gap-6 text-center">
          <h1 className="font-display text-3xl font-bold text-cream">Adam&apos;s Ascent</h1>
          {isFirstEverClimb ? (
            <p className="text-cream/80">
              This is your climb, at your pace. Let&apos;s set up the camps along the way, and a
              few things to work on to get moving. Nothing here is final — you can change it all
              any time.
            </p>
          ) : (
            <p className="text-cream/80">
              Onto the next mountain. Let&apos;s set the camps for &ldquo;{climb.title}&rdquo;.
            </p>
          )}
          <button
            type="button"
            onClick={() => setStep("camps")}
            className="h-12 w-full rounded-lg bg-amber font-display text-lg font-semibold text-navy-deep"
          >
            Let&apos;s go
          </button>
        </div>
      ) : null}

      {step === "camps" ? (
        <div className="flex w-full max-w-sm flex-col gap-4">
          <h2 className="font-display text-2xl font-bold text-cream">The camps along the way</h2>
          <p className="text-sm text-cream/70">
            Rename, reorder, remove, or add your own. A reward is optional. Work on them in
            whatever order you like — the mountain reflects whichever camp you actually finish
            first, not this list order.
          </p>
          <ul className="flex flex-col gap-3">
            {camps.map((camp, i) => (
              <li key={camp.tempId} className="flex flex-col gap-2 rounded-xl bg-navy/50 p-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-cream/40">{i + 1}</span>
                  <input
                    value={camp.title}
                    onChange={(e) => updateCamp(camp.tempId, { title: e.target.value })}
                    placeholder="Camp name"
                    className="h-11 flex-1 rounded-lg border border-cream/20 bg-navy-deep/50 px-3 text-cream placeholder:text-cream/40"
                  />
                </div>
                <input
                  value={camp.reward}
                  onChange={(e) => updateCamp(camp.tempId, { reward: e.target.value })}
                  placeholder="Reward (optional)"
                  className="h-11 rounded-lg border border-cream/20 bg-navy-deep/50 px-3 text-cream placeholder:text-cream/40"
                />
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => moveCamp(camp.tempId, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                    className="h-11 min-w-11 rounded-lg text-cream/60 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveCamp(camp.tempId, 1)}
                    disabled={i === camps.length - 1}
                    aria-label="Move down"
                    className="h-11 min-w-11 rounded-lg text-cream/60 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCamp(camp.tempId)}
                    className="h-11 min-w-11 rounded-lg text-ember/80"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={addCamp}
            className="h-11 rounded-lg border border-cream/25 text-cream/70"
          >
            Add a camp
          </button>

          <div className="mt-2 flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wide text-cream/40">Final goal</p>
            <div className="flex flex-col gap-2 rounded-xl border border-gold/30 bg-navy/50 p-3">
              <input
                value={summit.title}
                onChange={(e) => updateSummit({ title: e.target.value })}
                placeholder="Summit name"
                className="h-11 rounded-lg border border-cream/20 bg-navy-deep/50 px-3 text-cream placeholder:text-cream/40"
              />
              <input
                value={summit.reward}
                onChange={(e) => updateSummit({ reward: e.target.value })}
                placeholder="Reward (optional)"
                className="h-11 rounded-lg border border-cream/20 bg-navy-deep/50 px-3 text-cream placeholder:text-cream/40"
              />
              <p className="text-xs text-cream/50">
                🏔 This is the one true summit — always last, and its order never changes, no
                matter how many camps come before it.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setStep("tasks")}
            disabled={!summit.title.trim()}
            className="h-12 rounded-lg bg-amber font-display text-lg font-semibold text-navy-deep disabled:opacity-60"
          >
            Continue
          </button>
        </div>
      ) : null}

      {step === "tasks" ? (
        <div className="flex w-full max-w-sm flex-col gap-4">
          <h2 className="font-display text-2xl font-bold text-cream">A few things to start with</h2>
          <p className="text-sm text-cream/70">
            Just a handful is enough — more can be added any time from the dashboard.
          </p>

          {[...camps, summit].map((camp) => {
            const campTaskDrafts = tasksDraft.filter((t) => t.campTempId === camp.tempId);
            return (
              <div key={camp.tempId} className="flex flex-col gap-2 rounded-xl bg-navy/40 p-3">
                <h3 className="font-display text-base text-cream">{camp.title || "Untitled camp"}</h3>
                {campTaskDrafts.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {campTaskDrafts.map((task) => (
                      <li key={task.tempId} className="flex gap-2">
                        <input
                          value={task.title}
                          onChange={(e) => updateTaskTitle(task.tempId, e.target.value)}
                          placeholder="e.g. Look up local PT courses"
                          className="h-11 flex-1 rounded-lg border border-cream/20 bg-navy-deep/50 px-3 text-cream placeholder:text-cream/40"
                        />
                        <button
                          type="button"
                          onClick={() => removeTaskField(task.tempId)}
                          aria-label="Remove task"
                          className="h-11 min-w-11 rounded-lg text-cream/40"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <button
                  type="button"
                  onClick={() => addTaskField(camp.tempId)}
                  className="h-11 rounded-lg border border-cream/25 text-sm text-cream/70"
                >
                  Add another
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => finish(camps, summit, tasksDraft)}
            disabled={isPending}
            className="h-12 rounded-lg bg-amber font-display text-lg font-semibold text-navy-deep disabled:opacity-60"
          >
            Start the climb
          </button>
          <button
            type="button"
            onClick={() => finish(camps, summit, [])}
            disabled={isPending}
            className="h-11 text-sm text-cream/50"
          >
            Skip for now
          </button>
        </div>
      ) : null}

      {step !== "welcome" ? (
        <button
          type="button"
          onClick={() => finish(camps, summit, tasksDraft)}
          disabled={isPending}
          className="flex h-11 items-center justify-center px-2 text-xs text-cream/30"
        >
          Skip setup and go to the dashboard
        </button>
      ) : null}
    </main>
  );
}
