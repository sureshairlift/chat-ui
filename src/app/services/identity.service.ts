/**
 * identity.service.ts — JWT decode + namespaced user_ref derivation.
 *
 * Mirrors apps/chat-service/internal/identity/user_ref.go on the Go side.
 * The frontend stores the raw JWT in localStorage (as set by the legacy
 * Airlift CRM auth flow) and uses this service to:
 *
 *   - Read the authenticated principal as a user_ref (op:42 / ext:3).
 *   - Tell whether the caller is internal vs external.
 *   - Surface the display name / email for UI rendering.
 *
 * The JWT is HS512-signed by the upstream identity provider; the frontend
 * does NOT verify the signature (the Go gateway does). This service just
 * base64-decodes the payload portion.
 */
import { Injectable, computed, signal } from '@angular/core';

import type { UserRef } from '../models/api-types';

// Matches the legacy Airlift CRM convention — the same key that the
// shared-pkg auth middleware accepts as the `x-token` header value.
const STORAGE_KEY = 'x-token';

interface JWTClaims {
  id?: number;
  designation?: string;
  designation_value?: string;
  email?: string;
  user_name?: string;
  is_external?: boolean;
  customer_type?: string;
  refer_id?: string;
  role?: string;
  exp?: number;
  iat?: number;
  sub?: string;
}

interface Principal {
  ref: UserRef;
  id: number;
  isExternal: boolean;
  name: string;
  email: string;
  designation?: string;
}

@Injectable({ providedIn: 'root' })
export class IdentityService {
  private readonly tokenSignal = signal<string | null>(null);
  private readonly principalSignal = signal<Principal | null>(null);

  /** Reactive principal (or null when not authenticated). */
  readonly principal = this.principalSignal.asReadonly();
  /** Convenience: just the ref string, or empty when unauthenticated. */
  readonly userRef = computed<UserRef>(() => this.principal()?.ref ?? '');
  /** True iff the principal exists and is external (customer-portal user). */
  readonly isExternal = computed(() => this.principal()?.isExternal ?? false);

  constructor() {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.setToken(stored);
      }
    }
  }

  /** Replace the active JWT. Pass null to log out. */
  setToken(token: string | null): void {
    this.tokenSignal.set(token);
    if (typeof localStorage !== 'undefined') {
      if (token) {
        localStorage.setItem(STORAGE_KEY, token);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    this.principalSignal.set(token ? this.derive(token) : null);
  }

  /** Current JWT bytes for outbound Authorization headers. */
  token(): string | null {
    return this.tokenSignal();
  }

  /** True iff a token is present AND not past its exp. */
  isAuthenticated(): boolean {
    const t = this.tokenSignal();
    if (!t) return false;
    const claims = decodeJWT(t);
    if (!claims?.exp) return true; // no exp claim — assume valid (legacy tokens)
    return claims.exp * 1000 > Date.now();
  }

  /** Build the user_ref string from the JWT claims. */
  private derive(token: string): Principal | null {
    const claims = decodeJWT(token);
    if (!claims?.id || claims.id <= 0) {
      return null;
    }
    const isExternal = !!claims.is_external || !!(claims.refer_id ?? '').toString().trim();
    return {
      id: claims.id,
      isExternal,
      ref: `${isExternal ? 'ext' : 'op'}:${claims.id}`,
      name: claims.user_name ?? `User-${claims.id}`,
      email: claims.email ?? '',
      designation: claims.designation,
    };
  }
}

/** Decode the payload portion of a JWT. Returns null on any error.
 *  No signature verification — that's the gateway's job. */
function decodeJWT(token: string): JWTClaims | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const json = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as JWTClaims;
  } catch {
    return null;
  }
}

/** Pure helpers — exported for components that don't want a full DI dep. */

export function refOp(id: number): UserRef { return `op:${id}`; }
export function refExt(id: number): UserRef { return `ext:${id}`; }
export const REF_BOT_AI: UserRef = 'bot:ai';

export function isBotRef(ref: UserRef): boolean { return ref.startsWith('bot:'); }
export function isExternalRef(ref: UserRef): boolean { return ref.startsWith('ext:'); }
export function isInternalRef(ref: UserRef): boolean { return ref.startsWith('op:'); }

/** Parse `op:42` / `ext:3` / `bot:ai` into its parts. Returns null on invalid. */
export function parseRef(ref: UserRef): { kind: 'op' | 'ext' | 'bot'; id?: number; slug?: string } | null {
  const m = ref.match(/^(op|ext|bot):([A-Za-z0-9_-]{1,64})$/);
  if (!m) return null;
  const kind = m[1] as 'op' | 'ext' | 'bot';
  const tail = m[2];
  if (kind === 'bot') return { kind, slug: tail };
  const id = Number.parseInt(tail, 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  return { kind, id };
}
