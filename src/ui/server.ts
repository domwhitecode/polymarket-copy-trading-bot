import express from 'express';
import path from 'path';
import connectDB, { closeDB } from '../config/db';
import balanceRouter from './routes/balance';
import positionsRouter from './routes/positions';
import tradesRouter from './routes/trades';
import tradersRouter from './routes/traders';
import settingsRouter from './routes/settings';

const app = express();
const PORT = process.env.UI_PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CORS for local development
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// API Routes
app.use('/api/balance', balanceRouter);
app.use('/api/positions', positionsRouter);
app.use('/api/trades', tradesRouter);
app.use('/api/traders', tradersRouter);
app.use('/api/settings', settingsRouter);

// Serve index.html for root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// Start server
async function startServer() {
    try {
        // Connect to MongoDB
        await connectDB();
        console.log('Connected to MongoDB');

        app.listen(PORT, () => {
            console.log(`\n====================================`);
            console.log(`  PolyCopy Dashboard`);
            console.log(`  Running at: http://localhost:${PORT}`);
            console.log(`====================================\n`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await closeDB();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nShutting down...');
    await closeDB();
    process.exit(0);
});

startServer();
