"use client";

import { useActionState } from "react";
import { login, type LoginState } from "../actions/auth";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="username" className="text-sm text-cream/80">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          className="h-12 rounded-lg border border-cream/20 bg-navy-deep/60 px-4 text-base text-cream placeholder:text-cream/40"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm text-cream/80">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-12 rounded-lg border border-cream/20 bg-navy-deep/60 px-4 text-base text-cream placeholder:text-cream/40"
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-ember">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="mt-2 h-12 min-h-11 rounded-lg bg-amber font-display text-lg font-semibold text-navy-deep transition-opacity disabled:opacity-60"
      >
        {isPending ? "Checking..." : "Begin the climb"}
      </button>
    </form>
  );
}
