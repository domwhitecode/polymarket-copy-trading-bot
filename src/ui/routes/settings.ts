import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { pause, resume, getState } from '../../utils/botState';

const router = Router();

// Settings that are safe to edit via UI
const EDITABLE_SETTINGS = [
    'USER_ADDRESSES',
    'COPY_STRATEGY',
    'COPY_SIZE',
    'TRADE_MULTIPLIER',
    'MAX_ORDER_SIZE_USD',
    'MIN_ORDER_SIZE_USD',
    'FETCH_INTERVAL',
    'RETRY_LIMIT',
    'TRADE_AGGREGATION_ENABLED',
    'TRADE_AGGREGATION_WINDOW_SECONDS',
];

// Parse .env file into object
function parseEnvFile(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = content.split('\n');

    for (const line of lines) {
        // Skip comments and empty lines
        if (line.startsWith('#') || !line.trim()) continue;

        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            let value = match[2].trim();
            // Remove quotes if present
            if ((value.startsWith("'") && value.endsWith("'")) ||
                (value.startsWith('"') && value.endsWith('"'))) {
                value = value.slice(1, -1);
            }
            result[key] = value;
        }
    }

    return result;
}

// Serialize object back to .env format, preserving comments and structure
function updateEnvFile(originalContent: string, updates: Record<string, string>): string {
    const lines = originalContent.split('\n');
    const result: string[] = [];
    const updatedKeys = new Set<string>();

    for (const line of lines) {
        // Preserve comments and empty lines
        if (line.startsWith('#') || !line.trim()) {
            result.push(line);
            continue;
        }

        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            if (key in updates && EDITABLE_SETTINGS.includes(key)) {
                // Update with new value, preserving quotes style
                result.push(`${key}='${updates[key]}'`);
                updatedKeys.add(key);
            } else {
                // Keep original line
                result.push(line);
            }
        } else {
            result.push(line);
        }
    }

    return result.join('\n');
}

// GET /api/settings - Read current settings
router.get('/', (req, res) => {
    try {
        const envPath = path.join(process.cwd(), '.env');

        if (!fs.existsSync(envPath)) {
            return res.status(404).json({
                error: '.env file not found',
                message: 'Please run npm run setup first',
            });
        }

        const content = fs.readFileSync(envPath, 'utf-8');
        const allSettings = parseEnvFile(content);

        // Only return editable settings
        const settings: Record<string, string> = {};
        for (const key of EDITABLE_SETTINGS) {
            if (key in allSettings) {
                settings[key] = allSettings[key];
            }
        }

        res.json({
            settings,
            editableKeys: EDITABLE_SETTINGS,
        });
    } catch (error) {
        console.error('Error reading settings:', error);
        res.status(500).json({
            error: 'Failed to read settings',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// POST /api/settings - Update settings
router.post('/', (req, res) => {
    try {
        const envPath = path.join(process.cwd(), '.env');

        if (!fs.existsSync(envPath)) {
            return res.status(404).json({
                error: '.env file not found',
                message: 'Please run npm run setup first',
            });
        }

        const updates = req.body;

        // Validate that only editable settings are being updated
        for (const key of Object.keys(updates)) {
            if (!EDITABLE_SETTINGS.includes(key)) {
                return res.status(400).json({
                    error: 'Invalid setting',
                    message: `Setting '${key}' cannot be modified via UI`,
                });
            }
        }

        // Validate USER_ADDRESSES format
        if (updates.USER_ADDRESSES) {
            const addresses = updates.USER_ADDRESSES.split(',').map((a: string) => a.trim());
            for (const addr of addresses) {
                if (addr && !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
                    return res.status(400).json({
                        error: 'Invalid address',
                        message: `Invalid Ethereum address: ${addr}`,
                    });
                }
            }
        }

        // Validate COPY_STRATEGY
        if (updates.COPY_STRATEGY && !['PERCENTAGE', 'FIXED', 'ADAPTIVE'].includes(updates.COPY_STRATEGY)) {
            return res.status(400).json({
                error: 'Invalid strategy',
                message: 'COPY_STRATEGY must be PERCENTAGE, FIXED, or ADAPTIVE',
            });
        }

        // Read current .env file
        const originalContent = fs.readFileSync(envPath, 'utf-8');

        // Create backup
        const backupPath = path.join(process.cwd(), '.env.backup');
        fs.writeFileSync(backupPath, originalContent);

        // Update and write new content
        const newContent = updateEnvFile(originalContent, updates);
        fs.writeFileSync(envPath, newContent);

        res.json({
            success: true,
            message: 'Settings saved. Restart the bot for changes to take effect.',
            updatedKeys: Object.keys(updates),
        });
    } catch (error) {
        console.error('Error saving settings:', error);
        res.status(500).json({
            error: 'Failed to save settings',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// GET /api/settings/bot-status - Get bot pause status
router.get('/bot-status', (_req, res) => {
    const state = getState();
    res.json({
        isPaused: state.isPaused,
        pausedAt: state.pausedAt,
        pausedBy: state.pausedBy,
    });
});

// POST /api/settings/pause - Pause the bot
router.post('/pause', (_req, res) => {
    pause('UI Dashboard');
    console.log('[Bot] Trading PAUSED via UI Dashboard');
    res.json({
        success: true,
        message: 'Bot paused. No new buy orders will be executed.',
        isPaused: true,
    });
});

// POST /api/settings/resume - Resume the bot
router.post('/resume', (_req, res) => {
    resume();
    console.log('[Bot] Trading RESUMED via UI Dashboard');
    res.json({
        success: true,
        message: 'Bot resumed. Trading is now active.',
        isPaused: false,
    });
});

export default router;
