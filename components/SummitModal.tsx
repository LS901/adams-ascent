"use client";

import { useState, useTransition } from "react";
import { completeClimb, recordSummitReward, startNewClimb } from "../actions/climbs";

type Stage = "reward" | "choice" | "new-climb-form";

type SummitModalProps = {
  climbId: number;
  onCompleted: () => void;
  onNewClimbStarted: () => void;
};

export function SummitModal({ climbId, onCompleted, onNewClimbStarted }: SummitModalProps) {
  const [stage, setStage] = useState<Stage>("reward");
  const [reward, setReward] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleRewardSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!reward.trim()) return;
    startTransition(async () => {
      await recordSummitReward(climbId, reward);
      setStage("choice");
    });
  }

  function handleDescend() {
    startTransition(async () => {
      await completeClimb(climbId);
      onCompleted();
    });
  }

  function handleNewClimbSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!newTitle.trim()) return;
    startTransition(async () => {
      await startNewClimb(newTitle, climbId);
      onNewClimbStarted();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="summit-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/85 p-4"
    >
      <div className="w-full max-w-sm rounded-2xl border-2 border-gold bg-navy p-6 text-center">
        {stage === "reward" ? (
          <form onSubmit={handleRewardSubmit} className="flex flex-col gap-4">
            <p className="text-sm text-gold">Summit reached</p>
            <h2 id="summit-modal-title" className="font-display text-3xl font-bold text-cream">
              You made it.
            </h2>
            <p className="text-cream/80">
              This is the big one. What are you giving yourself for it?
            </p>
            <input
              type="text"
              value={reward}
              onChange={(e) => setReward(e.target.value)}
              placeholder="e.g. A weekend away"
              required
              autoFocus
              className="h-12 rounded-lg border border-cream/25 bg-navy-deep/60 px-4 text-cream placeholder:text-cream/40"
            />
            <button
              type="submit"
              disabled={isPending}
              className="h-12 rounded-lg bg-gold font-display text-lg font-semibold text-navy-deep disabled:opacity-60"
            >
              Lock it in
            </button>
          </form>
        ) : null}

        {stage === "choice" ? (
          <div className="flex flex-col gap-4">
            <h2 id="summit-modal-title" className="font-display text-2xl font-bold text-cream">
              Adam sees another mountain in the distance.
            </h2>
            <p className="text-cream/80">Does he keep going, or begin his descent?</p>
            <button
              type="button"
              onClick={() => setStage("new-climb-form")}
              className="h-12 rounded-lg bg-pine font-display text-lg font-semibold text-cream"
            >
              Keep going
            </button>
            <button
              type="button"
              onClick={handleDescend}
              disabled={isPending}
              className="h-12 rounded-lg border border-cream/30 text-cream/80 disabled:opacity-60"
            >
              Begin descent
            </button>
          </div>
        ) : null}

        {stage === "new-climb-form" ? (
          <form onSubmit={handleNewClimbSubmit} className="flex flex-col gap-4">
            <h2 id="summit-modal-title" className="font-display text-2xl font-bold text-cream">
              Name the next mountain.
            </h2>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Marathon training"
              required
              autoFocus
              className="h-12 rounded-lg border border-cream/25 bg-navy-deep/60 px-4 text-cream placeholder:text-cream/40"
            />
            <button
              type="submit"
              disabled={isPending}
              className="h-12 rounded-lg bg-gold font-display text-lg font-semibold text-navy-deep disabled:opacity-60"
            >
              Begin the next climb
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
