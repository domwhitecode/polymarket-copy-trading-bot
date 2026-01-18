/**
 * Simple in-memory cache for reducing redundant API calls
 * Used for positions, balance, and order book data
 */

interface CacheEntry<T> {
    data: T;
    expires: number;
}

class SimpleCache {
    private cache = new Map<string, CacheEntry<any>>();

    /**
     * Get cached data or fetch and cache if expired/missing
     */
    async get<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
        const cached = this.cache.get(key);
        if (cached && cached.expires > Date.now()) {
            return cached.data;
        }
        const data = await fetcher();
        this.cache.set(key, { data, expires: Date.now() + ttlMs });
        return data;
    }

    /**
     * Invalidate a specific cache entry
     */
    invalidate(key: string): void {
        this.cache.delete(key);
    }

    /**
     * Invalidate all entries matching a prefix
     */
    invalidatePrefix(prefix: string): void {
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Clear all cache entries
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Get cache stats for debugging
     */
    stats(): { size: number; keys: string[] } {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys()),
        };
    }
}

export const cache = new SimpleCache();

// Cache keys
export const CACHE_KEYS = {
    myPositions: 'my_positions',
    myBalance: 'my_balance',
    traderPositions: (addr: string) => `trader_positions_${addr.toLowerCase()}`,
    orderBook: (asset: string) => `order_book_${asset}`,
};

// TTLs (milliseconds) - configurable via ENV
export const CACHE_TTL = {
    positions: parseInt(process.env.CACHE_POSITIONS_TTL || '10000', 10),  // 10 seconds
    balance: parseInt(process.env.CACHE_BALANCE_TTL || '10000', 10),       // 10 seconds
    orderBook: parseInt(process.env.CACHE_ORDERBOOK_TTL || '3000', 10),    // 3 seconds
};
