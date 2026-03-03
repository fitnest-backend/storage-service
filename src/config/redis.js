import Redis from 'ioredis';

const redis = new Redis({
    host: process.env.REDIS_HOST || 'redis.fitnest-dev.svc.cluster.local',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB || 0),
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
});

redis.on('error', (err) => {
    console.warn('[Redis] Connection error:', err.message);
});

async function initRedis() {
    try {
        if (redis.status === 'wait') {
            await redis.connect();
            console.log('[Redis] Connected successfully');
        }
    } catch (e) {
        console.warn('[Redis] Connection failed, will fallback to no-cache mode:', e.message);
    }
}

export {
    redis,
    initRedis
};
