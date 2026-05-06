import { Injectable } from "@angular/core";
import { SENDERS } from "../data/senders";
import { Sender } from "../models/types";

// Capitalized first name optionally followed by a capitalized last name.
const MENTION_RE = /@([A-Z][A-Za-z]*(?:\s[A-Z][A-Za-z]*)?)/g;
const CHIP_RE = /class="mention-chip"[^>]*>@([^<]+)</g;

/**
 * Shared mention-detection helpers used by MentionsView and ThreadsView.
 * Pulled out so the regex + alias logic doesn't drift between the two.
 */
@Injectable({ providedIn: "root" })
export class MentionDetectorService {
  /** Build a "is this @name me?" predicate from the current user's aliases. */
  buildSelfMatcher(currentUserId: string): (name: string) => boolean {
    const me = SENDERS[currentUserId] || ({} as Sender);
    const tokens = new Set<string>();
    if (me.name) {
      me.name.split(/\s+/).forEach((t) => { if (t) tokens.add(t.toLowerCase()); });
      tokens.add(me.name.toLowerCase());
    }
    if (currentUserId === "me") {
      ["suresh", "rajsuresh", "rajsuresh airlift", "suresh r"]
        .forEach((t) => tokens.add(t));
    }
    return (name: string): boolean => {
      const lc = (name || "").toLowerCase();
      if (tokens.has(lc)) return true;
      for (const t of tokens) {
        if (t.length >= 4 && lc.includes(t)) return true;
      }
      return false;
    };
  }

  /** All @-mentions found in a (text, html) pair. HTML is scanned both for
   *  `mention-chip` spans and for inline `@Name` after tag stripping. */
  extractMentions(text = "", html = ""): Set<string> {
    const mentions = new Set<string>();
    if (text) {
      const re = new RegExp(MENTION_RE.source, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) mentions.add(m[1]);
    }
    if (html) {
      const chipRe = new RegExp(CHIP_RE.source, "g");
      let cm: RegExpExecArray | null;
      while ((cm = chipRe.exec(html)) !== null) mentions.add(cm[1].trim());
      const stripped = html.replace(/<[^>]+>/g, " ");
      const re = new RegExp(MENTION_RE.source, "g");
      let tm: RegExpExecArray | null;
      while ((tm = re.exec(stripped)) !== null) mentions.add(tm[1]);
    }
    return mentions;
  }

  /** Convenience: does any mention in text/html match `isSelf`? */
  containsSelfMention(text: string, html: string, isSelf: (name: string) => boolean): boolean {
    for (const name of this.extractMentions(text, html)) {
      if (isSelf(name)) return true;
    }
    return false;
  }
}
