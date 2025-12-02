# Polymarket Copy Trading Bot

<div align="center">

**Automatically copy trades from successful Polymarket traders**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-LTS-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)

</div>

---

## Overview

Automated trading bot that monitors a selected trader's activity on Polymarket and executes matching trades in your account with proportional position sizing.

**Key Features:**
- 🔄 Real-time trade monitoring and execution
- 📊 Proportional position sizing based on account balance
- 🛡️ Price validation and retry mechanisms
- 💾 Persistent trade history in MongoDB

## Prerequisites

- Node.js v16+ and npm
- MongoDB (local or Atlas)
- Polymarket account with funded wallet
- Polygon RPC access (Infura, Alchemy, etc.)

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/vladmeer/polymarket-copy-trading-bot.git
cd polymarket-copy-trading-bot
npm install
```

### 2. Configure Environment

Create `.env` file:

```env
# Required
USER_ADDRESS=0xYourTargetTraderWalletAddress
PROXY_WALLET=0xYourPolymarketWalletAddress
PRIVATE_KEY=YourWalletPrivateKey
CLOB_HTTP_URL=https://clob.polymarket.com/
CLOB_WS_URL=wss://ws-subscriptions-clob.polymarket.com/ws
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/database
RPC_URL=https://polygon-mainnet.infura.io/v3/YOUR_INFURA_KEY
USDC_CONTRACT_ADDRESS=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174

# Optional (defaults shown)
FETCH_INTERVAL=1
TOO_OLD_TIMESTAMP=24
RETRY_LIMIT=3
```

### 3. Build & Run

```bash
npm run build
npm run start
```

For development: `npm run dev`

## Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `USER_ADDRESS` | Target trader wallet address | ✅ |
| `PROXY_WALLET` | Your Polymarket wallet address | ✅ |
| `PRIVATE_KEY` | Your wallet private key | ✅ |
| `CLOB_HTTP_URL` | Polymarket CLOB API endpoint | ✅ |
| `MONGO_URI` | MongoDB connection string | ✅ |
| `RPC_URL` | Polygon RPC endpoint | ✅ |
| `USDC_CONTRACT_ADDRESS` | USDC contract on Polygon | ✅ |
| `FETCH_INTERVAL` | Polling interval (seconds) | ❌ |
| `TOO_OLD_TIMESTAMP` | Max trade age (hours) | ❌ |
| `RETRY_LIMIT` | Max retry attempts | ❌ |

## How It Works

1. **Monitor** → Polls Polymarket API for target trader's trades
2. **Store** → Saves trades to MongoDB
3. **Analyze** → Compares positions and balances
4. **Execute** → Places proportional orders via CLOB API
5. **Retry** → Handles failed trades automatically

**Trading Strategies:**
- **Buy**: Proportional sizing based on balance ratio with price validation
- **Sell**: Proportional sell based on position ratios
- **Merge**: Closes positions when target trader merges

## Deployment

**Recommended VPS**: [TradingVPS.io](https://app.tradingvps.io/link.php?id=11) (Germany location for low latency)

**Production Setup:**
```bash
npm install -g pm2
pm2 start dist/index.js --name polymarket-bot
pm2 save
pm2 startup
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Bot not detecting trades | Verify `USER_ADDRESS` and MongoDB connection |
| Trades not executing | Check `PRIVATE_KEY`, wallet balance, and RPC endpoint |
| MongoDB errors | Verify `MONGO_URI` and network connectivity |
| API errors | Check `CLOB_HTTP_URL` and wallet configuration |

## Security

- ✅ Never commit `.env` file
- ✅ Store private keys securely
- ✅ Use authenticated MongoDB connections
- ✅ Keep dependencies updated

## Support

- **Issues**: [GitHub Issues](https://github.com/vladmeer/polymarket-copy-trading-bot/issues)
- **Telegram**: [@vladmeer67](https://t.me/vladmeer67)
- **Documentation**: See `Polymarket Copy Trading Bot Documentation.pdf`

## Contributing

Contributions welcome! Fork, create a feature branch, and submit a PR.

```bash
npm run lint      # Check code
npm run lint:fix  # Fix issues
npm run format    # Format code
```

## Disclaimer

This software is provided "as is" without warranty. Trading involves substantial risk. Use at your own risk.

## License

ISC License

---

<div align="center">

**Made with ❤️ for the Polymarket community**

⭐ Star this repo if you find it helpful!

</div>
