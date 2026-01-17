import { Router } from 'express';
import { fetchPositions, closePosition } from '../services/positionService';
import { redeemAllResolved, getRedeemablePositions, redeemAllResolvedWithProgress } from '../services/redeemService';

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

// GET /api/positions/close-all/stream - SSE endpoint for closing all positions with real-time updates
router.get('/close-all/stream', async (req, res) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (event: string, data: object) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        const positions = await fetchPositions();

        if (positions.length === 0) {
            sendEvent('complete', {
                success: true,
                closedCount: 0,
                failedCount: 0,
                totalValue: 0,
                message: 'No positions to close',
            });
            res.end();
            return;
        }

        // Send initial data with all positions
        sendEvent('init', {
            total: positions.length,
            positions: positions.map(p => ({
                asset: p.asset,
                title: p.title,
                outcome: p.outcome,
                value: p.currentValue,
            })),
        });

        let closedCount = 0;
        let failedCount = 0;
        let totalValue = 0;

        for (let i = 0; i < positions.length; i++) {
            const position = positions[i];

            // Send "closing" event
            sendEvent('closing', {
                index: i,
                asset: position.asset,
                title: position.title,
            });

            const result = await closePosition(position.asset, 100);

            if (result.success) {
                closedCount++;
                totalValue += result.totalValue;
                sendEvent('closed', {
                    index: i,
                    asset: position.asset,
                    title: position.title,
                    success: true,
                    tokensSold: result.tokensSold,
                    value: result.totalValue,
                    closedCount,
                    failedCount,
                    totalValue,
                });
            } else {
                failedCount++;
                sendEvent('closed', {
                    index: i,
                    asset: position.asset,
                    title: position.title,
                    success: false,
                    error: result.error,
                    closedCount,
                    failedCount,
                    totalValue,
                });
            }

            // Small delay between closes
            if (i < positions.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
        }

        // Send completion event
        sendEvent('complete', {
            success: closedCount > 0 || positions.length === 0,
            closedCount,
            failedCount,
            totalValue,
            message: `Closed ${closedCount}/${positions.length} positions for $${totalValue.toFixed(2)}`,
        });

        res.end();
    } catch (error) {
        console.error('Error in close-all stream:', error);
        sendEvent('error', {
            error: 'Failed to close positions',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
        res.end();
    }
});

// GET /api/positions/redeem-resolved/stream - SSE endpoint for redeeming positions with real-time updates
router.get('/redeem-resolved/stream', async (req, res) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (event: string, data: object) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    let redeemedCount = 0;
    let failedCount = 0;
    let totalValue = 0;

    try {
        const result = await redeemAllResolvedWithProgress({
            onInit: (positions) => {
                if (positions.length === 0) {
                    sendEvent('complete', {
                        success: true,
                        redeemedCount: 0,
                        failedCount: 0,
                        totalValue: 0,
                        message: 'No positions to redeem',
                    });
                    return;
                }
                sendEvent('init', {
                    total: positions.length,
                    positions: positions.map(p => ({
                        conditionId: p.conditionId,
                        title: p.title,
                        outcome: p.outcome,
                        value: p.value,
                    })),
                });
            },
            onRedeeming: (index, position) => {
                sendEvent('redeeming', {
                    index,
                    conditionId: position.conditionId,
                    title: position.title,
                });
            },
            onRedeemed: (index, position, success, error) => {
                if (success) {
                    redeemedCount++;
                    totalValue += position.value;
                } else {
                    failedCount++;
                }
                sendEvent('redeemed', {
                    index,
                    conditionId: position.conditionId,
                    title: position.title,
                    success,
                    value: position.value,
                    error,
                    redeemedCount,
                    failedCount,
                    totalValue,
                });
            },
        });

        sendEvent('complete', {
            success: result.success,
            redeemedCount: result.redeemedCount,
            failedCount: result.failedCount,
            totalValue: result.totalValue,
            message: result.redeemedCount > 0
                ? `Redeemed ${result.redeemedCount} position(s) for ~$${result.totalValue.toFixed(2)}`
                : result.error || 'No positions to redeem',
        });

        res.end();
    } catch (error) {
        console.error('Error in redeem-resolved stream:', error);
        sendEvent('error', {
            error: 'Failed to redeem positions',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
        res.end();
    }
});

export default router;
