import Redis from "ioredis";

let redisClient: Redis | null = null;
let redisAvailable = false;

export function getRedisClient(): Redis | null {
  return redisAvailable ? redisClient : null;
}

export function isRedisAvailable(): boolean {
  return redisAvailable;
}

export function initRedis(): Redis | null {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log("[Redis] No REDIS_URL configured — using in-memory fallback for cache and rate limiting");
    return null;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) {
          console.log("[Redis] Max reconnection attempts reached — falling back to in-memory");
          redisAvailable = false;
          return null;
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: false,
    });

    redisClient.on("connect", () => {
      console.log("[Redis] Connected successfully");
      redisAvailable = true;
    });

    redisClient.on("error", (err) => {
      console.error("[Redis] Connection error:", err.message);
      redisAvailable = false;
    });

    redisClient.on("close", () => {
      console.log("[Redis] Connection closed");
      redisAvailable = false;
    });

    redisAvailable = true;
    return redisClient;
  } catch (err: any) {
    console.error("[Redis] Failed to initialize:", err.message);
    redisAvailable = false;
    return null;
  }
}
