/**
 * fcm-listener.service.ts — Firebase Cloud Messaging integration.
 *
 * Realtime model: Go fires FCM after every persisted message
 * (`AfterMessageSent` in `internal/services/notify.go`). The browser
 * receives the data payload via Firebase JS SDK; this service
 * dispatches it to ChatStateService so the affected channel refetches
 * its messages.
 *
 * Lifecycle:
 *   1. App bootstrap calls init() with Firebase config.
 *   2. init() loads firebase + messaging via dynamic import (so the
 *      firebase package isn't a hard dep — the rest of the app builds
 *      and runs fine without it; FCM just stays disabled).
 *   3. Token is obtained and POSTed to chat-service via
 *      ApiClientService.registerFCMToken.
 *   4. onMessage handler emits parsed payloads on `messages$`.
 *   5. ChatStateService subscribes and routes events to the right
 *      channel (refresh on message.created, etc).
 *
 * Payload shape (matches Go's `internal/services/notify.go::AfterMessageSent`):
 *
 *   {
 *     event: "message.created",
 *     channel_id: "<hex>",
 *     message_id: "<hex>",
 *     sender:     "op:42",
 *     type:       "message" | "ai" | "system" | ...
 *   }
 *
 * Error policy: if Firebase init fails (missing config, no SDK, wrong
 * VAPID key), we log + carry on. The app stays functional without FCM
 * — messages still arrive, just on the next manual refresh.
 */
import { Injectable, signal } from '@angular/core';
import { Observable, Subject, firstValueFrom } from 'rxjs';

import { ApiClientService } from './api-client.service';
import { IdentityService, parseRef } from './identity.service';

export interface FCMConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
  /** Web Push VAPID key from the Firebase console. Required for
   *  getToken() to work. */
  vapidKey: string;
  /** Service worker URL (defaults to /firebase-messaging-sw.js).
   *  Override only if the SW is mounted at a non-standard path. */
  serviceWorkerURL?: string;
}

export type FCMPayloadEvent =
  | 'message.created'
  | 'message.updated'
  | 'message.deleted'
  | 'reaction.changed'
  | 'channel.updated'
  | 'phase.changed';

export interface FCMPayload {
  event: FCMPayloadEvent | string;
  channel_id: string;
  message_id?: string;
  sender?: string;
  type?: string;
  [k: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class FcmListenerService {
  /** Reactive subscription target for components that want to observe
   *  every payload (e.g. a debug/inspector view). */
  readonly messages$: Observable<FCMPayload>;

  /** True after init() resolved with a working token. */
  readonly ready = signal(false);

  /** Last error (init or token refresh). UI can surface for debugging. */
  readonly lastError = signal<string | null>(null);

  /** Most recent registered token. Re-register on rotation. */
  readonly token = signal<string | null>(null);

  private readonly subject = new Subject<FCMPayload>();

  constructor(
    private readonly api: ApiClientService,
    private readonly identity: IdentityService,
  ) {
    this.messages$ = this.subject.asObservable();
  }

  /** Initialize Firebase + register the device token with chat-service.
   *
   *  Dynamic-imports `firebase/app` and `firebase/messaging` so the
   *  build doesn't require the package to be installed. Returns false
   *  (no throw) on any failure; check `lastError()` for the cause.
   *
   *  Idempotent — subsequent calls re-register the token under the
   *  current identity. */
  async init(config: FCMConfig): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      this.lastError.set('FCM not supported in this environment');
      return false;
    }

    // Dynamic imports: firebase is an OPTIONAL dep. The build runs
    // fine without it; this code path no-ops. Variable typed loosely
    // so TS doesn't try to resolve the not-installed module.
    let firebaseApp: { initializeApp: (cfg: object) => unknown } | undefined;
    let messagingMod: {
      getMessaging: (app: unknown) => unknown;
      getToken: (m: unknown, opts: object) => Promise<string>;
      onMessage: (m: unknown, cb: (p: { data?: Record<string, unknown> }) => void) => void;
    } | undefined;
    try {
      // String-literal import path keeps tsc from trying to resolve
      // the module's types. Runtime resolution happens via the bundler.
      const appPath = 'firebase/app';
      const msgPath = 'firebase/messaging';
      firebaseApp = (await import(/* @vite-ignore */ appPath)) as typeof firebaseApp;
      messagingMod = (await import(/* @vite-ignore */ msgPath)) as typeof messagingMod;
    } catch (err) {
      this.lastError.set(`Firebase SDK not installed: ${stringifyErr(err)}`);
      return false;
    }

    try {
      const app = firebaseApp!.initializeApp({
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        projectId: config.projectId,
        messagingSenderId: config.messagingSenderId,
        appId: config.appId,
      });

      // Permission gate. The browser MUST grant before getToken works.
      const perm = await window.Notification.requestPermission();
      if (perm !== 'granted') {
        this.lastError.set(`Notification permission ${perm}`);
        return false;
      }

      // Register the dedicated SW. Apps may already register one; if so,
      // pass it via getToken's ServiceWorkerRegistration option below.
      const swURL = config.serviceWorkerURL ?? '/firebase-messaging-sw.js';
      let swReg: ServiceWorkerRegistration | undefined;
      if ('serviceWorker' in navigator) {
        try {
          swReg = await navigator.serviceWorker.register(swURL);
        } catch (err) {
          this.lastError.set(`SW register failed: ${stringifyErr(err)}`);
          // Continue — getToken can fall back to the default SW.
        }
      }

      const messaging = messagingMod!.getMessaging(app);
      const token = await messagingMod!.getToken(messaging, {
        vapidKey: config.vapidKey,
        serviceWorkerRegistration: swReg,
      });
      if (!token) {
        this.lastError.set('FCM getToken returned empty');
        return false;
      }
      this.token.set(token);

      // Register the token with chat-service so Go can address pushes
      // to this device.
      const principal = this.identity.principal();
      if (principal) {
        try {
          await firstValueFrom(this.api.registerFCMToken(principal.id, token, {
            platform: 'web',
            isExternal: principal.isExternal,
          }));
        } catch (err) {
          this.lastError.set(`token register failed: ${stringifyErr(err)}`);
          // Token is registered with FCM; just couldn't tell our backend.
          // The app still works; pushes won't arrive. Surface for ops.
        }
      }

      // Foreground message handler. (Background messages are handled by
      // the service worker out of process — see firebase-messaging-sw.js.)
      messagingMod!.onMessage(messaging, (payload: { data?: Record<string, unknown> }) => {
        const data = (payload.data ?? {}) as Record<string, unknown>;
        if (!data['channel_id']) return;
        this.subject.next(data as unknown as FCMPayload);
      });

      this.ready.set(true);
      this.lastError.set(null);
      return true;
    } catch (err) {
      this.lastError.set(stringifyErr(err));
      return false;
    }
  }

  /** Convenience for tests: inject a synthetic payload as if FCM
   *  delivered it. Components subscribed to messages$ see it normally. */
  injectForTest(payload: FCMPayload): void {
    this.subject.next(payload);
  }

  /** Reverse-lookup helper: is this payload for a channel the current
   *  user is in? Components that filter their UI off FCM events use
   *  this to ignore noise. */
  isMine(payload: FCMPayload): boolean {
    if (!payload.sender) return false;
    const me = this.identity.userRef();
    if (!me) return false;
    if (payload.sender === me) return true;
    const parsed = parseRef(payload.sender);
    return !!parsed;
  }
}

function stringifyErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// ── Service worker glue (for documentation) ──────────────────────────
//
// The browser SW that handles FCM background messages must be served at
// /firebase-messaging-sw.js (or wherever serviceWorkerURL points). It's
// a tiny script that re-imports firebase + initializeApp + onBackgroundMessage.
// Place this file in the public/ directory at build time:
//
//   importScripts('https://www.gstatic.com/firebasejs/10.X.X/firebase-app-compat.js');
//   importScripts('https://www.gstatic.com/firebasejs/10.X.X/firebase-messaging-compat.js');
//
//   firebase.initializeApp({ apiKey, authDomain, projectId, messagingSenderId, appId });
//   const messaging = firebase.messaging();
//   messaging.onBackgroundMessage((payload) => {
//     const { title, body } = payload.notification ?? {};
//     self.registration.showNotification(title ?? 'New message', { body, data: payload.data });
//   });
//
// The dev guide in airlift-chat/README.md should document this once
// Firebase is wired in production.
