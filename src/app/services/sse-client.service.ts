/**
 * sse-client.service.ts — opens an SSE stream against POST /messages
 * for AI channels and surfaces the block protocol to subscribers.
 *
 * Why a separate service: HttpClient doesn't expose a streaming-friendly
 * API. We use the native fetch() + ReadableStream for SSE, then frame-
 * parse the response body line-by-line.
 *
 * Event vocabulary mirrors apps/chat-service/schemas/events/*.schema.json:
 *   ai.message.start  — opens a streaming AI bubble
 *   ai.block.start    — new block within the message
 *   ai.block.delta    — text fragment for an open text block
 *   ai.block.update   — mutates fields on an in-flight block (e.g. tool_call status)
 *   ai.block.end      — closes a block
 *   ai.message.end    — final canonical body + ai_meta
 *   error             — recoverable AI error inside the stream
 *
 * Subscribers receive the parsed envelope objects via the Observable
 * returned from `sendAIMessage`. The observable completes when the SSE
 * stream closes (server EOF, AbortController, or network error).
 */
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import type { AISSEEvent, Block } from '../models/api-types';
import type { SendMessageBody } from './api-client.service';
import { IdentityService } from './identity.service';

const DEFAULT_BASE = '/api/v2/chat-service';

@Injectable({ providedIn: 'root' })
export class SseClientService {
  private readonly base = DEFAULT_BASE;

  constructor(private readonly identity: IdentityService) {}

  /** Send a message to a channel and stream the AI reply.
   *
   *  Subscribe to receive every parsed `AISSEEvent`. Unsubscribe to abort
   *  the upstream connection (frontend doesn't currently need this — AI
   *  replies are short — but plumbed for safety).
   */
  sendAIMessage(channelID: string, body: SendMessageBody): Observable<AISSEEvent> {
    return new Observable<AISSEEvent>((subscriber) => {
      const controller = new AbortController();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      };
      const token = this.identity.token();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        headers['x-token'] = token;
      }

      fetch(`${this.base}/channels/${channelID}/messages`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers,
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok || !res.body) {
            const text = await res.text().catch(() => '');
            subscriber.error(new Error(`AI dispatch failed: ${res.status} ${text}`));
            return;
          }
          if (!res.headers.get('content-type')?.includes('text/event-stream')) {
            // Server didn't switch to SSE — channel wasn't AI-eligible after all.
            // Parse the JSON response and emit nothing (caller's REST flow handled it).
            subscriber.complete();
            return;
          }

          const reader = res.body
            .pipeThrough(new TextDecoderStream('utf-8'))
            .getReader();

          let buffer = '';
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += value;

            // SSE frames are separated by a blank line (\n\n). Pull each
            // complete frame out of the buffer; leave the trailing partial
            // frame (if any) for the next read iteration.
            let idx: number;
            while ((idx = buffer.indexOf('\n\n')) >= 0) {
              const frame = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 2);
              const ev = parseFrame(frame);
              if (ev) {
                subscriber.next(ev);
              }
            }
          }

          // Stream ended; flush any trailing frame without the blank-line terminator.
          if (buffer.trim().length > 0) {
            const ev = parseFrame(buffer);
            if (ev) subscriber.next(ev);
          }
          subscriber.complete();
        })
        .catch((err) => {
          if (controller.signal.aborted) {
            subscriber.complete();
            return;
          }
          subscriber.error(err);
        });

      return () => controller.abort();
    });
  }
}

/** Parse one SSE frame into an AISSEEvent. Returns null on:
 *  - empty frames
 *  - comment-only frames (lines starting with `:`)
 *  - frames without an `event:` line
 *  - unknown event names
 *  - malformed JSON in the data field */
function parseFrame(frame: string): AISSEEvent | null {
  let event = '';
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith(':')) continue; // SSE comment
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (!event || dataLines.length === 0) return null;
  let data: unknown;
  try {
    data = JSON.parse(dataLines.join('\n'));
  } catch {
    return null;
  }
  // We trust the server to emit only known events; cast to the union and
  // narrow at the consumer.
  return { event, data } as AISSEEvent;
}

// ── MessageBuilder helper for components ─────────────────────────────

/** Stateful accumulator for an in-flight AI message. Components subscribe
 *  to the SSE observable and feed events into one of these per assistant
 *  message; the builder maintains the current blocks list so the bubble
 *  re-renders on every event without keeping its own per-block state. */
export class StreamingMessage {
  channelID = '';
  messageID = '';
  blocks: Block[] = [];
  blockIndex = new Map<string, number>();
  done = false;
  error: { code: string; message: string } | null = null;
  finalContent = '';
  aiMeta: Record<string, unknown> | null = null;

  ingest(ev: AISSEEvent): void {
    switch (ev.event) {
      case 'ai.message.start':
        this.channelID = ev.data.channel_id;
        this.messageID = ev.data.message_id;
        break;
      case 'ai.block.start': {
        const block = (ev.data.block ?? {}) as Block;
        this.blockIndex.set(ev.data.block_id, this.blocks.length);
        this.blocks = [...this.blocks, block];
        break;
      }
      case 'ai.block.delta': {
        const i = this.blockIndex.get(ev.data.block_id);
        if (i === undefined) break;
        const cur = this.blocks[i];
        const text = ev.data.delta?.text ?? '';
        if (!text) break;
        if (cur?.kind === 'text') {
          const copy = [...this.blocks];
          copy[i] = { ...cur, text: cur.text + text };
          this.blocks = copy;
        } else if (cur?.kind === 'markdown') {
          const copy = [...this.blocks];
          copy[i] = { ...cur, markdown: cur.markdown + text };
          this.blocks = copy;
        }
        break;
      }
      case 'ai.block.update': {
        const i = this.blockIndex.get(ev.data.block_id);
        if (i === undefined) break;
        const patch = ev.data.block ?? {};
        const cur = this.blocks[i];
        if (!cur) break;
        const copy = [...this.blocks];
        copy[i] = { ...cur, ...patch } as Block;
        this.blocks = copy;
        break;
      }
      case 'ai.block.end':
        // No-op on our side — the block is already in `blocks`. Subscribers
        // can use this to flush any per-block animation state if needed.
        break;
      case 'ai.message.end':
        this.blocks = ev.data.blocks;
        this.finalContent = ev.data.content;
        this.aiMeta = ev.data.ai_meta as Record<string, unknown> | null;
        this.done = true;
        break;
      case 'error':
        this.error = ev.data;
        this.done = true;
        break;
    }
  }
}
