import { Router } from 'express';
import { fetchPositions, closePosition } from '../services/positionService';
import { redeemAllResolved, getRedeemablePositions } from '../services/redeemService';

const router = Router();

// GET /api/positions - Fetch all open positions
router.get('/', async (req, res) => {
    try {
        const positions = await fetchPositions();

        // Sort by current value descending
        const sortedPositions = positions.sort((a, b) =>
            (b.currentValue || 0) - (a.currentValue || 0)
        );

        // Calculate totals
        const totalValue = positions.reduce((sum, p) => sum + (p.currentValue || 0), 0);
        const totalPnl = positions.reduce((sum, p) => sum + (p.cashPnl || 0), 0);

        res.json({
            positions: sortedPositions,
            summary: {
                count: positions.length,
                totalValue,
                totalPnl,
            },
            timestamp: Date.now(),
        });
    } catch (error) {
        console.error('Error fetching positions:', error);
        res.status(500).json({
            error: 'Failed to fetch positions',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// POST /api/positions/:asset/close - Close a position
router.post('/:asset/close', async (req, res) => {
    try {
        const { asset } = req.params;
        const { percentage } = req.body;

        if (percentage === undefined || percentage === null) {
            return res.status(400).json({
                error: 'Missing percentage',
                message: 'Please provide a percentage (0-100) in the request body',
            });
        }

        const percentNum = parseFloat(percentage);
        if (isNaN(percentNum) || percentNum < 0 || percentNum > 100) {
            return res.status(400).json({
                error: 'Invalid percentage',
                message: 'Percentage must be a number between 0 and 100',
            });
        }

        const result = await closePosition(asset, percentNum);

        if (result.success) {
            res.json({
                success: true,
                tokensSold: result.tokensSold,
                tokensRemaining: result.tokensRemaining,
                totalValue: result.totalValue,
                message: `Successfully sold ${result.tokensSold.toFixed(4)} tokens for $${result.totalValue.toFixed(2)}`,
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error,
                tokensSold: result.tokensSold,
                tokensRemaining: result.tokensRemaining,
                totalValue: result.totalValue,
            });
        }
    } catch (error) {
        console.error('Error closing position:', error);
        res.status(500).json({
            error: 'Failed to close position',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// GET /api/positions/redeemable - Get count of redeemable positions
router.get('/redeemable', async (req, res) => {
    try {
        const { redeemable, total, totalValue } = await getRedeemablePositions();
        res.json({
            count: total,
            totalValue,
            positions: redeemable.map(p => ({
                title: p.title,
                outcome: p.outcome,
                size: p.size,
                currentValue: p.currentValue,
                curPrice: p.curPrice,
            })),
        });
    } catch (error) {
        console.error('Error fetching redeemable positions:', error);
        res.status(500).json({
            error: 'Failed to fetch redeemable positions',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// POST /api/positions/redeem-resolved - Redeem all resolved positions
router.post('/redeem-resolved', async (req, res) => {
    try {
        const result = await redeemAllResolved();

        if (result.success) {
            res.json({
                success: true,
                redeemedCount: result.redeemedCount,
                failedCount: result.failedCount,
                totalValue: result.totalValue,
                details: result.details,
                message: result.redeemedCount > 0
                    ? `Redeemed ${result.redeemedCount} positions for ~$${result.totalValue.toFixed(2)}`
                    : 'No positions to redeem',
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error,
                redeemedCount: result.redeemedCount,
                failedCount: result.failedCount,
                details: result.details,
            });
        }
    } catch (error) {
        console.error('Error redeeming positions:', error);
        res.status(500).json({
            error: 'Failed to redeem positions',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// POST /api/positions/close-all - Close all positions at 100%
router.post('/close-all', async (req, res) => {
    try {
        const positions = await fetchPositions();

        if (positions.length === 0) {
            return res.json({
                success: true,
                closedCount: 0,
                failedCount: 0,
                totalValue: 0,
                message: 'No positions to close',
            });
        }

        const results: Array<{
            asset: string;
            title: string;
            success: boolean;
            tokensSold: number;
            value: number;
            error?: string;
        }> = [];

        let closedCount = 0;
        let failedCount = 0;
        let totalValue = 0;

        for (const position of positions) {
            const result = await closePosition(position.asset, 100);

            if (result.success) {
                closedCount++;
                totalValue += result.totalValue;
                results.push({
                    asset: position.asset,
                    title: position.title,
                    success: true,
                    tokensSold: result.tokensSold,
                    value: result.totalValue,
                });
            } else {
                failedCount++;
                results.push({
                    asset: position.asset,
                    title: position.title,
                    success: false,
                    tokensSold: result.tokensSold,
                    value: result.totalValue,
                    error: result.error,
                });
            }

            // Small delay between closes
            if (positions.length > 1) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }

        res.json({
            success: closedCount > 0 || positions.length === 0,
            closedCount,
            failedCount,
            totalValue,
            details: results,
            message: `Closed ${closedCount}/${positions.length} positions for $${totalValue.toFixed(2)}`,
        });
    } catch (error) {
        console.error('Error closing all positions:', error);
        res.status(500).json({
            error: 'Failed to close all positions',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

export default router;
