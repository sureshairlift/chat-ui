import { Pipe, PipeTransform } from "@angular/core";
import { renderTextWithLinksHtml, sanitizeHtml } from "../services/helpers";

/**
 * Renders plain text with @mentions and http(s) links converted to inline
 * HTML chips/anchors, mirroring React `renderTextWithLinks` exactly.
 * Output is safe to bind via [innerHTML].
 */
@Pipe({ name: "renderText", standalone: true })
export class RenderTextPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
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
