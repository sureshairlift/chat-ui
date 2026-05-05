import { Pipe, PipeTransform } from "@angular/core";
import { renderTextWithLinksHtml, sanitizeHtml } from "../services/helpers";

// HTML-looking content gets routed through the sanitizer instead of
// the mention/link helper. Without this branch, a message that the
// composer flagged as plain text but actually contains tags (most
// migrated freight chats look like this — pasted-in HTML, copy-paste
// from email, AI summaries that include simple markup) shows the raw
// "<p>" / "<br>" as escaped text instead of rendering.
const HTML_TAG_RE = /<(?:[a-z][a-z0-9]*\b[^>]*|\/[a-z][a-z0-9]*)\s*>/i;

/**
 * Renders plain text with @mentions and http(s) links converted to inline
 * HTML chips/anchors, mirroring React `renderTextWithLinks`. When the
 * input itself contains HTML tags, falls back to the sanitizer so the
 * markup actually renders (with script / on* / javascript: stripped).
 * Output is safe to bind via [innerHTML].
 */
@Pipe({ name: "renderText", standalone: true })
export class RenderTextPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return "";
    if (HTML_TAG_RE.test(value)) return sanitizeHtml(value);
    return renderTextWithLinksHtml(value);
  }
}

/**
 * Pipe alias for sanitizeHtml — used when a `msg.html` field is bound
 * via [innerHTML] in templates.
 */
@Pipe({ name: "safeHtml", standalone: true })
export class SafeHtmlPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return sanitizeHtml(value);
  }
}
