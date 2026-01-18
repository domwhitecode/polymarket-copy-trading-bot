/**
 * WebSocket-based trade monitor for real-time trade detection
 * Uses Polymarket's RTDS (Real-Time Data Stream) for instant trade notifications
 * Falls back to HTTP polling if WebSocket connection fails
 */

import { RealTimeDataClient, Message, ConnectionStatus } from '@polymarket/real-time-data-client';
import { EventEmitter } from 'events';
import { ENV } from '../config/env';
import { getUserActivityModel } from '../models/userHistory';
import Logger from '../utils/logger';

const USER_ADDRESSES = ENV.USER_ADDRESSES;
const TOO_OLD_TIMESTAMP = ENV.TOO_OLD_TIMESTAMP;

// WebSocket configuration
const WS_RECONNECT_ATTEMPTS = parseInt(process.env.WS_RECONNECT_ATTEMPTS || '10', 10);
const WS_RECONNECT_DELAY = parseInt(process.env.WS_RECONNECT_DELAY || '1000', 10);

// Trade message structure from Polymarket WebSocket
interface WsTradePayload {
    asset?: string;
    user?: {
        address?: string;
        name?: string;
        pseudonym?: string;
        profile_picture?: string;
        optimized_profile_picture?: string;
        bio?: string;
    };
    market?: {
        condition_id?: string;
        slug?: string;
        question?: string;
        icon?: string;
    };
    event_slug?: string;
    outcome?: string;
    outcome_index?: number;
    price?: string;
    size?: string;
    side?: 'BUY' | 'SELL';
    transaction_hash?: string;
    timestamp?: string;
    fee_rate_bps?: string;
}

// Create user activity models for storing trades
const userModels = USER_ADDRESSES.map((address) => ({
    address: address.toLowerCase(),
    UserActivity: getUserActivityModel(address),
}));

export class WebSocketTradeMonitor extends EventEmitter {
    private client: RealTimeDataClient | null = null;
    private trackedAddresses: Set<string>;
    private isConnected = false;
    private reconnectAttempts = 0;
    private useFallback = false;

    constructor() {
        super();
        // Normalize addresses to lowercase for comparison
        this.trackedAddresses = new Set(
            USER_ADDRESSES.map((addr) => addr.toLowerCase())
        );
    }

    /**
     * Connect to Polymarket WebSocket
     */
    async connect(): Promise<void> {
        if (this.useFallback) {
            Logger.info('[WS] Fallback mode active, skipping WebSocket connection');
            return;
        }

        Logger.info('[WS] Connecting to Polymarket real-time data stream...');

        try {
            this.client = new RealTimeDataClient({
                onConnect: (client) => {
                    this.handleConnect(client);
                },
                onMessage: (client, message) => {
                    this.handleMessage(message);
                },
                onStatusChange: (status) => {
                    this.handleStatusChange(status);
                },
                autoReconnect: true,
                pingInterval: 30000, // 30 second ping interval
            });

            this.client.connect();
        } catch (error) {
            Logger.error(`[WS] Failed to create WebSocket client: ${error}`);
            this.scheduleReconnect();
        }
    }

    /**
     * Handle successful WebSocket connection
     */
    private handleConnect(client: RealTimeDataClient): void {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        Logger.success('[WS] Connected to Polymarket real-time data stream');

        // Subscribe to activity/trades topic for all trades
        // We filter by tracked wallet addresses client-side
        try {
            client.subscribe({
                subscriptions: [
                    {
                        topic: 'activity',
                        type: 'trades',
                        // No filters - receive all trades and filter client-side by address
                    },
                ],
            });
            Logger.info(`[WS] Subscribed to trades for ${this.trackedAddresses.size} wallet(s)`);
        } catch (error) {
            Logger.error(`[WS] Failed to subscribe: ${error}`);
        }
    }

    /**
     * Handle WebSocket connection status changes
     */
    private handleStatusChange(status: ConnectionStatus): void {
        switch (status) {
            case ConnectionStatus.CONNECTED:
                Logger.info('[WS] Status: Connected');
                this.isConnected = true;
                break;
            case ConnectionStatus.CONNECTING:
                Logger.info('[WS] Status: Connecting...');
                break;
            case ConnectionStatus.DISCONNECTED:
                Logger.warning('[WS] Status: Disconnected');
                this.isConnected = false;
                this.scheduleReconnect();
                break;
        }
    }

    /**
     * Handle incoming WebSocket messages
     */
    private async handleMessage(message: Message): Promise<void> {
        try {
            // Debug: log all incoming messages
            // Logger.info(`[WS] Message received - topic: ${message.topic}, type: ${message.type}`);

            // Only process trade messages from the activity topic
            if (message.topic !== 'activity' || message.type !== 'trades') {
                return;
            }

            const payload = message.payload as WsTradePayload;
            const userAddress = payload.user?.address?.toLowerCase();

            // Check if this trade is from a tracked wallet
            if (!userAddress || !this.trackedAddresses.has(userAddress)) {
                return;
            }

            Logger.info(
                `[WS] Trade detected from ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`
            );

            // Store trade in MongoDB (same as HTTP polling does)
            await this.storeTrade(userAddress, payload);

            // Emit event for immediate processing
            this.emit('trade', {
                userAddress,
                ...this.normalizeTradePayload(payload),
            });
        } catch (error) {
            Logger.error(`[WS] Error handling message: ${error}`);
        }
    }

    /**
     * Store trade in MongoDB
     */
    private async storeTrade(userAddress: string, payload: WsTradePayload): Promise<void> {
        const userModel = userModels.find((m) => m.address === userAddress);
        if (!userModel) {
            Logger.warning(`[WS] No model found for address ${userAddress}`);
            return;
        }

        const { UserActivity } = userModel;

        // Parse timestamp - WebSocket may send ISO string or Unix timestamp
        let timestamp: number;
        if (payload.timestamp) {
            const parsed = Date.parse(payload.timestamp);
            timestamp = isNaN(parsed) ? parseInt(payload.timestamp, 10) : Math.floor(parsed / 1000);
        } else {
            timestamp = Math.floor(Date.now() / 1000);
        }

        // Skip if too old
        const cutoffTime = Math.floor(Date.now() / 1000) - TOO_OLD_TIMESTAMP * 3600;
        if (timestamp < cutoffTime) {
            Logger.info(`[WS] Skipping old trade (timestamp: ${timestamp})`);
            return;
        }

        // Check if already exists (by transaction hash)
        const existingActivity = await UserActivity.findOne({
            transactionHash: payload.transaction_hash,
        }).exec();

        if (existingActivity) {
            return; // Already have this trade
        }

        // Calculate USDC size
        const size = parseFloat(payload.size || '0');
        const price = parseFloat(payload.price || '0');
        const usdcSize = size * price;

        // Save new trade
        const newActivity = new UserActivity({
            proxyWallet: userAddress,
            timestamp,
            conditionId: payload.market?.condition_id || '',
            type: 'TRADE',
            size,
            usdcSize,
            transactionHash: payload.transaction_hash || '',
            price,
            asset: payload.asset || '',
            side: payload.side || 'UNKNOWN',
            outcomeIndex: payload.outcome_index ?? 0,
            title: payload.market?.question || '',
            slug: payload.market?.slug || '',
            icon: payload.market?.icon || '',
            eventSlug: payload.event_slug || '',
            outcome: payload.outcome || '',
            name: payload.user?.name || '',
            pseudonym: payload.user?.pseudonym || '',
            bio: payload.user?.bio || '',
            profileImage: payload.user?.profile_picture || '',
            profileImageOptimized: payload.user?.optimized_profile_picture || '',
            bot: false, // Mark as unprocessed for trade executor
            botExcutedTime: 0,
        });

        await newActivity.save();
        Logger.success(`[WS] Trade stored: ${payload.side} $${usdcSize.toFixed(2)}`);
    }

    /**
     * Normalize trade payload for event emission
     */
    private normalizeTradePayload(payload: WsTradePayload) {
        const size = parseFloat(payload.size || '0');
        const price = parseFloat(payload.price || '0');

        return {
            conditionId: payload.market?.condition_id || '',
            asset: payload.asset || '',
            side: payload.side || 'UNKNOWN',
            size,
            price,
            usdcSize: size * price,
            transactionHash: payload.transaction_hash || '',
            timestamp: payload.timestamp
                ? Math.floor(Date.parse(payload.timestamp) / 1000)
                : Math.floor(Date.now() / 1000),
            eventSlug: payload.event_slug || '',
            outcome: payload.outcome || '',
            outcomeIndex: payload.outcome_index ?? 0,
            slug: payload.market?.slug || '',
        };
    }

    /**
     * Schedule reconnection with exponential backoff
     */
    private scheduleReconnect(): void {
        if (this.useFallback) {
            return;
        }

        if (this.reconnectAttempts >= WS_RECONNECT_ATTEMPTS) {
            Logger.error(`[WS] Max reconnection attempts (${WS_RECONNECT_ATTEMPTS}) reached`);
            Logger.warning('[WS] Switching to HTTP polling fallback');
            this.useFallback = true;
            this.emit('fallback'); // Signal to start HTTP polling
            return;
        }

        const delay = WS_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts);
        this.reconnectAttempts++;

        Logger.info(
            `[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${WS_RECONNECT_ATTEMPTS})`
        );

        setTimeout(() => {
            if (!this.useFallback) {
                this.connect();
            }
        }, delay);
    }

    /**
     * Disconnect from WebSocket
     */
    disconnect(): void {
        if (this.client) {
            try {
                this.client.disconnect();
            } catch (error) {
                // Ignore disconnect errors
            }
            this.client = null;
        }
        this.isConnected = false;
        Logger.info('[WS] Disconnected');
    }

    /**
     * Check if WebSocket is connected
     */
    get connected(): boolean {
        return this.isConnected;
    }

    /**
     * Check if using fallback mode
     */
    get isFallbackMode(): boolean {
        return this.useFallback;
    }

    /**
     * Reset fallback mode (for testing or manual recovery)
     */
    resetFallback(): void {
        this.useFallback = false;
        this.reconnectAttempts = 0;
    }
}

// Export singleton instance
export const wsTradeMonitor = new WebSocketTradeMonitor();
