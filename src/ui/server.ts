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

    // Check for token in Authorization header or query param (for SSE which doesn't support headers)
    let authToken: string | undefined;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Basic ')) {
        authToken = authHeader.split(' ')[1];
    } else if (req.query.token && typeof req.query.token === 'string') {
        // SSE connections pass token as query param
        authToken = req.query.token;
    }

    if (!authToken) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }

    try {
        const credentials = Buffer.from(authToken, 'base64').toString();
        const [username, password] = credentials.split(':');

        if (username === ENV.UI_AUTH_USERNAME && password === ENV.UI_AUTH_PASSWORD) {
            next();
            return;
        }
    } catch {
        // Invalid base64 or parsing error
    }

    // Return JSON for invalid credentials
    res.status(401).json({ error: 'Invalid credentials' });
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

// Start UI server - exported for integration with main bot
export function startUIServer(): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
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
                resolve();
            });
        } catch (error) {
            console.error('Failed to start UI server:', error);
            reject(error);
        }
    });
}

// Standalone mode - only runs when this file is executed directly
async function startStandalone() {
    try {
        // Connect to MongoDB (only needed in standalone mode)
        await connectDB();
        console.log('Connected to MongoDB');
        await startUIServer();
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown (only for standalone mode)
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

// Check if running as main module (standalone mode)
if (require.main === module) {
    startStandalone();
}
