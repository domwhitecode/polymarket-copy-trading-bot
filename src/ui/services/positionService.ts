import { AssetType, ClobClient, OrderType, Side } from '@polymarket/clob-client';
import createClobClient from '../../utils/createClobClient';
import { ENV } from '../../config/env';

const RETRY_LIMIT = ENV.RETRY_LIMIT;

export interface Position {
    asset: string;
    conditionId: string;
    size: number;
    avgPrice: number;
    currentValue: number;
    title: string;
    outcome: string;
    cashPnl?: number;
    percentPnl?: number;
    curPrice?: number;
    initialValue?: number;
    realizedPnl?: number;
    percentRealizedPnl?: number;
    icon?: string;
    eventSlug?: string;
}

export interface SellResult {
    success: boolean;
    tokensSold: number;
    tokensRemaining: number;
    totalValue: number;
    error?: string;
}

// Singleton CLOB client
let clobClientInstance: ClobClient | null = null;

async function getClobClient(): Promise<ClobClient> {
    if (!clobClientInstance) {
        clobClientInstance = await createClobClient();
    }
    return clobClientInstance;
}

export async function fetchPositions(): Promise<Position[]> {
    const url = `https://data-api.polymarket.com/positions?user=${ENV.PROXY_WALLET}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch positions: ${response.statusText}`);
    }
    return response.json();
}

export async function closePosition(
    asset: string,
    percentage: number
): Promise<SellResult> {
    // Validate percentage
    if (percentage < 0 || percentage > 100) {
        return {
            success: false,
            tokensSold: 0,
            tokensRemaining: 0,
            totalValue: 0,
            error: 'Percentage must be between 0 and 100',
        };
    }

    // Get current position
    const positions = await fetchPositions();
    const position = positions.find((p) => p.asset === asset);

    if (!position) {
        return {
            success: false,
            tokensSold: 0,
            tokensRemaining: 0,
            totalValue: 0,
            error: 'Position not found',
        };
    }

    const sellSize = position.size * (percentage / 100);

    if (sellSize < 0.01) {
        return {
            success: false,
            tokensSold: 0,
            tokensRemaining: position.size,
            totalValue: 0,
            error: 'Sell size below minimum (0.01 tokens)',
        };
    }

    const clobClient = await getClobClient();

    // Update balance cache before selling
    try {
        await clobClient.updateBalanceAllowance({
            asset_type: AssetType.CONDITIONAL,
            token_id: asset,
        });
    } catch (e) {
        console.warn('Warning: Could not update balance cache:', e);
    }

    let remaining = sellSize;
    let totalSold = 0;
    let totalValue = 0;
    let retry = 0;

    while (remaining > 0.01 && retry < RETRY_LIMIT) {
        try {
            // Get current order book
            const orderBook = await clobClient.getOrderBook(asset);

            if (!orderBook.bids || orderBook.bids.length === 0) {
                return {
                    success: totalSold > 0,
                    tokensSold: totalSold,
                    tokensRemaining: remaining,
                    totalValue,
                    error: 'No bids available in order book',
                };
            }

            // Find best bid
            const maxPriceBid = orderBook.bids.reduce((max, bid) => {
                return parseFloat(bid.price) > parseFloat(max.price) ? bid : max;
            }, orderBook.bids[0]);

            // Determine order size
            const orderAmount = Math.min(remaining, parseFloat(maxPriceBid.size));

            // Create sell order
            const orderArgs = {
                side: Side.SELL,
                tokenID: asset,
                amount: orderAmount,
                price: parseFloat(maxPriceBid.price),
            };

            const signedOrder = await clobClient.createMarketOrder(orderArgs);
            const resp = await clobClient.postOrder(signedOrder, OrderType.FOK);

            if (resp.success === true) {
                retry = 0;
                const soldValue = orderAmount * orderArgs.price;
                totalSold += orderAmount;
                totalValue += soldValue;
                remaining -= orderAmount;
            } else {
                retry += 1;
                if (retry < RETRY_LIMIT) {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            }
        } catch (error) {
            retry += 1;
            console.error(`Sell attempt ${retry}/${RETRY_LIMIT} failed:`, error);
            if (retry < RETRY_LIMIT) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }
    }

    return {
        success: totalSold > 0,
        tokensSold: totalSold,
        tokensRemaining: remaining,
        totalValue,
        error: remaining > 0.01 ? `Could not sell all tokens. ${remaining.toFixed(4)} remaining.` : undefined,
    };
}
