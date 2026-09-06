/**
 * Stale-while-revalidate for one value read from a slow, failing dependency.
 *
 * - A fresh value (younger than `ttlMs`) is returned at once.
 * - An older value is returned at once too, and one refresh starts behind it.
 *   Everyone who asks while it runs shares that one refresh; there is never a
 *   second one in flight.
 * - With no value at all, the caller waits for the refresh, but only up to
 *   `deadlineMs`. The refresh keeps running after the caller gave up.
 * - A failed refresh backs off: no new refresh starts for a while, doubling
 *   per failure up to `backoffMaxMs`. The value, if any, stays.
 * - `status()` says how old the value is, whether it is past `staleAfterMs`,
 *   and what the last failure said. The age is never reset by a failure.
 */
export type SwrOptions<T> = {
  load: () => Promise<T>;
  ttlMs: number;
  staleAfterMs: number;
  deadlineMs: number;
  backoffMinMs?: number;
  backoffMaxMs?: number;
  /** Turns an error into the message kept in `status()`; strip anything secret here. */
  describe?: (e: unknown) => string;
  onValue?: (v: T) => void;
  onError?: (message: string, failures: number) => void;
  now?: () => number;
};

export type SwrStatus = {
  known: boolean;
  stale: boolean;
  readAt: number | null;
  ageSeconds: number | null;
  error: string | null;
  errorAt: number | null;
  failures: number;
  inflight: boolean;
};

export class Swr<T> {
  private value: T | null = null;
  private readAt = 0;
  private error: string | null = null;
  private errorAt: number | null = null;
  private failures = 0;
  private backoffUntil = 0;
  private inflight: Promise<T> | null = null;
  private readonly o: Required<Pick<SwrOptions<T>, "backoffMinMs" | "backoffMaxMs" | "describe" | "now">> & SwrOptions<T>;

  constructor(o: SwrOptions<T>) {
    this.o = { backoffMinMs: 3_000, backoffMaxMs: 60_000, describe: (e) => String((e as Error)?.message ?? e), now: () => Date.now(), ...o };
  }

  /** The value to use now, or null when none was ever read and the refresh did not answer before the deadline. Never throws. */
  async get(): Promise<T | null> {
    const now = this.o.now();
    if (this.value !== null && now - this.readAt < this.o.ttlMs) return this.value;
    const mayRead = now >= this.backoffUntil;
    if (this.value !== null) {
      if (mayRead) this.refresh().catch(() => {});
      return this.value;
    }
    if (!mayRead && !this.inflight) return null;
    try {
      return await withDeadline(this.refresh(), this.o.deadlineMs);
    } catch {
      return null;
    }
  }

  /** The value without starting anything. */
  peek(): T | null {
    return this.value;
  }

  /** One read, shared by everyone who asks while it runs. Rejects on failure. */
  refresh(): Promise<T> {
    if (this.inflight) return this.inflight;
    this.inflight = this.o.load()
      .then((v) => {
        this.value = v;
        this.readAt = this.o.now();
        this.error = null;
        this.failures = 0;
        this.backoffUntil = 0;
        this.o.onValue?.(v);
        return v;
      })
      .catch((e) => {
        this.error = this.o.describe(e);
        this.errorAt = this.o.now();
        this.failures++;
        this.backoffUntil = this.o.now() + Math.min(this.o.backoffMaxMs, this.o.backoffMinMs * 2 ** (this.failures - 1));
        this.o.onError?.(this.error, this.failures);
        throw e;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  status(): SwrStatus {
    const now = this.o.now();
    const known = this.value !== null;
    return {
      known,
      stale: known && now - this.readAt > this.o.staleAfterMs,
      readAt: known ? this.readAt : null,
      ageSeconds: known ? Math.floor((now - this.readAt) / 1000) : null,
      error: this.error,
      errorAt: this.errorAt,
      failures: this.failures,
      inflight: this.inflight !== null,
    };
  }
}

export function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
