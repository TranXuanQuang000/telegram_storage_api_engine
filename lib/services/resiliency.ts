import { logger } from '../logger.js';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenSuccessThreshold?: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private totalRequests = 0;
  private totalFailures = 0;
  private lastStateChangeTime = Date.now();

  private failureThreshold: number;
  private resetTimeoutMs: number;
  private halfOpenSuccessThreshold: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30000;
    this.halfOpenSuccessThreshold = options.halfOpenSuccessThreshold ?? 2;
  }

  public getState(): CircuitState {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastStateChangeTime >= this.resetTimeoutMs) {
        this.transitionTo('HALF_OPEN');
      }
    }
    return this.state;
  }

  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === 'OPEN') {
      logger.warn({ msg: 'Circuit breaker is OPEN. Rejecting execution.' });
      throw new Error('CIRCUIT_BREAKER_OPEN: Service temporarily unavailable due to high error rate.');
    }

    this.totalRequests++;

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    this.successCount++;
    if (this.state === 'HALF_OPEN') {
      if (this.successCount >= this.halfOpenSuccessThreshold) {
        this.transitionTo('CLOSED');
      }
    } else if (this.state === 'CLOSED') {
      this.failureCount = 0;
    }
  }

  private onFailure() {
    this.failureCount++;
    this.totalFailures++;

    if (this.state === 'CLOSED' && this.failureCount >= this.failureThreshold) {
      this.transitionTo('OPEN');
    } else if (this.state === 'HALF_OPEN') {
      this.transitionTo('OPEN');
    }
  }

  private transitionTo(newState: CircuitState) {
    logger.info({
      msg: 'Circuit breaker state transition',
      from: this.state,
      to: newState,
      failureCount: this.failureCount,
    });
    this.state = newState;
    this.lastStateChangeTime = Date.now();

    if (newState === 'HALF_OPEN') {
      this.successCount = 0;
    } else if (newState === 'CLOSED') {
      this.failureCount = 0;
      this.successCount = 0;
    }
  }

  public getMetrics() {
    const errorRate = this.totalRequests > 0 ? (this.totalFailures / this.totalRequests) * 100 : 0;
    return {
      state: this.getState(),
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      errorRate: Number(errorRate.toFixed(2)),
    };
  }
}

/**
 * Sliding Window Adaptive Rate Limiter
 */
export class AdaptiveRateLimiter {
  private requests: number[] = [];
  private windowSizeMs: number;
  private maxRequests: number;

  constructor(maxRequests = 100, windowSizeMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowSizeMs = windowSizeMs;
  }

  public isAllowed(): { allowed: boolean; remaining: number; retryAfterMs: number } {
    const now = Date.now();
    this.requests = this.requests.filter((timestamp) => now - timestamp < this.windowSizeMs);

    if (this.requests.length >= this.maxRequests) {
      const oldest = this.requests[0];
      const retryAfterMs = Math.max(0, this.windowSizeMs - (now - oldest));
      return { allowed: false, remaining: 0, retryAfterMs };
    }

    this.requests.push(now);
    return {
      allowed: true,
      remaining: this.maxRequests - this.requests.length,
      retryAfterMs: 0,
    };
  }
}

/**
 * Proxy Pool Rotation mechanism
 */
export class ProxyPool {
  private proxies: string[];
  private currentIndex = 0;

  constructor(proxies: string[] = []) {
    this.proxies = proxies;
  }

  public addProxy(proxyUrl: string) {
    if (!this.proxies.includes(proxyUrl)) {
      this.proxies.push(proxyUrl);
    }
  }

  public getNextProxy(): string | null {
    if (this.proxies.length === 0) return null;
    const proxy = this.proxies[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
    return proxy;
  }
}

export const globalCircuitBreaker = new CircuitBreaker();
export const globalRateLimiter = new AdaptiveRateLimiter(200, 60000);
export const globalProxyPool = new ProxyPool();
