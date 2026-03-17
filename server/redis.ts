import Redis from "ioredis";

let redisClient: Redis | null = null;
let redisAvailable = false;

export function getRedisClient(): Redis | null {
  return redisAvailable ? redisClient : null;
}

export function isRedisAvailable(): boolean {
  return redisAvailable;
}

export async function initRedis(): Promise<Redis | null> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log("[Redis] No REDIS_URL configured — using in-memory fallback for cache and rate limiting");
    return null;
  }

  try {
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) {
          console.log("[Redis] Max reconnection attempts reached — falling back to in-memory");
          redisAvailable = false;
          return null;
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    client.on("error", (err) => {
      console.error("[Redis] Connection error:", err.message);
      redisAvailable = false;
    });

    client.on("close", () => {
      console.log("[Redis] Connection closed");
      redisAvailable = false;
    });

    client.on("reconnecting", () => {
      console.log("[Redis] Reconnecting...");
    });

    client.on("ready", () => {
      console.log("[Redis] Ready");
      redisAvailable = true;
    });

    await Promise.race([
      client.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Connection timeout")), 5000)),
    ]);

    redisClient = client;
    redisAvailable = true;
    console.log("[Redis] Connected successfully");
    return client;
  } catch (err: any) {
    console.error("[Redis] Failed to connect:", err.message, "— using in-memory fallback");
    redisAvailable = false;
    return null;
  }
}
