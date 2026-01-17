// State
let positions = [];
let currentAsset = null;
let eventSource = null;

// DOM elements
const walletEl = document.getElementById('wallet-address');
const balanceEl = document.getElementById('balance');
const tradesListEl = document.getElementById('trades-list');
const positionsBodyEl = document.getElementById('positions-body');
const connectionStatusEl = document.getElementById('connection-status');
const totalValueEl = document.getElementById('total-value');
const totalPnlEl = document.getElementById('total-pnl');
const positionCountEl = document.getElementById('position-count');
const modal = document.getElementById('close-modal');
const modalMarketInfo = document.getElementById('modal-market-info');
const closePercentageInput = document.getElementById('close-percentage');
const confirmCloseBtn = document.getElementById('confirm-close-btn');
const tradersDropdown = document.getElementById('traders-dropdown');
const tradersBtn = document.getElementById('traders-btn');
const tradersListEl = document.getElementById('traders-list');
const tradersCountEl = document.getElementById('traders-count');

// Settings modal elements
const settingsModal = document.getElementById('settings-modal');
const settingsBtn = document.getElementById('settings-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const settingUserAddresses = document.getElementById('setting-user-addresses');
const settingCopyStrategy = document.getElementById('setting-copy-strategy');
const settingCopySize = document.getElementById('setting-copy-size');
const settingTradeMultiplier = document.getElementById('setting-trade-multiplier');
const settingMaxOrder = document.getElementById('setting-max-order');
const settingMinOrder = document.getElementById('setting-min-order');
const settingFetchInterval = document.getElementById('setting-fetch-interval');
const settingRetryLimit = document.getElementById('setting-retry-limit');
const settingAggregation = document.getElementById('setting-aggregation');

// Refresh buttons
const refreshBalanceBtn = document.getElementById('refresh-balance-btn');
const refreshPositionsBtn = document.getElementById('refresh-positions-btn');

// Close All / Redeem buttons and modal
const closeAllModal = document.getElementById('close-all-modal');
const closeAllInfoEl = document.getElementById('close-all-info');
const confirmCloseAllBtn = document.getElementById('confirm-close-all-btn');
const closeAllBtn = document.getElementById('close-all-btn');
const redeemResolvedBtn = document.getElementById('redeem-resolved-btn');

// Utility functions
function formatAddress(address) {
    if (!address) return 'Unknown';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatCurrency(value) {
    return `$${value.toFixed(2)}`;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/New_York'
    });
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();

    // Compare dates in EST
    const estOptions = { timeZone: 'America/New_York' };
    const dateEST = date.toLocaleDateString('en-US', estOptions);
    const nowEST = now.toLocaleDateString('en-US', estOptions);
    const isToday = dateEST === nowEST;

    if (isToday) {
        return formatTime(timestamp);
    }

    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/New_York'
    });
}

function getPnlClass(value) {
    if (value > 0) return 'pnl-positive';
    if (value < 0) return 'pnl-negative';
    return '';
}

function truncate(str, maxLength) {
    if (!str) return '';
    return str.length > maxLength ? str.slice(0, maxLength) + '...' : str;
}

// API functions
async function fetchBalance() {
    try {
        const response = await fetch('/api/balance');
        const data = await response.json();

        walletEl.textContent = formatAddress(data.wallet);
        balanceEl.textContent = formatCurrency(data.balance);
    } catch (error) {
        console.error('Error fetching balance:', error);
        walletEl.textContent = 'Error';
        balanceEl.textContent = '$---.--';
    }
}

async function fetchPositions() {
    try {
        const response = await fetch('/api/positions');
        const data = await response.json();

        positions = data.positions || [];

        // Update summary
        totalValueEl.textContent = formatCurrency(data.summary?.totalValue || 0);
        const pnl = data.summary?.totalPnl || 0;
        totalPnlEl.textContent = (pnl >= 0 ? '+' : '') + formatCurrency(pnl);
        totalPnlEl.className = `value ${getPnlClass(pnl)}`;
        positionCountEl.textContent = data.summary?.count || 0;

        renderPositions();
    } catch (error) {
        console.error('Error fetching positions:', error);
        positionsBodyEl.innerHTML = '<tr><td colspan="6" class="empty-state">Error loading positions</td></tr>';
    }
}

async function fetchRecentTrades() {
    try {
        const response = await fetch('/api/trades?limit=20');
        const data = await response.json();

        if (data.trades && data.trades.length > 0) {
            tradesListEl.innerHTML = '';
            data.trades.forEach(trade => addTradeToList(trade, false));
        }
    } catch (error) {
        console.error('Error fetching recent trades:', error);
    }
}

async function fetchTraders() {
    try {
        const response = await fetch('/api/traders');
        const data = await response.json();

        tradersCountEl.textContent = data.count || 0;
        renderTraders(data.traders || []);
    } catch (error) {
        console.error('Error fetching traders:', error);
        tradersListEl.innerHTML = '<p class="empty-state">Error loading traders</p>';
    }
}

function renderTraders(traders) {
    if (traders.length === 0) {
        tradersListEl.innerHTML = '<p class="empty-state">No traders configured</p>';
        return;
    }

    tradersListEl.innerHTML = traders.map(trader => `
        <div class="trader-item">
            <span class="trader-address">${trader.address}</span>
            <a href="${trader.polymarketUrl}" target="_blank" class="trader-link">View Profile</a>
        </div>
    `).join('');
}

// Traders dropdown toggle
tradersBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    tradersDropdown.classList.toggle('open');
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!tradersDropdown.contains(e.target)) {
        tradersDropdown.classList.remove('open');
    }
});

// Render functions
function renderPositions() {
    if (positions.length === 0) {
        positionsBodyEl.innerHTML = '<tr><td colspan="6" class="empty-state">No open positions</td></tr>';
        return;
    }

    positionsBodyEl.innerHTML = positions.map(pos => {
        const pnlValue = pos.cashPnl || 0;
        const pnlPercent = pos.percentPnl || 0;
        const pnlClass = getPnlClass(pnlValue);
        const pnlSign = pnlValue >= 0 ? '+' : '';
        const marketUrl = pos.eventSlug ? `https://polymarket.com/event/${pos.eventSlug}` : '';
        const clickableClass = marketUrl ? 'clickable-row' : '';
        const iconHtml = pos.icon ? `<img src="${pos.icon}" alt="" class="market-icon" onerror="this.style.display='none'">` : '';

        return `
            <tr class="${clickableClass}" data-url="${marketUrl}">
                <td class="market-cell" title="${pos.title || 'Unknown'}">
                    ${iconHtml}
                    <span>${truncate(pos.title || 'Unknown', 25)}</span>
                </td>
                <td>${pos.outcome || '-'}</td>
                <td>${(pos.size || 0).toFixed(2)}</td>
                <td>${formatCurrency(pos.currentValue || 0)}</td>
                <td class="${pnlClass}">${pnlSign}${formatCurrency(pnlValue)} (${pnlSign}${pnlPercent.toFixed(1)}%)</td>
                <td>
                    <button class="btn btn-close" onclick="event.stopPropagation(); openCloseModal('${pos.asset}')">Close</button>
                </td>
            </tr>
        `;
    }).join('');

    // Add click handlers for clickable rows
    document.querySelectorAll('.clickable-row').forEach(row => {
        row.addEventListener('click', () => {
            const url = row.getAttribute('data-url');
            if (url) {
                window.open(url, '_blank');
            }
        });
    });
}

function addTradeToList(trade, prepend = true) {
    const sideClass = trade.side?.toLowerCase() || 'buy';
    const tradeEl = document.createElement('div');
    tradeEl.className = `trade-item ${sideClass}`;

    // Make clickable if eventSlug exists
    if (trade.eventSlug) {
        tradeEl.classList.add('clickable');
        tradeEl.addEventListener('click', () => {
            window.open(`https://polymarket.com/event/${trade.eventSlug}`, '_blank');
        });
    }

    tradeEl.innerHTML = `
        <div class="trade-header">
            <span class="trade-side ${sideClass}">${trade.side || 'UNKNOWN'} ${formatCurrency(trade.usdcSize || 0)}</span>
            <span class="trade-time">${formatDate(trade.timestamp)}</span>
        </div>
        <div class="trade-market" title="${trade.market || ''}">${truncate(trade.market || 'Unknown Market', 35)} - ${trade.outcome || ''}</div>
        <div class="trade-details">
            <span>@ ${formatCurrency(trade.price || 0)}</span>
            <span>${(trade.size || 0).toFixed(2)} tokens</span>
        </div>
    `;

    const emptyState = tradesListEl.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    if (prepend) {
        tradesListEl.prepend(tradeEl);
        // Keep only last 50 trades
        while (tradesListEl.children.length > 50) {
            tradesListEl.lastChild.remove();
        }
    } else {
        tradesListEl.appendChild(tradeEl);
    }
}

// SSE connection
function connectSSE() {
    if (eventSource) {
        eventSource.close();
    }

    eventSource = new EventSource('/api/trades/stream');

    eventSource.addEventListener('connected', (e) => {
        console.log('Connected to trade stream');
        updateConnectionStatus(true);
    });

    eventSource.addEventListener('trade', (e) => {
        try {
            const trade = JSON.parse(e.data);
            addTradeToList(trade, true);
            // Refresh positions after a trade
            setTimeout(fetchPositions, 2000);
        } catch (error) {
            console.error('Error parsing trade:', error);
        }
    });

    eventSource.addEventListener('heartbeat', (e) => {
        console.log('Heartbeat received');
    });

    eventSource.onerror = (e) => {
        console.error('SSE error:', e);
        updateConnectionStatus(false);

        // Reconnect after 5 seconds
        setTimeout(connectSSE, 5000);
    };
}

function updateConnectionStatus(connected) {
    const dot = connectionStatusEl.querySelector('.status-dot');
    const text = connectionStatusEl.querySelector('span:last-child');

    if (connected) {
        dot.className = 'status-dot connected';
        text.textContent = 'Connected';
    } else {
        dot.className = 'status-dot disconnected';
        text.textContent = 'Disconnected';
    }
}

// Modal functions
function openCloseModal(asset) {
    currentAsset = asset;
    const position = positions.find(p => p.asset === asset);

    if (!position) {
        alert('Position not found');
        return;
    }

    modalMarketInfo.innerHTML = `
        <strong>${position.title || 'Unknown Market'}</strong><br>
        Outcome: ${position.outcome || '-'}<br>
        Current size: ${(position.size || 0).toFixed(2)} tokens<br>
        Current value: ${formatCurrency(position.currentValue || 0)}
    `;

    closePercentageInput.value = 100;
    modal.classList.add('active');
}

function closeModal() {
    modal.classList.remove('active');
    currentAsset = null;
}

function setPercentage(value) {
    closePercentageInput.value = value;
}

async function confirmClose() {
    if (!currentAsset) return;

    const percentage = parseFloat(closePercentageInput.value);

    if (isNaN(percentage) || percentage < 1 || percentage > 100) {
        alert('Please enter a valid percentage (1-100)');
        return;
    }

    confirmCloseBtn.disabled = true;
    confirmCloseBtn.textContent = 'Closing...';

    try {
        const response = await fetch(`/api/positions/${encodeURIComponent(currentAsset)}/close`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ percentage }),
        });

        const result = await response.json();

        if (result.success) {
            alert(result.message || 'Position closed successfully');
            closeModal();
            // Refresh data
            await Promise.all([fetchPositions(), fetchBalance()]);
        } else {
            alert(`Failed to close position: ${result.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error closing position:', error);
        alert('Error closing position. Please try again.');
    } finally {
        confirmCloseBtn.disabled = false;
        confirmCloseBtn.textContent = 'Close Position';
    }
}

// Close modal on outside click
modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        closeModal();
    }
});

// Close modal on escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
        closeModal();
    }
    if (e.key === 'Escape' && settingsModal.classList.contains('active')) {
        closeSettingsModal();
    }
    if (e.key === 'Escape' && closeAllModal.classList.contains('active')) {
        closeCloseAllModal();
    }
});

// Settings modal functions
function openSettingsModal() {
    fetchSettings();
    settingsModal.classList.add('active');
}

function closeSettingsModal() {
    settingsModal.classList.remove('active');
}

async function fetchSettings() {
    try {
        const response = await fetch('/api/settings');
        const data = await response.json();

        if (data.settings) {
            const s = data.settings;
            settingUserAddresses.value = s.USER_ADDRESSES || '';
            settingCopyStrategy.value = s.COPY_STRATEGY || 'PERCENTAGE';
            settingCopySize.value = s.COPY_SIZE || '';
            settingTradeMultiplier.value = s.TRADE_MULTIPLIER || '';
            settingMaxOrder.value = s.MAX_ORDER_SIZE_USD || '';
            settingMinOrder.value = s.MIN_ORDER_SIZE_USD || '';
            settingFetchInterval.value = s.FETCH_INTERVAL || '';
            settingRetryLimit.value = s.RETRY_LIMIT || '';
            settingAggregation.checked = s.TRADE_AGGREGATION_ENABLED === 'true';
        }
    } catch (error) {
        console.error('Error fetching settings:', error);
        alert('Failed to load settings');
    }
}

async function saveSettings() {
    const settings = {
        USER_ADDRESSES: settingUserAddresses.value.trim(),
        COPY_STRATEGY: settingCopyStrategy.value,
        COPY_SIZE: settingCopySize.value,
        TRADE_MULTIPLIER: settingTradeMultiplier.value,
        MAX_ORDER_SIZE_USD: settingMaxOrder.value,
        MIN_ORDER_SIZE_USD: settingMinOrder.value,
        FETCH_INTERVAL: settingFetchInterval.value,
        RETRY_LIMIT: settingRetryLimit.value,
        TRADE_AGGREGATION_ENABLED: settingAggregation.checked ? 'true' : 'false',
    };

    // Remove empty values
    Object.keys(settings).forEach(key => {
        if (settings[key] === '') {
            delete settings[key];
        }
    });

    saveSettingsBtn.disabled = true;
    saveSettingsBtn.textContent = 'Saving...';

    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(settings),
        });

        const result = await response.json();

        if (result.success) {
            alert(result.message || 'Settings saved successfully');
            closeSettingsModal();
            // Refresh traders list since USER_ADDRESSES may have changed
            fetchTraders();
        } else {
            alert(`Failed to save settings: ${result.error || result.message || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        alert('Error saving settings. Please try again.');
    } finally {
        saveSettingsBtn.disabled = false;
        saveSettingsBtn.textContent = 'Save Settings';
    }
}

// Settings button click handler
settingsBtn.addEventListener('click', () => {
    openSettingsModal();
});

// Refresh balance button click handler
refreshBalanceBtn.addEventListener('click', async () => {
    refreshBalanceBtn.classList.add('spinning');
    await fetchBalance();
    setTimeout(() => refreshBalanceBtn.classList.remove('spinning'), 500);
});

// Refresh positions button click handler
refreshPositionsBtn.addEventListener('click', async () => {
    refreshPositionsBtn.classList.add('spinning');
    await fetchPositions();
    setTimeout(() => refreshPositionsBtn.classList.remove('spinning'), 500);
});

// Redeem resolved positions
redeemResolvedBtn.addEventListener('click', async () => {
    redeemResolvedBtn.disabled = true;
    redeemResolvedBtn.textContent = 'Redeeming...';

    try {
        const response = await fetch('/api/positions/redeem-resolved', {
            method: 'POST',
        });
        const result = await response.json();

        if (result.success) {
            alert(result.message || 'Positions redeemed successfully');
            fetchPositions();
            fetchBalance();
        } else {
            alert(`Failed to redeem: ${result.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error redeeming positions:', error);
        alert('Error redeeming positions. Please try again.');
    } finally {
        redeemResolvedBtn.disabled = false;
        redeemResolvedBtn.textContent = 'Redeem Resolved';
    }
});

// Close All button - open confirmation modal
closeAllBtn.addEventListener('click', () => {
    if (positions.length === 0) {
        alert('No positions to close');
        return;
    }

    const totalValue = positions.reduce((sum, p) => sum + (p.currentValue || 0), 0);
    closeAllInfoEl.textContent = `You have ${positions.length} position(s) with a total value of ${formatCurrency(totalValue)}.`;
    closeAllModal.classList.add('active');
});

// Close All modal functions
function closeCloseAllModal() {
    closeAllModal.classList.remove('active');
}

async function confirmCloseAll() {
    confirmCloseAllBtn.disabled = true;
    confirmCloseAllBtn.textContent = 'Closing...';

    try {
        const response = await fetch('/api/positions/close-all', {
            method: 'POST',
        });
        const result = await response.json();

        closeCloseAllModal();

        if (result.success) {
            alert(result.message || 'All positions closed successfully');
            fetchPositions();
            fetchBalance();
        } else {
            alert(`Failed to close all: ${result.error || 'Unknown error'}\nClosed: ${result.closedCount}, Failed: ${result.failedCount}`);
        }
    } catch (error) {
        console.error('Error closing all positions:', error);
        alert('Error closing positions. Please try again.');
    } finally {
        confirmCloseAllBtn.disabled = false;
        confirmCloseAllBtn.textContent = 'Close All Positions';
    }
}

// Close all modal on outside click
closeAllModal.addEventListener('click', (e) => {
    if (e.target === closeAllModal) {
        closeCloseAllModal();
    }
});

// Close settings modal on outside click
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        closeSettingsModal();
    }
});

// Initialize
async function init() {
    // Initial data fetch
    await Promise.all([
        fetchBalance(),
        fetchPositions(),
        fetchRecentTrades(),
        fetchTraders(),
    ]);

    // Connect to SSE for real-time updates
    connectSSE();

    // Refresh positions every 30 seconds
    setInterval(fetchPositions, 30000);

    // Refresh balance every 60 seconds
    setInterval(fetchBalance, 60000);
}

// Start the app
init();
