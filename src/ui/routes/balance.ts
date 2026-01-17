import { Router } from 'express';
import getMyBalance from '../../utils/getMyBalance';
import { ENV } from '../../config/env';

const router = Router();

router.get('/', async (req, res) => {
    try {
        const balance = await getMyBalance(ENV.PROXY_WALLET);
        res.json({
            balance,
            wallet: ENV.PROXY_WALLET,
            timestamp: Date.now(),
        });
    } catch (error) {
        console.error('Error fetching balance:', error);
        res.status(500).json({
            error: 'Failed to fetch balance',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

export default router;
