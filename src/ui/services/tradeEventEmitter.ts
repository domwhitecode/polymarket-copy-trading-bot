import { EventEmitter } from 'events';
import mongoose from 'mongoose';
import { ENV } from '../../config/env';

export interface TradeEvent {
    id: string;
    timestamp: number;
    side: string;
    market: string;
    outcome: string;
    size: number;
    usdcSize: number;
    price: number;
    transactionHash: string;
    traderAddress: string;
    eventSlug: string;
}

class TradeEventEmitter extends EventEmitter {
    private lastCheckedTimestamp: number = Date.now() - 24 * 60 * 60 * 1000; // Last 24 hours
    private pollingInterval: NodeJS.Timeout | null = null;
    private isRunning: boolean = false;

    constructor() {
        super();
        this.setMaxListeners(100); // Allow many SSE connections
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;

        // Poll every 2 seconds for new trades
        this.pollingInterval = setInterval(() => this.checkForNewTrades(), 2000);

        // Initial check
        await this.checkForNewTrades();
    }

    stop() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        this.isRunning = false;
    }

    private async checkForNewTrades() {
        try {
            const trades: TradeEvent[] = [];
            const db = mongoose.connection.db;

            if (!db) {
                console.warn('Database not connected yet');
                return;
            }

            // Query each tracked user's activities collection for bot-executed trades
            for (const userAddress of ENV.USER_ADDRESSES) {
                const collectionName = `user_activities_${userAddress}`;

                // Check if collection exists
                const collections = await db
                    .listCollections({ name: collectionName })
                    .toArray();

                if (collections.length === 0) continue;

                const collection = db.collection(collectionName);

                // Find new bot-executed trades
                const newTrades = await collection
                    .find({
                        bot: true,
                        timestamp: { $gt: this.lastCheckedTimestamp },
                    })
                    .sort({ timestamp: -1 })
                    .limit(10)
                    .toArray();

                for (const trade of newTrades) {
                    trades.push({
                        id: trade._id.toString(),
                        timestamp: trade.timestamp,
                        side: trade.side || 'UNKNOWN',
                        market: trade.title || 'Unknown Market',
                        outcome: trade.outcome || 'Unknown',
                        size: trade.size || 0,
                        usdcSize: trade.usdcSize || 0,
                        price: trade.price || 0,
                        transactionHash: trade.transactionHash || '',
                        traderAddress: userAddress,
                        eventSlug: trade.eventSlug || '',
                    });
                }
            }

            // Sort all trades by timestamp descending
            trades.sort((a, b) => b.timestamp - a.timestamp);

            // Emit each new trade
            for (const trade of trades) {
                if (trade.timestamp > this.lastCheckedTimestamp) {
                    this.emit('trade', trade);
                }
            }

            // Update last checked timestamp
            if (trades.length > 0) {
                this.lastCheckedTimestamp = Math.max(
                    this.lastCheckedTimestamp,
                    ...trades.map((t) => t.timestamp)
                );
            }
        } catch (error) {
            console.error('Error checking for new trades:', error);
        }
    }

    async getRecentTrades(limit: number = 50): Promise<TradeEvent[]> {
        const trades: TradeEvent[] = [];
        const db = mongoose.connection.db;

        if (!db) {
            console.warn('Database not connected yet');
            return [];
        }

        try {
            for (const userAddress of ENV.USER_ADDRESSES) {
                const collectionName = `user_activities_${userAddress}`;

                // Check if collection exists
                const collections = await db
                    .listCollections({ name: collectionName })
                    .toArray();

                if (collections.length === 0) continue;

                const collection = db.collection(collectionName);

                // Find recent bot-executed trades
                const recentTrades = await collection
                    .find({
                        bot: true,
                    })
                    .sort({ timestamp: -1 })
                    .limit(limit)
                    .toArray();

                for (const trade of recentTrades) {
                    trades.push({
                        id: trade._id.toString(),
                        timestamp: trade.timestamp,
                        side: trade.side || 'UNKNOWN',
                        market: trade.title || 'Unknown Market',
                        outcome: trade.outcome || 'Unknown',
                        size: trade.size || 0,
                        usdcSize: trade.usdcSize || 0,
                        price: trade.price || 0,
                        transactionHash: trade.transactionHash || '',
                        traderAddress: userAddress,
                        eventSlug: trade.eventSlug || '',
                    });
                }
            }

            // Sort by timestamp descending and limit
            trades.sort((a, b) => b.timestamp - a.timestamp);
            return trades.slice(0, limit);
        } catch (error) {
            console.error('Error fetching recent trades:', error);
            return [];
        }
    }
}

// Export singleton instance
export const tradeEmitter = new TradeEventEmitter();
