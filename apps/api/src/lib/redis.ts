import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  // Don't crash the whole app if Redis is down — just log
  lazyConnect: true,
  enableOfflineQueue: false,
});

redis.on("error", (err) => {
  console.error("[Redis] connection error:", err.message);
});

// TTL constants (seconds)
export const TTL = {
  SLOTS: 120,          // 2 min — slot availability changes frequently
  PROFILE: 300,        // 5 min — public profile rarely changes
  EVENT_TYPES: 30,     // 30 sec — admin list
  BOOKINGS: 30,        // 30 sec — admin bookings list
};

// Helpers to get/set JSON values with a TTL
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const val = await redis.get(key);
    if (!val) return null;
    return JSON.parse(val) as T;
  } catch {
    return null; // treat cache miss on parse error
  }
}

export async function cacheSet(key: string, value: unknown, ttl: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttl);
  } catch {
    // silently skip cache writes if Redis is unavailable
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  try {
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // ignore
  }
}

export default redis;
