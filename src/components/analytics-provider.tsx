"use client";

import { useEffect } from "react";
import { initAnalytics, identifyUser } from "@/lib/analytics/browser";

/**
 * Mount-time PostHog bootstrap. Renders nothing.
 *
 * `initAnalytics()` self-gates on stored consent, so mounting this everywhere
 * (root layout) is safe — nothing is captured until the user accepts. When a
 * `userId` is passed (authenticated portal layout), the browser is identified
 * by internal user id after init.
 */
export function AnalyticsProvider({ userId }: { userId?: string }) {
  useEffect(() => {
    initAnalytics();
    if (userId) identifyUser(userId);
  }, [userId]);
  return null;
}
