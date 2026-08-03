"use client";

import { useEffect, useRef, useState } from "react";

type ConfirmButtonProps = {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
};

/**
 * A button that requires a second tap within a few seconds to actually fire
 * — just enough friction to stop an accidental delete, without a full modal.
 */
export function ConfirmButton({
  label,
  confirmLabel = "Sure?",
  onConfirm,
  disabled,
  className,
}: ConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function handleClick() {
    if (!confirming) {
      setConfirming(true);
      timer.current = setTimeout(() => setConfirming(false), 3000);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setConfirming(false);
    onConfirm();
  }

  return (
    <button type="button" onClick={handleClick} disabled={disabled} className={className}>
      {confirming ? confirmLabel : label}
    </button>
  );
}
