"use client";

import { useState } from "react";

type SetbackModalProps = {
  milestoneTitle: string | null;
  isPending: boolean;
  onConfirm: (followUpTitle: string) => void;
  onCancel: () => void;
};

export function SetbackModal({ milestoneTitle, isPending, onConfirm, onCancel }: SetbackModalProps) {
  const [followUpTitle, setFollowUpTitle] = useState("");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="setback-modal-title"
      className="fixed inset-0 z-40 flex items-end justify-center bg-navy-deep/70 p-4 sm:items-center"
    >
      <div className="w-full max-w-sm rounded-2xl border border-cream/20 bg-navy p-6 text-center">
        <h2 id="setback-modal-title" className="font-display text-2xl font-bold text-cream">
          This hasn&apos;t gone to plan
        </h2>
        <p className="mt-2 text-cream/70">
          That&apos;s alright — not every day is a climbing day.
        </p>
        {milestoneTitle ? (
          <div className="mt-4 flex flex-col gap-2 text-left">
            <label htmlFor="setback-follow-up" className="text-sm text-cream/60">
              Add a follow-up task for &ldquo;{milestoneTitle}&rdquo; (optional)
            </label>
            <input
              id="setback-follow-up"
              value={followUpTitle}
              onChange={(e) => setFollowUpTitle(e.target.value)}
              placeholder="e.g. Try again tomorrow morning"
              className="h-11 rounded-lg border border-cream/20 bg-navy-deep/50 px-3 text-cream placeholder:text-cream/40"
            />
          </div>
        ) : null}
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onConfirm(followUpTitle)}
            disabled={isPending}
            className="h-11 rounded-lg bg-amber font-semibold text-navy-deep disabled:opacity-60"
          >
            Log it
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="h-11 rounded-lg border border-cream/25 text-cream/70 disabled:opacity-60"
          >
            Never mind
          </button>
        </div>
      </div>
    </div>
  );
}
