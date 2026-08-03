"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetAllData } from "../actions/climbs";
import { ConfirmButton } from "./ConfirmButton";

export function ResetButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleReset() {
    startTransition(async () => {
      await resetAllData();
      router.refresh();
    });
  }

  return (
    <ConfirmButton
      label="Start over"
      confirmLabel="Erase everything?"
      onConfirm={handleReset}
      disabled={isPending}
      className="h-11 min-w-11 px-2 text-sm text-cream/40"
    />
  );
}
