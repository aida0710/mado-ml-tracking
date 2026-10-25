import { DomainError } from '../domain/errors.js';

export interface RateLimit {
  attempts: number;
  windowMs: number;
}

// APIのプロセスごとの上限。メモリにしか持たないので再起動で戻るが、アカウントのロックではなく
// オンラインでの推測を遅らせるためのものなので、それでかまわない。
// オフィスの共有NATからは、1つのアドレスから1分間に正当なログインが多数来ることがある。
export const LOCAL_LOGIN_IP_LIMIT: RateLimit = { attempts: 30, windowMs: 60_000 };
// 多数のアドレスから1つのアカウントを推測する攻撃は、そのユーザー名での失敗回数で抑える。
export const LOCAL_LOGIN_USERNAME_FAILURE_LIMIT: RateLimit = {
  attempts: 10,
  windowMs: 15 * 60_000,
};
// OIDCの開始ごとにstateの行を1つ保存する。1つのアドレスが作れる行数をこれで抑える。
export const OIDC_START_IP_LIMIT: RateLimit = { attempts: 20, windowMs: 60_000 };
// 盗まれたsessionで現在のパスワードを総当たりできないようにする。
export const CURRENT_PASSWORD_LIMIT: RateLimit = { attempts: 10, windowMs: 15 * 60_000 };
// Argon2idの検査1回で約19MiBを使う。4つまでにして、ログインが集中してもAPIのメモリを
// 使い切らないようにする。
export const MAX_CONCURRENT_PASSWORD_CHECKS = 4;
// パスワードの検査が混んでいるとき、クライアントはこの秒数のあとに再試行する。
export const PASSWORD_CHECK_BUSY_RETRY_SECONDS = 1;
// 多数のアドレスやユーザー名が試されたときのbucketのMapの大きさを抑える。
const MAX_BUCKETS = 2_000;

interface Bucket {
  count: number;
  resetAt: number;
}

// 共通のエラーハンドラが応答する前に、経路側でretryAfterSecondsをRetry-Afterヘッダーに写す。
export class RateLimitedError extends DomainError {
  constructor(readonly retryAfterSeconds: number) {
    super({ status: 429, code: 'rate_limited', message: 'too many attempts; wait and try again' });
  }
}

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export class AuthRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private activePasswordChecks = 0;

  constructor(
    private readonly maxConcurrentPasswordChecks = MAX_CONCURRENT_PASSWORD_CHECKS,
    private readonly maxBuckets = MAX_BUCKETS,
    private readonly now: () => number = () => Date.now(),
  ) {
    if (maxBuckets < 1) throw new Error('maxBuckets must be at least 1');
  }

  // 試行を1回数え、期間内の許容回数を使い切っていればRateLimitedErrorを投げる。
  consumeOrThrow(key: string, limit: RateLimit): void {
    const decision = this.consume(key, limit);
    if (!decision.allowed) throw new RateLimitedError(decision.retryAfterSeconds);
  }

  // 試行を数えずに、keyの許容回数が尽きていればRateLimitedErrorを投げる。
  checkOrThrow(key: string, limit: RateLimit): void {
    const decision = this.check(key, limit);
    if (!decision.allowed) throw new RateLimitedError(decision.retryAfterSeconds);
  }

  // 試行を1回数え、期間内の許容回数を使い切っていれば拒否する。
  consume(key: string, limit: RateLimit): RateLimitDecision {
    const exhausted = this.check(key, limit);
    if (!exhausted.allowed) return exhausted;
    this.record(key, limit);
    return { allowed: true };
  }

  // 試行を数えずに、keyの許容回数が尽きているかを返す。
  check(key: string, limit: RateLimit): RateLimitDecision {
    const bucket = this.liveBucket(key);
    if (!bucket || bucket.count < limit.attempts) return { allowed: true };
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - this.now()) / 1000)),
    };
  }

  // 試行を1回数える。失敗だけを数える上限で使う。
  record(key: string, limit: RateLimit): void {
    const bucket = this.liveBucket(key);
    if (bucket) {
      // Mapの挿入順を新しさの順に兼用し、追い出しで最も長く使われていないkeyを消す。
      this.buckets.delete(key);
      this.buckets.set(key, bucket);
      bucket.count += 1;
      return;
    }
    this.ensureCapacity();
    this.buckets.set(key, { count: 1, resetAt: this.now() + limit.windowMs });
  }

  // パスワードのハッシュ化か検証を実行する。既に多く動いているときは429で拒否する。
  async passwordCheck<T>(task: () => Promise<T>): Promise<T> {
    if (this.activePasswordChecks >= this.maxConcurrentPasswordChecks)
      throw new RateLimitedError(PASSWORD_CHECK_BUSY_RETRY_SECONDS);
    this.activePasswordChecks += 1;
    try {
      return await task();
    } finally {
      this.activePasswordChecks -= 1;
    }
  }

  private liveBucket(key: string): Bucket | undefined {
    const bucket = this.buckets.get(key);
    if (bucket && bucket.resetAt <= this.now()) {
      this.buckets.delete(key);
      return undefined;
    }
    return bucket;
  }

  private ensureCapacity(): void {
    if (this.buckets.size < this.maxBuckets) return;
    const now = this.now();
    for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
    while (this.buckets.size >= this.maxBuckets) {
      const oldest = this.buckets.keys().next().value;
      if (oldest === undefined) break;
      this.buckets.delete(oldest);
    }
  }
}
