import { Injectable } from "@angular/core";
import { INITIAL_CONVERSATIONS } from "../data/conversations";
import { INITIAL_MESSAGES }      from "../data/messages";

/**
 * Bidirectional mapper between human-readable internal IDs (e.g. `origin-dev`,
 * `o3`) and opaque URL-safe IDs (e.g. `1k8q3xa`).
 *
 * Why: URLs like `/c/origin-dev/thread/od9` leak internal naming. Hashing the
 * IDs gives stable, opaque tokens that don't reveal data shape but are still
 * deterministic — the same conv always produces the same URL token, so
 * deep-linking and bookmarks survive reloads.
 *
 * Hash: 32-bit FNV-1a → base36, ~7 characters. Synchronous, dependency-free,
 * very low collision risk for the few hundred IDs in this app.
 *
 * Runtime additions: `urlIdForConv`/`urlIdForMsg` register-on-demand, so a
 * new conversation or message created after boot still gets a stable URL ID.
 */
@Injectable({ providedIn: "root" })
export class IdMapperService {
  private convToUrl    = new Map<string, string>();
  private urlToConv    = new Map<string, string>();
  private msgToUrl     = new Map<string, string>();
  private urlToMsg     = new Map<string, string>();
  /** Custom sections only — built-in section IDs (`direct`, `customers`, etc.)
   *  stay readable in URLs. Maps the custom-section internal ID (e.g.
   *  `custom-1730412345`) to a short opaque token. */
  private sectionToUrl = new Map<string, string>();
  private urlToSection = new Map<string, string>();

  constructor() {
    // Pre-register every conversation and message we know about so the maps
    // are warm before the first URL build.
    for (const c of INITIAL_CONVERSATIONS) this.registerConv(c.id);
    for (const [, msgs] of Object.entries(INITIAL_MESSAGES)) {
      for (const m of msgs) this.registerMsg(m.id);
    }
  }

  /** FNV-1a 32-bit, base36-encoded. ~7 chars. */
  private hash(s: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36).padStart(7, "0");
  }

  /** If a collision would replace an existing entry, append a counter so the
   *  second entry gets a different URL token. */
  private uniqueHash(seed: string, taken: Map<string, string>): string {
    let id = this.hash(seed);
    let n = 0;
    while (taken.has(id)) {
      n += 1;
      id = this.hash(`${seed}#${n}`);
    }
    return id;
  }

  private registerConv(convId: string): string {
    if (this.convToUrl.has(convId)) return this.convToUrl.get(convId)!;
    const urlId = this.uniqueHash(convId, this.urlToConv);
    this.convToUrl.set(convId, urlId);
    this.urlToConv.set(urlId, convId);
    return urlId;
  }

  private registerMsg(msgId: string): string {
    if (this.msgToUrl.has(msgId)) return this.msgToUrl.get(msgId)!;
    const urlId = this.uniqueHash(msgId, this.urlToMsg);
    this.msgToUrl.set(msgId, urlId);
    this.urlToMsg.set(urlId, msgId);
    return urlId;
  }

  private registerSection(sectionId: string): string {
    if (this.sectionToUrl.has(sectionId)) return this.sectionToUrl.get(sectionId)!;
    const urlId = this.uniqueHash(sectionId, this.urlToSection);
    this.sectionToUrl.set(sectionId, urlId);
    this.urlToSection.set(urlId, sectionId);
    return urlId;
  }

  /* --------------------------- Public API --------------------------- */

  urlIdForConv(convId: string): string {
    return this.convToUrl.get(convId) ?? this.registerConv(convId);
  }
  convIdForUrl(urlId: string): string | null {
    return this.urlToConv.get(urlId) ?? null;
  }
  urlIdForMsg(msgId: string): string {
    return this.msgToUrl.get(msgId) ?? this.registerMsg(msgId);
  }
  msgIdForUrl(urlId: string): string | null {
    return this.urlToMsg.get(urlId) ?? null;
  }
  /** Used for custom user-created sections. Built-in section IDs are kept
   *  readable in URLs and don't go through this mapper. */
  urlIdForSection(sectionId: string): string {
    return this.sectionToUrl.get(sectionId) ?? this.registerSection(sectionId);
  }
  sectionIdForUrl(urlId: string): string | null {
    return this.urlToSection.get(urlId) ?? null;
  }
}
