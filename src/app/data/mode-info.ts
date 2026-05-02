/**
 * Customer-portal session mode metadata + urgency tier helpers
 * for the Home dashboard. Mirrors React MODE_INFO and urgencyOf.
 */

import { PortalMode } from "../models/types";

export interface ModeMeta {
  label: string;
  bg: string;
  text: string;
  dot: string;
  ring: string;
}

export const MODE_INFO: Record<PortalMode, ModeMeta> = {
  ai_only:     { label: "AI only",     bg: "bg-purple-50",  text: "text-purple-700",  dot: "bg-purple-500",  ring: "ring-purple-200" },
  ai_fronting: { label: "AI fronting", bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500",    ring: "ring-blue-200" },
  ai_copilot:  { label: "Co-pilot",    bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-500",   ring: "ring-amber-200" },
  human_only:  { label: "Human only",  bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", ring: "ring-emerald-200" },
  resolved:    { label: "Resolved",    bg: "bg-gray-100",   text: "text-gray-600",    dot: "bg-gray-400",    ring: "ring-gray-200" },
};

export interface UrgencyTier {
  tier: "critical" | "high" | "normal" | "low";
  color: string;
  bar: string;
  text: string;
  bg: string;
}

export function urgencyOf(waitMin: number): UrgencyTier {
  if (waitMin >= 10) return { tier: "critical", color: "bg-red-500",    bar: "bg-red-500",    text: "text-red-700",    bg: "bg-red-50/40" };
  if (waitMin >= 5)  return { tier: "high",     color: "bg-amber-500",  bar: "bg-amber-500",  text: "text-amber-700",  bg: "bg-amber-50/40" };
  if (waitMin >= 1)  return { tier: "normal",   color: "bg-blue-500",   bar: "bg-blue-500",   text: "text-blue-700",   bg: "bg-blue-50/40" };
  return { tier: "low", color: "bg-gray-400", bar: "bg-gray-300", text: "text-gray-600", bg: "" };
}
