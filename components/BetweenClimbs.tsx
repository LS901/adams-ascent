"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Climb } from "../lib/db/schema";
import { startNewClimb } from "../actions/climbs";
import { logout } from "../actions/auth";
import { ResetButton } from "./ResetButton";

type BetweenClimbsProps = {
  previousClimb: Climb | null;
};

export function BetweenClimbs({ previousClimb }: BetweenClimbsProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleStart() {
    if (!title.trim()) return;
    startTransition(async () => {
      await startNewClimb(title, previousClimb?.id);
      router.refresh();
    });
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-2">
        <h1 className="font-display text-3xl font-bold text-cream">Adam&apos;s Ascent</h1>
        {previousClimb ? (
          <p className="max-w-xs text-cream/70">
            You reached the end of &ldquo;{previousClimb.title}&rdquo;. Whenever you&apos;re
            ready, there&apos;s another mountain waiting.
          </p>
        ) : (
          <p className="max-w-xs text-cream/70">Ready for your next climb?</p>
        )}
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Name your next mountain"
          className="h-12 rounded-lg border border-cream/25 bg-navy-deep/50 px-4 text-cream placeholder:text-cream/40"
        />
        <button
          type="button"
          onClick={handleStart}
          disabled={isPending}
          className="h-12 rounded-lg bg-amber font-display text-lg font-semibold text-navy-deep disabled:opacity-60"
        >
          Begin the climb
        </button>
      </div>

      <div className="flex items-center gap-4">
        <form action={logout}>
          <button type="submit" className="flex h-11 min-w-11 items-center justify-center text-sm text-cream/40">
            Log out
          </button>
        </form>
        {previousClimb ? <ResetButton /> : null}
      </div>
    </main>
  );
}
