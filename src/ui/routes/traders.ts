import { Router } from 'express';
import { ENV } from '../../config/env';

const router = Router();

// GET /api/traders - Get list of tracked traders
router.get('/', (req, res) => {
    try {
        const traders = ENV.USER_ADDRESSES.map((address) => ({
            address,
            shortAddress: `${address.slice(0, 6)}...${address.slice(-4)}`,
            polymarketUrl: `https://polymarket.com/profile/${address}`,
        }));

        res.json({
            traders,
            count: traders.length,
        });
    } catch (error) {
        console.error('Error fetching traders:', error);
        res.status(500).json({
            error: 'Failed to fetch traders',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

export default router;
