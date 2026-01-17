import { Router } from 'express';
import { fetchPositions, closePosition } from '../services/positionService';

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

export default router;
