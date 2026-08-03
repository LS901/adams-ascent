"use client";

import type { Milestone } from "../lib/db/schema";

type MilestonePopupModalProps = {
  milestone: Milestone;
  onDismiss: () => void;
};

export function MilestonePopupModal({ milestone, onDismiss }: MilestonePopupModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="milestone-popup-title"
      className="fixed inset-0 z-40 flex items-end justify-center bg-navy-deep/70 p-4 sm:items-center"
    >
      <div className="w-full max-w-sm rounded-2xl border border-gold/40 bg-navy p-6 text-center">
        <p className="text-sm text-gold">Camp reached</p>
        <h2 id="milestone-popup-title" className="mt-1 font-display text-2xl font-bold text-cream">
          {milestone.title}
        </h2>
        {milestone.reward ? (
          <p className="mt-3 text-cream/85">{milestone.reward}</p>
        ) : (
          <p className="mt-3 text-cream/60">Onward.</p>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="mt-6 h-11 w-full rounded-lg bg-gold font-display text-navy-deep font-semibold"
        >
          Keep climbing
        </button>
      </div>
    </div>
  );
}
