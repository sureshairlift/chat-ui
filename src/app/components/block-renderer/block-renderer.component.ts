/**
 * BlockRendererComponent — generic dispatcher for the AI block protocol.
 *
 * Switches on `block.kind` and renders each variant inline. The 16
 * block kinds (text, markdown, code, quote, divider, table, chart,
 * tool_call, citations, handoff, image, file, actions, form,
 * link_preview, error) match `apps/chat-service/schemas/blocks/*.schema.json`.
 *
 * For now every variant renders inline in this single component to keep
 * the bundle small and the dispatch obvious. As any variant grows past
 * ~30 lines (chart with its own canvas, form with its own state), split
 * it into a dedicated child component imported here.
 *
 * Action / form blocks raise `(action)` and `(submit)` events for the
 * parent (typically MessageBubbleComponent) to forward to the API.
 */
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MarkdownComponent } from 'ngx-markdown';

import type {
  ActionsBlock,
  Block,
  ChartBlock,
  CitationsBlock,
  CodeBlock,
  DividerBlock,
  ErrorBlock,
  FileBlock,
  FormBlock,
  HandoffBlock,
  ImageBlock,
  LinkPreviewBlock,
  MarkdownBlock,
  QuoteBlock,
  TableBlock,
  TextBlock,
  ToolCallBlock,
} from '../../models/api-types';

export interface BlockAction {
  blockId: string;
  actionId: string;
  intent?: string;
  args?: Record<string, unknown>;
}

export interface BlockFormSubmit {
  blockId: string;
  values: Record<string, unknown>;
}

@Component({
  selector: 'app-block-renderer',
  standalone: true,
  imports: [CommonModule, MarkdownComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container [ngSwitch]="block.kind">
      <!-- text / markdown / code / quote / divider — leaf renderers.
           text blocks render through ngx-markdown too because the AI
           prompt asks the LLM to "use plain markdown" — the wire kind
           stays "text" but the content is markdown-flavored. The
           [data] binding feeds the streaming text in directly so deltas
           re-render incrementally. -->
      <markdown *ngSwitchCase="'text'"
                class="prose prose-sm max-w-none text-sm text-gray-900"
                [data]="asText(block).text || ''"></markdown>

      <markdown *ngSwitchCase="'markdown'"
                class="prose prose-sm max-w-none"
                [data]="asMd(block).markdown || ''"></markdown>

      <pre *ngSwitchCase="'code'" class="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs overflow-x-auto"><code [class]="codeLangClass()">{{ asCode(block).code }}</code></pre>

      <blockquote *ngSwitchCase="'quote'" class="border-l-4 border-gray-300 pl-3 italic text-sm text-gray-700">
        <markdown [data]="asQuote(block).markdown || ''"></markdown>
        <footer *ngIf="asQuote(block).cite" class="mt-1 text-xs text-gray-500">— {{ asQuote(block).cite }}</footer>
      </blockquote>

      <hr *ngSwitchCase="'divider'" class="my-2 border-gray-200" />

      <!-- table -->
      <div *ngSwitchCase="'table'" class="rounded-lg border border-gray-200 overflow-hidden text-sm">
        <div *ngIf="asTable(block).title" class="px-3 py-2 bg-gray-50 border-b text-gray-700 font-medium">
          {{ asTable(block).title }}
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th *ngFor="let c of asTable(block).columns" class="px-3 py-2 text-left font-medium">{{ c.label }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of asTable(block).rows; let i = index"
                  [class.bg-gray-50]="i % 2 === 1"
                  class="border-t border-gray-100">
                <td *ngFor="let c of asTable(block).columns" class="px-3 py-2 text-gray-800">
                  {{ formatCell(row[c.key], c.type) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div *ngIf="asTable(block).total_rows && asTable(block).total_rows! > asTable(block).rows.length"
             class="px-3 py-2 text-xs text-gray-500 border-t bg-gray-50">
          Showing {{ asTable(block).rows.length }} of {{ asTable(block).total_rows }} rows
        </div>
      </div>

      <!-- chart — simple SVG bar/line; richer renderers (chart.js) can replace this later -->
      <div *ngSwitchCase="'chart'" class="rounded-lg border border-gray-200 p-3">
        <div *ngIf="asChart(block).title" class="text-sm font-medium text-gray-800 mb-1">{{ asChart(block).title }}</div>
        <div *ngIf="asChart(block).subtitle" class="text-xs text-gray-500 mb-2">{{ asChart(block).subtitle }}</div>
        <svg [attr.viewBox]="'0 0 600 200'" class="w-full h-40">
          <ng-container *ngFor="let bar of chartBars(); let i = index">
            <rect [attr.x]="bar.x" [attr.y]="bar.y" [attr.width]="bar.w" [attr.height]="bar.h" [attr.fill]="bar.color" />
          </ng-container>
        </svg>
        <div class="flex flex-wrap gap-2 mt-2 text-xs text-gray-600">
          <span *ngFor="let s of asChart(block).data.series; let i = index" class="flex items-center gap-1">
            <span class="inline-block w-2 h-2 rounded-sm" [style.background]="seriesColor(i)"></span>
            {{ s.name }}
          </span>
        </div>
      </div>

      <!-- tool_call — running spinner + status pill -->
      <div *ngSwitchCase="'tool_call'" class="rounded-md border border-gray-200 bg-white p-2 flex items-center gap-2 text-sm">
        <span [class]="toolStatusClass()" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs">
          <span *ngIf="asTool(block).status === 'running'" class="inline-block w-2 h-2 rounded-full bg-current animate-pulse"></span>
          {{ asTool(block).status }}
        </span>
        <span class="text-gray-700 font-medium">{{ asTool(block).tool }}</span>
        <span *ngIf="asTool(block).result_summary" class="text-gray-500 text-xs ml-auto">{{ asTool(block).result_summary }}</span>
      </div>

      <!-- citations -->
      <div *ngSwitchCase="'citations'" class="rounded-md bg-gray-50 p-2 text-xs">
        <div class="text-gray-500 mb-1 font-medium">Sources</div>
        <ul class="space-y-1">
          <li *ngFor="let s of asCitations(block).sources">
            <a *ngIf="s.url; else titleOnly" [href]="s.url" target="_blank" rel="noopener" class="text-blue-600 hover:underline">{{ s.title }}</a>
            <ng-template #titleOnly><span>{{ s.title }}</span></ng-template>
            <span *ngIf="s.snippet" class="text-gray-500"> — {{ s.snippet }}</span>
          </li>
        </ul>
      </div>

      <!-- handoff CTA -->
      <div *ngSwitchCase="'handoff'" class="rounded-md border border-amber-200 bg-amber-50 p-3">
        <div class="text-sm font-medium text-amber-900">Hand off to support team?</div>
        <div class="text-xs text-amber-800 mt-1">{{ asHandoff(block).summary }}</div>
        <div class="text-xs text-amber-700 mt-1 italic">Reason: {{ asHandoff(block).reason }}</div>
        <button type="button"
                class="mt-2 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-amber-600 text-white hover:bg-amber-700"
                (click)="emitAction({ blockId: block.id, actionId: 'handoff_confirm', intent: 'handoff', args: { reason: asHandoff(block).reason } })">
          Bring in the team
        </button>
      </div>

      <!-- image -->
      <figure *ngSwitchCase="'image'" class="rounded-md overflow-hidden border border-gray-200">
        <img [src]="asImage(block).url" [alt]="asImage(block).alt ?? ''" class="w-full max-h-96 object-cover" />
        <figcaption *ngIf="asImage(block).caption" class="px-2 py-1 text-xs text-gray-600 bg-gray-50">{{ asImage(block).caption }}</figcaption>
      </figure>

      <!-- file -->
      <a *ngSwitchCase="'file'" [href]="asFile(block).url" target="_blank" rel="noopener"
         class="flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-sm">
        <span class="text-gray-700 font-medium">{{ asFile(block).filename }}</span>
        <span *ngIf="asFile(block).size" class="text-xs text-gray-500 ml-auto">{{ humanSize(asFile(block).size) }}</span>
      </a>

      <!-- actions -->
      <div *ngSwitchCase="'actions'" class="flex flex-wrap gap-2">
        <button *ngFor="let a of asActions(block).actions" type="button"
                [class]="actionClass(a.kind)"
                (click)="emitAction({ blockId: block.id, actionId: a.id, intent: a.intent, args: a.args })">
          {{ a.label }}
        </button>
      </div>

      <!-- form -->
      <form *ngSwitchCase="'form'" class="rounded-md border border-gray-200 bg-white p-3 space-y-2 text-sm"
            (ngSubmit)="submitForm($event)">
        <div *ngIf="asForm(block).title" class="font-medium text-gray-800">{{ asForm(block).title }}</div>
        <div *ngFor="let f of asForm(block).fields">
          <label class="block text-xs text-gray-600 mb-0.5">
            {{ f.label }} <span *ngIf="f.required" class="text-red-500">*</span>
          </label>
          <ng-container [ngSwitch]="f.type">
            <input *ngSwitchCase="'text'" type="text" [name]="f.name" [placeholder]="f.placeholder ?? ''" [required]="!!f.required" class="w-full border border-gray-300 rounded px-2 py-1" />
            <input *ngSwitchCase="'number'" type="number" [name]="f.name" [placeholder]="f.placeholder ?? ''" [required]="!!f.required" class="w-full border border-gray-300 rounded px-2 py-1" />
            <input *ngSwitchCase="'date'" type="date" [name]="f.name" [required]="!!f.required" class="w-full border border-gray-300 rounded px-2 py-1" />
            <textarea *ngSwitchCase="'textarea'" [name]="f.name" [placeholder]="f.placeholder ?? ''" [required]="!!f.required" rows="3" class="w-full border border-gray-300 rounded px-2 py-1"></textarea>
            <select *ngSwitchCase="'select'" [name]="f.name" [required]="!!f.required" class="w-full border border-gray-300 rounded px-2 py-1">
              <option *ngFor="let o of f.options ?? []" [value]="o.value">{{ o.label }}</option>
            </select>
            <input *ngSwitchCase="'checkbox'" type="checkbox" [name]="f.name" />
          </ng-container>
        </div>
        <button type="submit" class="px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">
          {{ asForm(block).submit_label || 'Submit' }}
        </button>
      </form>

      <!-- link preview -->
      <a *ngSwitchCase="'link_preview'" [href]="asLink(block).url" target="_blank" rel="noopener"
         class="block rounded-md border border-gray-200 bg-white overflow-hidden hover:bg-gray-50">
        <div class="flex">
          <img *ngIf="asLink(block).image_url" [src]="asLink(block).image_url!" alt="" class="w-24 h-24 object-cover" />
          <div class="p-2 text-sm flex-1">
            <div class="text-xs text-gray-500">{{ asLink(block).site_name || asLink(block).url }}</div>
            <div class="font-medium text-gray-800">{{ asLink(block).title || asLink(block).url }}</div>
            <div *ngIf="asLink(block).description" class="text-xs text-gray-600 mt-0.5">{{ asLink(block).description }}</div>
          </div>
        </div>
      </a>

      <!-- error -->
      <div *ngSwitchCase="'error'" class="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">
        <strong>{{ asError(block).code }}</strong>: {{ asError(block).message }}
        <button *ngIf="asError(block).retryable" type="button"
                class="ml-2 text-xs text-red-700 underline"
                (click)="emitAction({ blockId: block.id, actionId: 'retry', intent: 'retry' })">
          Retry
        </button>
      </div>

      <!-- fallback -->
      <div *ngSwitchDefault class="text-xs text-gray-500 italic">[unrenderable block: {{ block.kind }}]</div>
    </ng-container>
  `,
})
export class BlockRendererComponent {
  @Input({ required: true }) block!: Block;
  @Output() readonly action = new EventEmitter<BlockAction>();
  @Output() readonly submit = new EventEmitter<BlockFormSubmit>();

  // ── Type-narrowing accessors (template can't use generics directly) ──

  asText(b: Block): TextBlock { return b as TextBlock; }
  asMd(b: Block): MarkdownBlock { return b as MarkdownBlock; }
  asCode(b: Block): CodeBlock { return b as CodeBlock; }
  asQuote(b: Block): QuoteBlock { return b as QuoteBlock; }
  asDivider(b: Block): DividerBlock { return b as DividerBlock; }
  asTable(b: Block): TableBlock { return b as TableBlock; }
  asChart(b: Block): ChartBlock { return b as ChartBlock; }
  asTool(b: Block): ToolCallBlock { return b as ToolCallBlock; }
  asCitations(b: Block): CitationsBlock { return b as CitationsBlock; }
  asHandoff(b: Block): HandoffBlock { return b as HandoffBlock; }
  asImage(b: Block): ImageBlock { return b as ImageBlock; }
  asFile(b: Block): FileBlock { return b as FileBlock; }
  asActions(b: Block): ActionsBlock { return b as ActionsBlock; }
  asForm(b: Block): FormBlock { return b as FormBlock; }
  asLink(b: Block): LinkPreviewBlock { return b as LinkPreviewBlock; }
  asError(b: Block): ErrorBlock { return b as ErrorBlock; }

  // ── Rendering helpers ──

  codeLangClass(): string {
    const lang = (this.block as CodeBlock).language;
    return lang ? `language-${lang}` : '';
  }

  /** Format a table cell value based on the column type hint. */
  formatCell(v: unknown, type: TableBlock['columns'][number]['type']): string {
    if (v === null || v === undefined) return '—';
    if (type === 'currency' && typeof v === 'number') return formatCurrency(v);
    if (type === 'date' && typeof v === 'string') return formatDate(v, false);
    if (type === 'datetime' && typeof v === 'string') return formatDate(v, true);
    if (type === 'bool') return v ? 'Yes' : 'No';
    return String(v);
  }

  /** Compute SVG bar layout for the chart block. Single-series bar
   *  charts render as side-by-side rectangles; multi-series stacks the
   *  bars per label. Good enough for the common case; chart.js takes
   *  over once we need legends, tooltips, axes. */
  chartBars(): Array<{ x: number; y: number; w: number; h: number; color: string }> {
    const c = this.asChart(this.block);
    const out: Array<{ x: number; y: number; w: number; h: number; color: string }> = [];
    if (!c.data?.labels?.length || !c.data?.series?.length) return out;
    const W = 600;
    const H = 200;
    const pad = 8;
    const groupW = (W - pad * 2) / c.data.labels.length;
    const max = Math.max(0.001, ...c.data.series.flatMap((s) => s.values).filter((v): v is number => typeof v === 'number'));
    const seriesCount = c.data.series.length;
    const barW = (groupW - 4) / seriesCount;
    for (let li = 0; li < c.data.labels.length; li++) {
      for (let si = 0; si < seriesCount; si++) {
        const v = c.data.series[si].values[li];
        if (typeof v !== 'number') continue;
        const h = ((v / max) * (H - 24)) | 0;
        out.push({
          x: pad + li * groupW + 2 + si * barW,
          y: H - 8 - h,
          w: Math.max(1, barW - 1),
          h,
          color: c.data.series[si].color || this.seriesColor(si),
        });
      }
    }
    return out;
  }

  seriesColor(i: number): string {
    const palette = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];
    return palette[i % palette.length];
  }

  toolStatusClass(): string {
    const s = this.asTool(this.block).status;
    if (s === 'success') return 'bg-green-100 text-green-800';
    if (s === 'error') return 'bg-red-100 text-red-800';
    return 'bg-blue-100 text-blue-800';
  }

  actionClass(kind: ActionsBlock['actions'][number]['kind']): string {
    const base = 'px-3 py-1.5 text-xs font-medium rounded';
    switch (kind) {
      case 'primary':   return `${base} bg-blue-600 text-white hover:bg-blue-700`;
      case 'danger':    return `${base} bg-red-600 text-white hover:bg-red-700`;
      case 'link':      return `${base} text-blue-600 underline hover:no-underline`;
      default:          return `${base} bg-gray-100 text-gray-800 hover:bg-gray-200`;
    }
  }

  humanSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  emitAction(a: BlockAction): void {
    this.action.emit(a);
  }

  submitForm(ev: Event): void {
    ev.preventDefault();
    const form = ev.target as HTMLFormElement;
    const values: Record<string, unknown> = {};
    for (const el of Array.from(form.elements) as HTMLInputElement[]) {
      if (!el.name) continue;
      if (el.type === 'checkbox') values[el.name] = el.checked;
      else if (el.type === 'number') values[el.name] = el.value === '' ? null : Number(el.value);
      else values[el.name] = el.value;
    }
    this.submit.emit({ blockId: this.block.id, values });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function formatDate(s: string, withTime: boolean): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  if (withTime) {
    opts.hour = 'numeric';
    opts.minute = '2-digit';
  }
  return d.toLocaleDateString([], opts);
}

// keep signal imported (re-exported for stricter linters that flag unused).
const _signalRef = signal;
void _signalRef;
