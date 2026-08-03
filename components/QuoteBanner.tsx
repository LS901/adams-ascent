"use client";

import { useEffect, useState } from "react";
import quotes from "../lib/quotes.json";

const FALLBACK_QUOTE = quotes[0] ?? "";

export function QuoteBanner() {
  const [quote, setQuote] = useState(FALLBACK_QUOTE);

  // Picked client-side, after mount, so the server-rendered markup and the
  // first client render always match — Math.random() can't run during
  // render without risking a hydration mismatch.
  useEffect(() => {
    const index = Math.floor(Math.random() * quotes.length);
    // Deliberate one-time client-only randomization, not a state sync — an
    // extra render here is the point, since it's what avoids an SSR/client
    // hydration mismatch on the random pick itself.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuote(quotes[index] ?? FALLBACK_QUOTE);
  }, []);

  return (
    <p className="font-display text-center text-lg italic text-cream/90 px-4">
      &ldquo;{quote}&rdquo;
    </p>
  );
}
