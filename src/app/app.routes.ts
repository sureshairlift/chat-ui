import { Component } from "@angular/core";
import { Routes } from "@angular/router";

/**
 * Stub component for routed paths. The actual UI is rendered by AppComponent
 * (the bootstrapped root). The router is used purely as a URL ↔ state sync
 * layer — a hidden `<router-outlet>` lives inside AppComponent so the router
 * is "happy" but nothing visible changes when navigation happens.
 *
 * Why this approach: AppComponent is a single-page shell that shows multiple
 * panels at once (Sidebar, HomeList, Conv pane, Side panels). Component-based
 * routing would replace one outlet's content per nav, which doesn't fit. The
 * RouterSyncService + this stub keep the existing layout while making URLs
 * deep-linkable and bookmarkable.
 */
@Component({
  selector: "app-route-stub",
  standalone: true,
  template: "",
})
export class RouteStubComponent {}

/**
 * URL map (base = /main/internal-memo):
 *
 *   /main/internal-memo                  → home, no conv selected
 *   /main/internal-memo/dashboard        → dashboard view
 *   /main/internal-memo/mentions         → mentions view
 *   /main/internal-memo/threads          → threads view
 *   /main/internal-memo/sent             → sent messages view
 *   /main/internal-memo/saved            → saved messages view
 *
 *   Section URLs are split into two groups:
 *   /main/internal-memo/section/:id      → BUILT-IN sections (readable IDs):
 *                                            customers, ai, direct, spaces,
 *                                            test, pinned, unread
 *   /main/internal-memo/custom/:id       → USER-CREATED custom sections.
 *                                            The :id is an opaque hash from
 *                                            IdMapperService — the actual
 *                                            internal id (e.g. custom-1730412345)
 *                                            doesn't appear in the URL.
 *
 *   /main/internal-memo/c/:convId        → home with a specific conversation open
 *   /main/internal-memo/c/:convId/thread/:msgId
 *                                        → conversation + thread panel open
 *
 * Anything else redirects to the base.
 *
 * Note: the conv/msg/custom-section IDs are opaque tokens (FNV-1a base36)
 * resolved via IdMapperService. Built-in section IDs stay human-readable.
 */
const BASE = "main/internal-memo";

export const routes: Routes = [
  { path: "",                                    pathMatch: "full", redirectTo: `/${BASE}` },
  { path: BASE,                                  component: RouteStubComponent, data: { view: "home" } },
  { path: `${BASE}/dashboard`,                   component: RouteStubComponent, data: { view: "dashboard" } },
  { path: `${BASE}/mentions`,                    component: RouteStubComponent, data: { view: "mentions" } },
  { path: `${BASE}/threads`,                     component: RouteStubComponent, data: { view: "threads" } },
  { path: `${BASE}/sent`,                        component: RouteStubComponent, data: { view: "sent" } },
  { path: `${BASE}/saved`,                       component: RouteStubComponent, data: { view: "starred" } },
  // Custom section listed BEFORE the wildcard `:sectionId` so the literal
  // `custom` segment matches first. Otherwise Angular would treat
  // `/section/custom/abc` as `/section/:sectionId=custom` + an extra segment.
  { path: `${BASE}/section/custom/:customId`,    component: RouteStubComponent, data: { view: "home", sectionKind: "custom" } },
  { path: `${BASE}/section/:sectionId`,          component: RouteStubComponent, data: { view: "home", sectionKind: "builtin" } },
  { path: `${BASE}/c/:convId`,                   component: RouteStubComponent, data: { view: "home" } },
  { path: `${BASE}/c/:convId/thread/:msgId`,     component: RouteStubComponent, data: { view: "home" } },
  { path: "**",                                  redirectTo: `/${BASE}` },
];

/** Built-in section IDs that stay human-readable in URLs. Anything else
 *  (including `test`, which is a user-defined grouping, and any
 *  `custom-*` sections created at runtime) goes through the custom route
 *  with an opaque hashed ID under `/section/custom/:id`. */
export const BUILTIN_SECTIONS = new Set<string>([
  "customers", "ai", "direct", "spaces", "pinned", "unread",
]);
