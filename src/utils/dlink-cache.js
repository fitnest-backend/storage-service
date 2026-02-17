const { redis } = require('../config/redis');

const DLINK_TTL = 3600; // 1 hour
const LOCK_TTL_MS = 12000; // 12 seconds
const KEY_PREFIX = 'tb:dlink:';
const LOCK_PREFIX = 'tb:dlink:lock:';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function key(fsId) { return `${KEY_PREFIX}${fsId}`; }
function lockKey(fsId) { return `${LOCK_PREFIX}${fsId}`; }

const UNLOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

async function tryLock(k, token) {
    try {
        return await redis.set(k, token, 'PX', LOCK_TTL_MS, 'NX');
    } catch (e) {
        return null;
    }
}

async function unlock(k, token) {
    try {
        await redis.eval(UNLOCK_LUA, 1, k, token);
    } catch { }
}

/**
 * Shared dlink retrieval with Redis caching and stampede control.
 */
async function getDlinkShared(fsId, resolveDlinkFn) {
    // If Redis is unavailable, fallback to direct resolution
    if (redis.status !== 'ready') {
        return resolveDlinkFn(fsId);
    }

    const cacheKey = key(fsId);

    try {
        // 1) Primary Cache check
        const cached = await redis.get(cacheKey);
        if (cached) return cached;

        // 2) Stampede control (locking)
        const lk = lockKey(fsId);
        const token = `${process.pid}-${Date.now()}-${Math.random()}`;

        const gotLock = await tryLock(lk, token);
        if (gotLock) {
            try {
                // Double-check after acquiring lock
                const again = await redis.get(cacheKey);
                if (again) return again;

                // Perform the expensive operation (Terabox Handshake)
                const dlink = await resolveDlinkFn(fsId);
                if (!dlink) return null;

                // 3) Store in shared cache
                await redis.set(cacheKey, dlink, 'EX', DLINK_TTL);
                return dlink;
            } finally {
                await unlock(lk, token);
            }
        }

        // 4) Wait and retry if someone else is resolving
        for (let i = 0; i < 6; i++) {
            await sleep(100 + Math.floor(Math.random() * 100));
            const v = await redis.get(cacheKey);
            if (v) return v;
        }

        // 5) Final Fallback
        return resolveDlinkFn(fsId);
    } catch (err) {
        console.error(`[dlink-cache] Error for ${fsId}:`, err.message);
        return resolveDlinkFn(fsId);
    }
}

module.exports = {
    getDlinkShared
};
