"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { logBlip } from "../actions/blips";
import { addTask } from "../actions/tasks";
import type { Blip } from "../lib/db/schema";
import type { ClimbCampsSnapshot } from "../actions/milestones";
import { SetbackModal } from "./SetbackModal";

type BlipButtonProps = {
  climbId: number;
  milestoneId: number | null;
  milestoneTitle: string | null;
  onLogged: (altitude: number, blip: Blip) => void;
  onTaskAdded: (snapshot: { altitude: number } & ClimbCampsSnapshot) => void;
};

const CAP_REACHED_MESSAGE = "You've already had your dip for today — that's plenty.";
const LOGGED_MESSAGE = "That's alright — not every day is a climbing day.";

export function BlipButton({ climbId, milestoneId, milestoneTitle, onLogged, onTaskAdded }: BlipButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function handleConfirm(followUpTitle: string) {
    startTransition(async () => {
      const result = await logBlip(climbId);
      if (result.ok) {
        onLogged(result.altitude, result.blip);
        setMessage(LOGGED_MESSAGE);
      } else {
        setMessage(CAP_REACHED_MESSAGE);
      }

      const trimmedFollowUp = followUpTitle.trim();
      if (trimmedFollowUp && milestoneId !== null) {
        const snapshot = await addTask(milestoneId, trimmedFollowUp);
        onTaskAdded(snapshot);
      }

      setModalOpen(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(null), 4000);
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        disabled={isPending}
        className="h-11 rounded-lg border border-cream/25 px-4 text-sm text-cream/80 disabled:opacity-60"
      >
        This hasn&apos;t gone to plan
      </button>
      {message ? (
        <p role="status" className="text-center text-sm text-cream/70">
          {message}
        </p>
      ) : null}
      {modalOpen ? (
        <SetbackModal
          milestoneTitle={milestoneTitle}
          isPending={isPending}
          onConfirm={handleConfirm}
          onCancel={() => setModalOpen(false)}
        />
      ) : null}
    </div>
  );
}
