import { Router, Request, Response } from 'express';
import { tradeEmitter, TradeEvent } from '../services/tradeEventEmitter';

const router = Router();

// Track SSE clients
const clients: Set<Response> = new Set();

// GET /api/trades/stream - SSE endpoint for real-time trades
router.get('/stream', (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Connected to trade stream' })}\n\n`);

    // Start the emitter if not already running
    tradeEmitter.start();

    // Add client to set
    clients.add(res);

    // Handler for new trades
    const tradeHandler = (trade: TradeEvent) => {
        res.write(`event: trade\ndata: ${JSON.stringify(trade)}\n\n`);
    };

    tradeEmitter.on('trade', tradeHandler);

    // Send heartbeat every 30 seconds to keep connection alive
    const heartbeat = setInterval(() => {
        res.write(`event: heartbeat\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
    }, 30000);

    // Clean up on client disconnect
    req.on('close', () => {
        clearInterval(heartbeat);
        tradeEmitter.off('trade', tradeHandler);
        clients.delete(res);

        // Stop emitter if no more clients
        if (clients.size === 0) {
            tradeEmitter.stop();
        }
    });
});

// GET /api/trades - Get recent trades (REST endpoint)
router.get('/', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
        const trades = await tradeEmitter.getRecentTrades(limit);

        res.json({
            trades,
            count: trades.length,
            timestamp: Date.now(),
        });
    } catch (error) {
        console.error('Error fetching trades:', error);
        res.status(500).json({
            error: 'Failed to fetch trades',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

export default router;
