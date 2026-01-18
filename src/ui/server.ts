import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import connectDB, { closeDB } from '../config/db';
import { ENV } from '../config/env';
import balanceRouter from './routes/balance';
import positionsRouter from './routes/positions';
import tradesRouter from './routes/trades';
import tradersRouter from './routes/traders';
import settingsRouter from './routes/settings';

const app = express();
const PORT = ENV.UI_PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CORS for local development
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Authentication middleware
const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    // Skip auth for health check (needed for Docker healthcheck)
    if (req.path === '/api/health') {
        next();
        return;
    }

    // IP whitelist check (if configured)
    const whitelist = ENV.UI_WHITELIST_IPS;
    if (whitelist.length > 0) {
        const clientIP = req.ip || req.socket.remoteAddress || '';
        // Handle IPv6-mapped IPv4 addresses (::ffff:192.168.1.1)
        const normalizedIP = clientIP.replace(/^::ffff:/, '');
        if (!whitelist.includes(normalizedIP) && !whitelist.includes(clientIP)) {
            res.status(403).send('Forbidden: IP not whitelisted');
            return;
        }
    }

    // Basic auth check (if enabled)
    if (!ENV.UI_AUTH_ENABLED) {
        next();
        return;
    }

    // Check if password is configured
    if (!ENV.UI_AUTH_PASSWORD) {
        console.warn('Warning: UI_AUTH_ENABLED is true but UI_AUTH_PASSWORD is not set');
        next();
        return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="PolyCopy Dashboard"');
        res.status(401).send('Authentication required');
        return;
    }

    try {
        const base64 = authHeader.split(' ')[1];
        const credentials = Buffer.from(base64, 'base64').toString();
        const [username, password] = credentials.split(':');

        if (username === ENV.UI_AUTH_USERNAME && password === ENV.UI_AUTH_PASSWORD) {
            next();
            return;
        }
    } catch {
        // Invalid base64 or parsing error
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="PolyCopy Dashboard"');
    res.status(401).send('Invalid credentials');
};

app.use(authMiddleware);

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
            if (ENV.UI_AUTH_ENABLED) {
                console.log(`  Auth: Enabled (user: ${ENV.UI_AUTH_USERNAME})`);
            } else {
                console.log(`  Auth: Disabled`);
            }
            if (ENV.UI_WHITELIST_IPS.length > 0) {
                console.log(`  IP Whitelist: ${ENV.UI_WHITELIST_IPS.length} IP(s)`);
            }
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
