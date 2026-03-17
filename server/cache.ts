import { getRedisClient, isRedisAvailable } from "./redis";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class ServerCache {
  private memCache = new Map<string, CacheEntry<any>>();

  async get<T>(key: string): Promise<T | undefined> {
    if (isRedisAvailable()) {
      try {
        const redis = getRedisClient();
        if (redis) {
          const raw = await redis.get(`cache:${key}`);
          if (raw) return JSON.parse(raw) as T;
          return undefined;
        }
      } catch {
        // fall through to memory
      }
    }

    const entry = this.memCache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.memCache.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number = 60000): Promise<void> {
    this.memCache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });

    if (isRedisAvailable()) {
      try {
        const redis = getRedisClient();
        if (redis) {
          const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
          await redis.set(`cache:${key}`, JSON.stringify(value), "EX", ttlSec);
        }
      } catch {
        // in-memory fallback already set above
      }
    }
  }

  async invalidate(key: string): Promise<void> {
    this.memCache.delete(key);

    if (isRedisAvailable()) {
      try {
        const redis = getRedisClient();
        if (redis) await redis.del(`cache:${key}`);
      } catch {
        // already removed from memory
      }
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const keys = Array.from(this.memCache.keys());
    for (const key of keys) {
      if (key.startsWith(pattern)) {
        this.memCache.delete(key);
      }
    }

    if (isRedisAvailable()) {
      try {
        const redis = getRedisClient();
        if (redis) {
          const redisKeys = await redis.keys(`cache:${pattern}*`);
          if (redisKeys.length > 0) {
            await redis.del(...redisKeys);
          }
        }
      } catch {
        // already cleared from memory
      }
    }
  }

  async clear(): Promise<void> {
    this.memCache.clear();

    if (isRedisAvailable()) {
      try {
        const redis = getRedisClient();
        if (redis) {
          const keys = await redis.keys("cache:*");
          if (keys.length > 0) await redis.del(...keys);
        }
      } catch {
        // memory already cleared
      }
    }
  }
}

export const serverCache = new ServerCache();
