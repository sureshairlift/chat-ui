/**
 * Fabricates realistic-looking file contents for the FilePreviewOverlay.
 *
 * The seed data ships attachments as metadata-only ({ name, size, ext }),
 * so we generate plausible bodies on the fly. Same input always yields
 * the same output (deterministic from the filename) so a refresh shows
 * identical preview text.
 */

/* ------------------------------------------------------------------ Hashing */

/** Tiny FNV-1a 32-bit hash. Used as a deterministic seed. */
function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** Mulberry32 PRNG seeded from the filename for stable per-file content. */
function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, arr: T[]): T {
  return arr[Math.floor(rand() * arr.length) % arr.length];
}

/* ------------------------------------------------------------------ Synth pools */

const FIRST_NAMES = ["Shiron", "Ram", "Ashwath", "Aatif", "Rajkumar", "Anand",
  "Sunil", "Simi", "Jane", "Marc", "Priya", "Karthik", "Niraj"];
const LAST_NAMES  = ["Airlift", "Carter", "Rivera", "Murthy", "Nair", "Iyer",
  "Sharma", "Mehta"];
const STATUSES = ["open", "in-progress", "done", "blocked", "review"];
const PRIORITIES = ["P0", "P1", "P2", "P3"];
const TICKETS = ["CRM-4380", "CRM-4421", "ENG-1284", "ENG-1502", "INF-902",
  "OPS-71", "DESIGN-308"];

/* ------------------------------------------------------------------ Public API */

export interface PreviewContent {
  /** What kind of body the renderer should display. */
  kind:
    | "text"     // raw plaintext
    | "code"     // syntax-style monospace
    | "markdown" // simple markdown render
    | "json"     // pretty-printed JSON
    | "csv"      // tabular rows
    | "table"    // tabular rows from xlsx (rendered same as CSV)
    | "doc"      // styled paragraph "page" — Word/Pages
    | "pdf"      // styled multi-page mock
    | "slides"   // styled slide stack — PowerPoint/Keynote
    | "archive"  // file listing
    | "binary";  // no preview, download only
  body?: string;
  rows?: string[][];
  /** For "code", hints the language label shown at top of preview. */
  language?: string;
  /** For doc/pdf: a list of paragraphs. For slides: list of slides. */
  pages?: string[][];
  /** For archive: simulated entries. */
  entries?: { name: string; size: string }[];
}

/**
 * Build a deterministic, plausible preview body for a given attachment.
 * Falls back to "binary" for anything we can't render.
 */
export function synthesizeFileContent(name: string, ext: string): PreviewContent {
  const e = (ext || "").toLowerCase();
  const seed = hashStr(`${name}|${e}`);
  const r = rng(seed);

  /* ----- Plain text-ish ----- */
  if (e === "txt" || e === "rtf") {
    return { kind: "text", body: synthLetter(r, name) };
  }
  if (e === "log") {
    return { kind: "text", body: synthLog(r) };
  }
  if (e === "env") {
    return { kind: "code", language: "env", body: synthEnv() };
  }

  /* ----- Markdown ----- */
  if (e === "md") {
    return { kind: "markdown", body: synthMarkdown(r, name) };
  }

  /* ----- JSON ----- */
  if (e === "json") {
    return { kind: "json", body: synthJson(r, name) };
  }

  /* ----- YAML ----- */
  if (e === "yml" || e === "yaml") {
    return { kind: "code", language: "yaml", body: synthYaml(r) };
  }

  /* ----- CSV ----- */
  if (e === "csv") {
    return { kind: "csv", rows: synthTable(r, name) };
  }

  /* ----- Spreadsheets — render as table ----- */
  if (e === "xls" || e === "xlsx" || e === "numbers") {
    return { kind: "table", rows: synthTable(r, name) };
  }

  /* ----- Word / Pages ----- */
  if (e === "doc" || e === "docx" || e === "pages") {
    return { kind: "doc", pages: [synthDocParas(r, name)] };
  }

  /* ----- PDF — fake multi-page ----- */
  if (e === "pdf") {
    const pageCount = 2 + Math.floor(r() * 2);
    const pages: string[][] = [];
    for (let i = 0; i < pageCount; i++) pages.push(synthDocParas(r, name));
    return { kind: "pdf", pages };
  }

  /* ----- PowerPoint / Keynote ----- */
  if (e === "ppt" || e === "pptx" || e === "key") {
    return { kind: "slides", pages: synthSlides(r, name) };
  }

  /* ----- Code files ----- */
  const codeMap: Record<string, () => { lang: string; body: string }> = {
    js:   () => ({ lang: "javascript", body: synthJs(r) }),
    ts:   () => ({ lang: "typescript", body: synthTs(r) }),
    jsx:  () => ({ lang: "jsx",        body: synthJs(r) }),
    tsx:  () => ({ lang: "tsx",        body: synthTs(r) }),
    py:   () => ({ lang: "python",     body: synthPy(r) }),
    go:   () => ({ lang: "go",         body: synthGo(r) }),
    rb:   () => ({ lang: "ruby",       body: synthRb(r) }),
    rs:   () => ({ lang: "rust",       body: synthRs(r) }),
    java: () => ({ lang: "java",       body: synthJava(r) }),
    c:    () => ({ lang: "c",          body: synthC(r) }),
    cpp:  () => ({ lang: "cpp",        body: synthCpp(r) }),
    swift:() => ({ lang: "swift",      body: synthSwift(r) }),
    kt:   () => ({ lang: "kotlin",     body: synthKt(r) }),
    php:  () => ({ lang: "php",        body: synthPhp(r) }),
    sh:   () => ({ lang: "bash",       body: synthSh(r) }),
    sql:  () => ({ lang: "sql",        body: synthSql(r) }),
    html: () => ({ lang: "html",       body: synthHtml(r) }),
    css:  () => ({ lang: "css",        body: synthCss(r) }),
    scss: () => ({ lang: "scss",       body: synthCss(r) }),
    xml:  () => ({ lang: "xml",        body: synthXml(r) }),
  };
  if (codeMap[e]) {
    const c = codeMap[e]();
    return { kind: "code", language: c.lang, body: c.body };
  }

  /* ----- Archives ----- */
  if (["zip", "rar", "7z", "tar", "gz"].includes(e)) {
    return { kind: "archive", entries: synthArchive(r) };
  }

  /* ----- SVG: treat as code (so user sees the markup) ----- */
  if (e === "svg") {
    return { kind: "code", language: "xml", body: synthSvg() };
  }

  /* ----- Fallback: no inline preview, offer download ----- */
  return { kind: "binary" };
}

/* ------------------------------------------------------------------ Generators */

function synthLetter(r: () => number, name: string): string {
  const who = `${pick(r, FIRST_NAMES)} ${pick(r, LAST_NAMES)}`;
  return [
    `Hi team,`,
    ``,
    `Sharing the latest on "${name.replace(/\.[^.]+$/, "")}". Highlights below — full details follow.`,
    ``,
    `1. Status is on track. Two outstanding blockers, both with owners assigned.`,
    `2. Customer feedback from last week's review has been incorporated. The revised plan addresses each major concern.`,
    `3. Timeline remains the same — target end-of-quarter delivery.`,
    ``,
    `Please review at your convenience and let me know if anything needs to be revisited before the next sync.`,
    ``,
    `Thanks,`,
    who,
  ].join("\n");
}

function synthLog(r: () => number): string {
  const lines: string[] = [];
  const start = Date.now() - 1000 * 60 * 5;
  for (let i = 0; i < 24; i++) {
    const ts = new Date(start + i * 1000 * (5 + Math.floor(r() * 10))).toISOString();
    const lvl = pick(r, ["INFO", "INFO", "INFO", "WARN", "ERROR", "DEBUG"]);
    const msg = pick(r, [
      "Connection established to db-primary",
      "Cache miss for key user:profile",
      "Request completed in 132ms",
      "Retrying upstream after 502",
      "Migration step 3 of 7 done",
      "Processed 1024 records (batch 4)",
      "Auth token refreshed",
      "Slow query detected (1.4s) — reports.aggregate",
      "Worker idle, scaling down",
      "Health check OK",
    ]);
    lines.push(`${ts}  ${lvl.padEnd(5)}  ${msg}`);
  }
  return lines.join("\n");
}

function synthEnv(): string {
  return [
    "# Local environment overrides",
    "NODE_ENV=development",
    "PORT=4200",
    "API_URL=https://api.staging.airlift.com",
    "FEATURE_NEW_DASHBOARD=true",
    "LOG_LEVEL=debug",
    "DB_POOL_SIZE=10",
  ].join("\n");
}

function synthMarkdown(r: () => number, name: string): string {
  const title = name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
  return [
    `# ${title}`,
    ``,
    `> Draft — last updated ${new Date().toDateString()}.`,
    ``,
    `## Summary`,
    ``,
    `This document captures the implementation plan for the upcoming release.`,
    `Key milestones are listed below.`,
    ``,
    `## Milestones`,
    ``,
    `- Phase 1: schema migrations and feature flag setup`,
    `- Phase 2: backend rollout to staging`,
    `- Phase 3: frontend updates + canary release`,
    `- Phase 4: full production ramp`,
    ``,
    `## Risks`,
    ``,
    `1. Backwards compatibility for the partner API`,
    `2. Bandwidth on the design-review side`,
    `3. End-of-quarter freeze conflicting with Phase 4`,
    ``,
    `See also: ${pick(r, TICKETS)}, ${pick(r, TICKETS)}.`,
  ].join("\n");
}

function synthJson(r: () => number, _name: string): string {
  const obj = {
    id: `obj-${Math.floor(r() * 1e6).toString(36)}`,
    generatedAt: new Date().toISOString(),
    status: pick(r, STATUSES),
    priority: pick(r, PRIORITIES),
    owner: { name: `${pick(r, FIRST_NAMES)} ${pick(r, LAST_NAMES)}`, role: pick(r, ["eng", "pm", "design", "ops"]) },
    items: Array.from({ length: 4 }, (_, i) => ({
      ticket: pick(r, TICKETS),
      title: pick(r, ["Refactor consignee field validation", "Add partner-API rate limiter",
                      "Migrate legacy bookings", "Wire up new dashboard tiles"]),
      points: 1 + Math.floor(r() * 8),
      assignee: pick(r, FIRST_NAMES),
    })),
  };
  return JSON.stringify(obj, null, 2);
}

function synthYaml(r: () => number): string {
  return [
    "name: airlift-api",
    "version: 1.4.2",
    "environments:",
    "  staging:",
    "    replicas: 2",
    "    cpu: 500m",
    "    memory: 1Gi",
    "  production:",
    "    replicas: 6",
    "    cpu: 2000m",
    "    memory: 4Gi",
    "features:",
    `  - new_dashboard: ${r() > 0.5}`,
    `  - rate_limit_v2: ${r() > 0.5}`,
    "secrets:",
    "  - DB_PASSWORD",
    "  - API_KEY",
  ].join("\n");
}

function synthTable(r: () => number, name: string): string[][] {
  const lower = name.toLowerCase();
  if (lower.includes("action") || lower.includes("task")) {
    const head = ["#", "Owner", "Action", "Priority", "Due", "Status"];
    const rows: string[][] = [head];
    for (let i = 1; i <= 12; i++) {
      rows.push([
        String(i),
        `${pick(r, FIRST_NAMES)} ${pick(r, LAST_NAMES)}`,
        pick(r, ["Confirm Q2 plan", "Review migration", "Test booking flow",
                 "Schedule customer call", "Draft renewal terms",
                 "Triage CRM-4421", "Update onboarding doc"]),
        pick(r, PRIORITIES),
        `Apr ${10 + Math.floor(r() * 18)}`,
        pick(r, STATUSES),
      ]);
    }
    return rows;
  }
  // Generic numeric report
  const head = ["Region", "Customers", "MRR", "Churn", "Net New"];
  const regions = ["NA", "EMEA", "APAC", "LATAM"];
  const rows: string[][] = [head];
  for (const reg of regions) {
    rows.push([
      reg,
      String(40 + Math.floor(r() * 220)),
      `$${(20 + r() * 380).toFixed(1)}K`,
      `${(0.5 + r() * 4.5).toFixed(2)}%`,
      String(2 + Math.floor(r() * 18)),
    ]);
  }
  return rows;
}

function synthDocParas(r: () => number, name: string): string[] {
  const title = name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
  return [
    `__TITLE__${title}`,
    `Prepared by ${pick(r, FIRST_NAMES)} ${pick(r, LAST_NAMES)} — ${new Date().toLocaleDateString()}.`,
    `1. Background`,
    `Over the last quarter we observed steady growth across the partner channel, with retention numbers improving by 3.2 percentage points. This document captures the current state and outlines next steps.`,
    `2. Current state`,
    `The team completed the initial migration in week three. All P0 issues have been triaged and are tracked in the project board. Customer-reported defects are down 41% quarter-over-quarter, while velocity has held steady.`,
    `3. Next steps`,
    `We will roll out the new dashboard to a 10% canary group on Monday, with a full ramp planned for the following week. Risks and dependencies are summarized in section 5.`,
    `4. Open questions`,
    `Whether to extend the partner-API rate limit before or after the canary, and whether the design-review backlog will clear in time for the planned launch.`,
  ];
}

function synthSlides(r: () => number, name: string): string[][] {
  const title = name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
  return [
    [`__TITLE__${title}`, `${pick(r, FIRST_NAMES)} ${pick(r, LAST_NAMES)} · Q2 Review`],
    [`Agenda`, `• Q1 retrospective`, `• Q2 priorities`, `• Open blockers`, `• Next steps`],
    [`Q1 retrospective`, `Closed at 112% of plan`, `2 P0 incidents, both resolved`, `Customer NPS up 6 points`],
    [`Q2 priorities`, `Customer portal launch`, `IEEPA campaign`, `Lighthouse renewal`, `Origin Software v3`],
    [`Thank you`, `Questions?`],
  ];
}

function synthArchive(r: () => number): { name: string; size: string }[] {
  const exts = ["tsx", "ts", "json", "css", "md", "png", "svg"];
  return Array.from({ length: 10 }, (_, i) => ({
    name: `src/${pick(r, ["app", "components", "services", "data", "models"])}/${pick(r, ["index", "main", "helpers", "types", "config"])}-${i}.${pick(r, exts)}`,
    size: `${1 + Math.floor(r() * 380)} KB`,
  }));
}

/* ----- Code snippet generators ----- */

function synthJs(_r: () => number): string {
  return `// utils/parse-mentions.js
export function parseMentions(text) {
  const re = /@([A-Z][A-Za-z]*(?:\\s[A-Z][A-Za-z]*)?)/g;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ at: m.index, name: m[1] });
  }
  return out;
}

export function isMention(token) {
  return token.startsWith("@") && /^[A-Z]/.test(token.slice(1));
}
`;
}

function synthTs(_r: () => number): string {
  return `// services/booking.service.ts
import { Injectable, signal } from "@angular/core";
import { Booking } from "../models/types";

@Injectable({ providedIn: "root" })
export class BookingService {
  private bookings = signal<Booking[]>([]);

  list() { return this.bookings.asReadonly(); }

  add(b: Booking): void {
    this.bookings.update((arr) => [...arr, b]);
  }

  removeById(id: string): void {
    this.bookings.update((arr) => arr.filter((b) => b.id !== id));
  }
}
`;
}

function synthPy(_r: () => number): string {
  return `# pipelines/aggregate.py
from typing import Iterable
from dataclasses import dataclass

@dataclass
class Booking:
    id: str
    consignee: str
    weight_kg: float

def total_weight(rows: Iterable[Booking]) -> float:
    return sum(r.weight_kg for r in rows)

if __name__ == "__main__":
    sample = [Booking("b1", "Acme", 12.5), Booking("b2", "Lighthouse", 8.0)]
    print(f"Total: {total_weight(sample):.2f} kg")
`;
}

function synthGo(_r: () => number): string {
  return `// pkg/booking/handler.go
package booking

import (
\t"encoding/json"
\t"net/http"
)

type Booking struct {
\tID        string  \`json:"id"\`
\tConsignee string  \`json:"consignee"\`
\tWeightKG  float64 \`json:"weight_kg"\`
}

func ListHandler(w http.ResponseWriter, r *http.Request) {
\tw.Header().Set("Content-Type", "application/json")
\tjson.NewEncoder(w).Encode([]Booking{{ID: "b1", Consignee: "Acme", WeightKG: 12.5}})
}
`;
}

function synthRb(_r: () => number): string {
  return `# bookings_controller.rb
class BookingsController < ApplicationController
  before_action :authenticate_user!

  def index
    @bookings = Booking.where(account_id: current_user.account_id).order(created_at: :desc)
  end

  def create
    @booking = Booking.new(booking_params)
    if @booking.save
      redirect_to @booking, notice: "Booking created."
    else
      render :new
    end
  end
end
`;
}

function synthRs(_r: () => number): string {
  return `// src/booking.rs
#[derive(Debug, Clone)]
pub struct Booking {
    pub id: String,
    pub consignee: String,
    pub weight_kg: f64,
}

pub fn total_weight(items: &[Booking]) -> f64 {
    items.iter().map(|b| b.weight_kg).sum()
}
`;
}

function synthJava(_r: () => number): string {
  return `// BookingService.java
package com.airlift.bookings;

import java.util.List;
import java.util.stream.Collectors;

public class BookingService {
    public List<Booking> active(List<Booking> all) {
        return all.stream()
            .filter(b -> b.getStatus() == Status.OPEN)
            .collect(Collectors.toList());
    }
}
`;
}

function synthC(_r: () => number): string {
  return `// booking.c
#include <stdio.h>
#include <string.h>

typedef struct {
  char id[16];
  char consignee[64];
  double weight_kg;
} Booking;

double total_weight(Booking *bs, int n) {
  double sum = 0;
  for (int i = 0; i < n; i++) sum += bs[i].weight_kg;
  return sum;
}
`;
}

function synthCpp(_r: () => number): string {
  return `// booking.cpp
#include <vector>
#include <numeric>
#include <string>

struct Booking {
  std::string id;
  std::string consignee;
  double weight_kg;
};

double total_weight(const std::vector<Booking>& items) {
  return std::accumulate(items.begin(), items.end(), 0.0,
    [](double acc, const Booking& b) { return acc + b.weight_kg; });
}
`;
}

function synthSwift(_r: () => number): string {
  return `// Booking.swift
import Foundation

struct Booking: Codable {
    let id: String
    let consignee: String
    let weightKg: Double
}

func totalWeight(_ items: [Booking]) -> Double {
    items.reduce(0) { $0 + $1.weightKg }
}
`;
}

function synthKt(_r: () => number): string {
  return `// Booking.kt
data class Booking(val id: String, val consignee: String, val weightKg: Double)

fun List<Booking>.totalWeight(): Double = sumOf { it.weightKg }
`;
}

function synthPhp(_r: () => number): string {
  return `<?php
// Booking.php
class Booking {
    public string $id;
    public string $consignee;
    public float $weightKg;

    public function __construct(string $id, string $consignee, float $w) {
        $this->id = $id;
        $this->consignee = $consignee;
        $this->weightKg = $w;
    }
}
`;
}

function synthSh(_r: () => number): string {
  return `#!/usr/bin/env bash
# deploy.sh — promote staging build to production
set -euo pipefail

BUILD_TAG="\${BUILD_TAG:-$(git rev-parse --short HEAD)}"

echo "==> Promoting build $BUILD_TAG"
docker pull "registry.airlift.com/api:$BUILD_TAG"
docker tag  "registry.airlift.com/api:$BUILD_TAG" "registry.airlift.com/api:prod"
docker push "registry.airlift.com/api:prod"

echo "==> Done."
`;
}

function synthSql(_r: () => number): string {
  return `-- migration-v18.sql
BEGIN;

ALTER TABLE bookings
  ADD COLUMN consignee_normalized TEXT;

UPDATE bookings
  SET consignee_normalized = lower(unaccent(consignee));

CREATE INDEX CONCURRENTLY idx_bookings_consignee_norm
  ON bookings (consignee_normalized);

COMMIT;
`;
}

function synthHtml(_r: () => number): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Airlift Internal Memo</title>
</head>
<body>
  <header>
    <h1>Internal Memo</h1>
  </header>
  <main>
    <p>Draft preview content.</p>
  </main>
</body>
</html>
`;
}

function synthCss(_r: () => number): string {
  return `:root {
  --color-bg: #ffffff;
  --color-fg: #111827;
  --color-accent: #2563eb;
}

.message-bubble {
  border-radius: 12px;
  padding: 8px 12px;
  background: var(--color-bg);
  color: var(--color-fg);
}

.message-bubble--me {
  background: #eff6ff;
}
`;
}

function synthXml(_r: () => number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bookings>
  <booking id="b1">
    <consignee>Acme Corp</consignee>
    <weight unit="kg">12.5</weight>
  </booking>
  <booking id="b2">
    <consignee>Lighthouse</consignee>
    <weight unit="kg">8.0</weight>
  </booking>
</bookings>
`;
}

function synthSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
  <circle cx="60" cy="60" r="50" fill="#3b82f6" />
  <text x="60" y="68" font-family="sans-serif" font-size="22" fill="white" text-anchor="middle">A</text>
</svg>
`;
}
