"use client";

import dynamic from "next/dynamic";

/**
 * Client-only, lazily loaded site map of the Plan tab (MapLibre lives in its
 * own chunk, shared with the national map).
 */
export const SitePlanMapLoader = dynamic(() => import("./SitePlanMap"), {
  ssr: false,
  loading: () => <div aria-hidden="true" className="h-full w-full bg-bg" />,
});
