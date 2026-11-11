"use client";

import * as React from "react";

/** true на узких экранах (телефон) — графики сокращают подписи осей. */
export function useNarrow(query = "(max-width: 640px)"): boolean {
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return narrow;
}
