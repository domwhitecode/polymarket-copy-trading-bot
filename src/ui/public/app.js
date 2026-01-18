/* global document, window, EventSource */
// State
let positions = [];
let currentAsset = null;
let eventSource = null;
let sortColumn = 'value'; // default sort by value
let sortDirection = 'desc'; // default descending

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
const settingsMessage = document.getElementById('settings-message');
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
const refreshTradesBtn = document.getElementById('refresh-trades-btn');

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
    // Polymarket timestamps are in seconds, JS expects milliseconds
    // Check if timestamp is in seconds (less than year 2286 in ms) and convert
    const ts = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
    const date = new Date(ts);
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/New_York'
    });
}

function formatDate(timestamp) {
    // Polymarket timestamps are in seconds, JS expects milliseconds
    const ts = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
    const date = new Date(ts);
    const now = new Date();

    // Compare dates in EST
    const estOptions = { timeZone: 'America/New_York' };
    const dateEST = date.toLocaleDateString('en-US', estOptions);
    const nowEST = now.toLocaleDateString('en-US', estOptions);
    const isToday = dateEST === nowEST;

    if (isToday) {
        return formatTime(ts);
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
function sortPositions(positionsToSort) {
    return [...positionsToSort].sort((a, b) => {
        let aVal, bVal;

        switch (sortColumn) {
            case 'size':
                aVal = a.size || 0;
                bVal = b.size || 0;
                break;
            case 'avgPrice':
                aVal = a.avgPrice || 0;
                bVal = b.avgPrice || 0;
                break;
            case 'curPrice':
                aVal = a.curPrice || 0;
                bVal = b.curPrice || 0;
                break;
            case 'value':
                aVal = a.currentValue || 0;
                bVal = b.currentValue || 0;
                break;
            case 'pnl':
                aVal = a.cashPnl || 0;
                bVal = b.cashPnl || 0;
                break;
            default:
                aVal = a.currentValue || 0;
                bVal = b.currentValue || 0;
        }

        if (sortDirection === 'asc') {
            return aVal - bVal;
        } else {
            return bVal - aVal;
        }
    });
}

function updateSortIcons() {
    document.querySelectorAll('.sortable').forEach(th => {
        th.classList.remove('asc', 'desc');
        if (th.dataset.sort === sortColumn) {
            th.classList.add(sortDirection);
        }
    });
}

function renderPositions() {
    updateSortIcons();

    if (positions.length === 0) {
        positionsBodyEl.innerHTML = '<tr><td colspan="8" class="empty-state">No open positions</td></tr>';
        return;
    }

    const sortedPositions = sortPositions(positions);

    positionsBodyEl.innerHTML = sortedPositions.map(pos => {
        const pnlValue = pos.cashPnl || 0;
        const pnlPercent = pos.percentPnl || 0;
        const pnlClass = getPnlClass(pnlValue);
        const pnlSign = pnlValue >= 0 ? '+' : '';
        const marketUrl = pos.eventSlug ? `https://polymarket.com/event/${pos.eventSlug}` : '';
        const clickableClass = marketUrl ? 'clickable-row' : '';
        const iconHtml = pos.icon ? `<img src="${pos.icon}" alt="" class="market-icon" onerror="this.style.display='none'">` : '';
        const avgPrice = pos.avgPrice || 0;
        const curPrice = pos.curPrice || 0;
        const priceChangeClass = curPrice > avgPrice ? 'pnl-positive' : curPrice < avgPrice ? 'pnl-negative' : '';

        return `
            <tr class="${clickableClass}" data-url="${marketUrl}">
                <td class="market-cell" title="${pos.title || 'Unknown'}">
                    ${iconHtml}
                    <span>${truncate(pos.title || 'Unknown', 25)}</span>
                </td>
                <td>${pos.outcome || '-'}</td>
                <td>${(pos.size || 0).toFixed(2)}</td>
                <td>$${avgPrice.toFixed(2)}</td>
                <td class="${priceChangeClass}">$${curPrice.toFixed(2)}</td>
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

    const traderDisplay = trade.traderAddress ? formatAddress(trade.traderAddress) : '';

    tradeEl.innerHTML = `
        <div class="trade-header">
            <span class="trade-side ${sideClass}">${trade.side || 'UNKNOWN'} ${formatCurrency(trade.usdcSize || 0)}</span>
            <span class="trade-time">${formatDate(trade.timestamp)}</span>
        </div>
        <div class="trade-market" title="${trade.market || ''}">${truncate(trade.market || 'Unknown Market', 35)} - ${trade.outcome || ''}</div>
        <div class="trade-details">
            <span>@ ${formatCurrency(trade.price || 0)}</span>
            <span>${(trade.size || 0).toFixed(2)} tokens</span>
            ${traderDisplay ? `<span class="trade-trader" title="${trade.traderAddress}">Trader: ${traderDisplay}</span>` : ''}
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

// Single Close Position modal elements
const closeFormState = document.getElementById('close-form-state');
const closeLoadingState = document.getElementById('close-loading-state');
const closeLoadingText = document.getElementById('close-loading-text');
const closeLoadingDetail = document.getElementById('close-loading-detail');
const closeModalFooter = document.getElementById('close-modal-footer');
const closeModalCloseBtn = document.getElementById('close-modal-close-btn');
const closeFormError = document.getElementById('close-form-error');

// Modal functions
function openCloseModal(asset) {
    currentAsset = asset;
    const position = positions.find(p => p.asset === asset);

    if (!position) {
        // Show error in a temporary way - position should always exist
        return;
    }

    modalMarketInfo.innerHTML = `
        <strong>${position.title || 'Unknown Market'}</strong><br>
        Outcome: ${position.outcome || '-'}<br>
        Current size: ${(position.size || 0).toFixed(2)} tokens<br>
        Current value: ${formatCurrency(position.currentValue || 0)}
    `;

    // Reset to form state
    closeFormState.style.display = 'block';
    closeLoadingState.style.display = 'none';
    closeModalFooter.style.display = 'flex';
    closeModalCloseBtn.style.display = 'block';
    closeFormError.style.display = 'none';

    // Reset the spinner (in case it was replaced with result icon)
    const resultIcon = closeLoadingState.querySelector('.result-icon');
    if (resultIcon) {
        resultIcon.outerHTML = '<div class="loading-spinner"></div>';
    }

    closePercentageInput.value = 100;
    modal.classList.add('active');
}

function closeModal() {
    modal.classList.remove('active');
    currentAsset = null;
    // Reset states
    closeFormState.style.display = 'block';
    closeLoadingState.style.display = 'none';
    closeModalFooter.style.display = 'flex';
    closeModalCloseBtn.style.display = 'block';
    closeFormError.style.display = 'none';
}

function setPercentage(value) {
    closePercentageInput.value = value;
    closeFormError.style.display = 'none';
}

function showCloseFormError(message) {
    closeFormError.textContent = message;
    closeFormError.style.display = 'block';
}

function showCloseLoading(positionTitle) {
    closeFormState.style.display = 'none';
    closeLoadingState.style.display = 'flex';
    closeModalFooter.style.display = 'none';
    closeModalCloseBtn.style.display = 'none';
    closeLoadingText.textContent = 'Closing position...';
    closeLoadingDetail.textContent = truncate(positionTitle, 40);
}

function showCloseResult(success, message) {
    closeLoadingText.textContent = success ? 'Position Closed!' : 'Close Failed';
    closeLoadingDetail.textContent = message;
    closeModalCloseBtn.style.display = 'block';
    // Change spinner to checkmark or X
    const spinner = closeLoadingState.querySelector('.loading-spinner');
    if (spinner) {
        spinner.outerHTML = success
            ? '<span class="result-icon success">✓</span>'
            : '<span class="result-icon failed">✗</span>';
    }
}

async function confirmClose() {
    if (!currentAsset) return;

    const percentage = parseFloat(closePercentageInput.value);

    if (isNaN(percentage) || percentage < 1 || percentage > 100) {
        showCloseFormError('Please enter a valid percentage (1-100)');
        return;
    }

    const position = positions.find(p => p.asset === currentAsset);
    showCloseLoading(position?.title || 'Unknown');

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
            showCloseResult(true, result.message || 'Position closed successfully');
            // Refresh data
            await Promise.all([fetchPositions(), fetchBalance()]);
        } else {
            showCloseResult(false, result.error || 'Unknown error');
        }
    } catch (error) {
        console.error('Error closing position:', error);
        showCloseResult(false, 'Network error. Please try again.');
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
    if (e.key === 'Escape' && redeemModal.classList.contains('active')) {
        closeRedeemModal();
    }
});

// Settings modal functions
function showSettingsMessage(message, type) {
    settingsMessage.textContent = message;
    settingsMessage.className = `settings-message ${type}`;
    settingsMessage.style.display = 'block';
}

function hideSettingsMessage() {
    settingsMessage.style.display = 'none';
}

function openSettingsModal() {
    hideSettingsMessage();
    fetchSettings();
    settingsModal.classList.add('active');
}

function closeSettingsModal() {
    settingsModal.classList.remove('active');
    hideSettingsMessage();
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
            hideSettingsMessage();
        }
    } catch (error) {
        console.error('Error fetching settings:', error);
        showSettingsMessage('Failed to load settings', 'error');
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
    hideSettingsMessage();

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
            showSettingsMessage(result.message || 'Settings saved successfully!', 'success');
            // Refresh traders list since USER_ADDRESSES may have changed
            fetchTraders();
            // Close modal after a brief delay to show success message
            setTimeout(() => {
                closeSettingsModal();
            }, 1500);
        } else {
            showSettingsMessage(`Failed to save: ${result.error || result.message || 'Unknown error'}`, 'error');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        showSettingsMessage('Error saving settings. Please try again.', 'error');
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

// Refresh trades button click handler
refreshTradesBtn.addEventListener('click', async () => {
    refreshTradesBtn.classList.add('spinning');
    await fetchRecentTrades();
    setTimeout(() => refreshTradesBtn.classList.remove('spinning'), 500);
});

// Sortable column headers
document.querySelectorAll('.sortable').forEach(th => {
    th.addEventListener('click', () => {
        const column = th.dataset.sort;
        if (sortColumn === column) {
            // Toggle direction if same column
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            // New column, default to descending
            sortColumn = column;
            sortDirection = 'desc';
        }
        renderPositions();
    });
});

// Redeem modal elements
const redeemModal = document.getElementById('redeem-modal');
const redeemConfirmState = document.getElementById('redeem-confirm-state');
const redeemLoadingState = document.getElementById('redeem-loading-state');
const redeemInfo = document.getElementById('redeem-info');
const redeemConfirmText = document.getElementById('redeem-confirm-text');
const redeemProgressText = document.getElementById('redeem-progress');
const redeemProgressBar = document.getElementById('redeem-progress-bar');
const redeemDetail = document.getElementById('redeem-detail');
const redeemPositionsList = document.getElementById('redeem-positions-list');
const redeemModalFooter = document.getElementById('redeem-modal-footer');
const redeemModalCloseBtn = document.getElementById('redeem-modal-close-btn');
const confirmRedeemBtn = document.getElementById('confirm-redeem-btn');

let redeemEventSource = null;

// Redeem resolved positions - open modal
redeemResolvedBtn.addEventListener('click', async () => {
    // Reset modal state
    redeemConfirmState.style.display = 'block';
    redeemLoadingState.style.display = 'none';
    redeemModalFooter.style.display = 'flex';
    redeemModalCloseBtn.style.display = 'block';
    redeemInfo.textContent = 'Checking for redeemable positions...';
    redeemConfirmText.style.display = 'none';
    confirmRedeemBtn.disabled = true;
    redeemPositionsList.innerHTML = '';
    redeemProgressBar.style.width = '0%';

    redeemModal.classList.add('active');

    // Fetch redeemable positions
    try {
        const response = await fetch('/api/positions/redeemable');
        const data = await response.json();

        if (data.count === 0) {
            redeemInfo.textContent = 'No positions available to redeem.';
            confirmRedeemBtn.disabled = true;
        } else {
            redeemInfo.innerHTML = `Found <strong>${data.count}</strong> redeemable position(s) worth approximately <strong>${formatCurrency(data.totalValue)}</strong>.`;
            redeemConfirmText.style.display = 'block';
            confirmRedeemBtn.disabled = false;
        }
    } catch (error) {
        console.error('Error fetching redeemable:', error);
        redeemInfo.textContent = 'Error checking for redeemable positions.';
    }
});

function closeRedeemModal() {
    if (redeemEventSource) {
        redeemEventSource.close();
        redeemEventSource = null;
    }
    redeemModal.classList.remove('active');
    // Reset states
    redeemConfirmState.style.display = 'block';
    redeemLoadingState.style.display = 'none';
    redeemModalFooter.style.display = 'flex';
    redeemModalCloseBtn.style.display = 'block';
    redeemPositionsList.innerHTML = '';
    redeemProgressBar.style.width = '0%';
}

function showRedeemLoading() {
    redeemConfirmState.style.display = 'none';
    redeemLoadingState.style.display = 'flex';
    redeemModalFooter.style.display = 'none';
    redeemModalCloseBtn.style.display = 'none';
    redeemProgressText.textContent = 'Initializing...';
    redeemDetail.textContent = 'Connecting...';
    redeemProgressBar.style.width = '0%';
    redeemPositionsList.innerHTML = '';
}

function updateRedeemProgress(completed, total) {
    const percent = Math.round((completed / total) * 100);
    redeemProgressBar.style.width = `${percent}%`;
    redeemDetail.textContent = `${completed} / ${total} completed`;
}

function renderRedeemPositions(positionsData) {
    redeemPositionsList.innerHTML = positionsData.map((pos, index) => `
        <div class="close-all-position-item" data-redeem-index="${index}">
            <div class="close-all-position-info">
                <span class="close-all-position-title" title="${pos.title}">${truncate(pos.title, 30)}</span>
                <span class="close-all-position-outcome">${pos.outcome || '-'} • ${formatCurrency(pos.value || 0)}</span>
            </div>
            <div class="close-all-position-status pending" data-status="pending">
                <span class="status-text">Pending</span>
            </div>
        </div>
    `).join('');
}

function updateRedeemPositionStatus(index, status, value = null, error = null) {
    const item = redeemPositionsList.querySelector(`[data-redeem-index="${index}"]`);
    if (!item) return;

    const statusEl = item.querySelector('.close-all-position-status');
    statusEl.className = `close-all-position-status ${status}`;

    if (status === 'closing') {
        statusEl.innerHTML = `<div class="status-spinner"></div><span class="status-text">Redeeming...</span>`;
    } else if (status === 'success') {
        const valueText = value !== null ? ` $${value.toFixed(2)}` : '';
        statusEl.innerHTML = `<span class="status-icon">✓</span><span class="status-text">Redeemed${valueText}</span>`;
    } else if (status === 'failed') {
        statusEl.innerHTML = `<span class="status-icon">✗</span><span class="status-text">Failed</span>`;
        statusEl.title = error || 'Unknown error';
    }

    if (status === 'closing') {
        item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

async function confirmRedeem() {
    showRedeemLoading();

    redeemEventSource = new EventSource('/api/positions/redeem-resolved/stream');
    let totalPositions = 0;

    redeemEventSource.addEventListener('init', (e) => {
        const data = JSON.parse(e.data);
        totalPositions = data.total;
        redeemProgressText.textContent = 'Redeeming positions...';
        redeemDetail.textContent = `0 / ${totalPositions} completed`;
        renderRedeemPositions(data.positions);
    });

    redeemEventSource.addEventListener('redeeming', (e) => {
        const data = JSON.parse(e.data);
        updateRedeemPositionStatus(data.index, 'closing');
    });

    redeemEventSource.addEventListener('redeemed', (e) => {
        const data = JSON.parse(e.data);
        if (data.success) {
            updateRedeemPositionStatus(data.index, 'success', data.value);
        } else {
            updateRedeemPositionStatus(data.index, 'failed', null, data.error);
        }
        updateRedeemProgress(data.redeemedCount + data.failedCount, totalPositions);
    });

    redeemEventSource.addEventListener('complete', (e) => {
        const data = JSON.parse(e.data);
        redeemEventSource.close();
        redeemEventSource = null;

        redeemProgressText.textContent = data.success ? 'Complete!' : 'Completed with errors';

        // Show close button
        redeemModalCloseBtn.style.display = 'block';

        // Refresh data
        fetchPositions();
        fetchBalance();
    });

    redeemEventSource.addEventListener('error', (e) => {
        let errorMsg = 'Connection error';
        try {
            const data = JSON.parse(e.data);
            errorMsg = data.message || data.error || errorMsg;
        } catch {
            // Ignore JSON parse errors
        }

        redeemProgressText.textContent = 'Error';
        redeemDetail.textContent = errorMsg;
        redeemModalCloseBtn.style.display = 'block';

        if (redeemEventSource) {
            redeemEventSource.close();
            redeemEventSource = null;
        }
    });

    redeemEventSource.onerror = () => {
        if (redeemEventSource) {
            redeemEventSource.close();
            redeemEventSource = null;
        }
    };
}

// Redeem modal on outside click
redeemModal.addEventListener('click', (e) => {
    if (e.target === redeemModal) {
        closeRedeemModal();
    }
});

// Close All modal empty state element
const closeAllEmptyState = document.getElementById('close-all-empty-state');

// Close All button - open confirmation modal
closeAllBtn.addEventListener('click', () => {
    // Reset states
    closeAllConfirmState.style.display = 'none';
    closeAllEmptyState.style.display = 'none';
    closeAllLoadingState.style.display = 'none';
    closeAllModalCloseBtn.style.display = 'block';
    closeAllProgressBar.style.width = '0%';
    closeAllPositionsList.innerHTML = '';

    if (positions.length === 0) {
        // Show empty state in modal
        closeAllEmptyState.style.display = 'block';
        closeAllFooter.style.display = 'none';
    } else {
        // Show confirmation state
        closeAllConfirmState.style.display = 'block';
        closeAllFooter.style.display = 'flex';
        const totalValue = positions.reduce((sum, p) => sum + (p.currentValue || 0), 0);
        closeAllInfoEl.textContent = `You have ${positions.length} position(s) with a total value of ${formatCurrency(totalValue)}.`;
    }

    closeAllModal.classList.add('active');
});

// Close All modal functions
const closeAllConfirmState = document.getElementById('close-all-confirm-state');
const closeAllLoadingState = document.getElementById('close-all-loading-state');
const closeAllProgressText = document.getElementById('close-all-progress');
const closeAllProgressBar = document.getElementById('close-all-progress-bar');
const closeAllDetail = document.getElementById('close-all-detail');
const closeAllFooter = document.getElementById('close-all-footer');
const closeAllModalCloseBtn = document.getElementById('close-all-modal-close-btn');
const closeAllPositionsList = document.getElementById('close-all-positions-list');

let closeAllEventSource = null;

function closeCloseAllModal() {
    // Close SSE connection if active
    if (closeAllEventSource) {
        closeAllEventSource.close();
        closeAllEventSource = null;
    }
    closeAllModal.classList.remove('active');
    // Reset states
    closeAllConfirmState.style.display = 'block';
    closeAllEmptyState.style.display = 'none';
    closeAllLoadingState.style.display = 'none';
    closeAllFooter.style.display = 'flex';
    closeAllModalCloseBtn.style.display = 'block';
    closeAllProgressBar.style.width = '0%';
    closeAllPositionsList.innerHTML = '';
}

function showCloseAllLoading() {
    closeAllConfirmState.style.display = 'none';
    closeAllLoadingState.style.display = 'flex';
    closeAllFooter.style.display = 'none';
    closeAllModalCloseBtn.style.display = 'none';
    closeAllProgressText.textContent = 'Initializing...';
    closeAllDetail.textContent = 'Connecting...';
    closeAllProgressBar.style.width = '0%';
    closeAllPositionsList.innerHTML = '';
}

function updateCloseAllProgress(completed, total) {
    const percent = Math.round((completed / total) * 100);
    closeAllProgressBar.style.width = `${percent}%`;
    closeAllDetail.textContent = `${completed} / ${total} completed`;
}

function renderCloseAllPositions(positionsData) {
    closeAllPositionsList.innerHTML = positionsData.map((pos, index) => `
        <div class="close-all-position-item" data-index="${index}">
            <div class="close-all-position-info">
                <span class="close-all-position-title" title="${pos.title}">${truncate(pos.title, 30)}</span>
                <span class="close-all-position-outcome">${pos.outcome || '-'} • ${formatCurrency(pos.value || 0)}</span>
            </div>
            <div class="close-all-position-status pending" data-status="pending">
                <span class="status-text">Pending</span>
            </div>
        </div>
    `).join('');
}

function updatePositionStatus(index, status, value = null, error = null) {
    const item = closeAllPositionsList.querySelector(`[data-index="${index}"]`);
    if (!item) return;

    const statusEl = item.querySelector('.close-all-position-status');
    statusEl.className = `close-all-position-status ${status}`;

    if (status === 'closing') {
        statusEl.innerHTML = `<div class="status-spinner"></div><span class="status-text">Closing...</span>`;
    } else if (status === 'success') {
        const valueText = value !== null ? ` $${value.toFixed(2)}` : '';
        statusEl.innerHTML = `<span class="status-icon">✓</span><span class="status-text">Closed${valueText}</span>`;
    } else if (status === 'failed') {
        statusEl.innerHTML = `<span class="status-icon">✗</span><span class="status-text">Failed</span>`;
        statusEl.title = error || 'Unknown error';
    }

    // Scroll to show current item
    if (status === 'closing') {
        item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

async function confirmCloseAll() {
    showCloseAllLoading();

    closeAllEventSource = new EventSource('/api/positions/close-all/stream');
    let totalPositions = 0;

    closeAllEventSource.addEventListener('init', (e) => {
        const data = JSON.parse(e.data);
        totalPositions = data.total;
        closeAllProgressText.textContent = 'Closing positions...';
        closeAllDetail.textContent = `0 / ${totalPositions} completed`;
        renderCloseAllPositions(data.positions);
    });

    closeAllEventSource.addEventListener('closing', (e) => {
        const data = JSON.parse(e.data);
        updatePositionStatus(data.index, 'closing');
    });

    closeAllEventSource.addEventListener('closed', (e) => {
        const data = JSON.parse(e.data);
        if (data.success) {
            updatePositionStatus(data.index, 'success', data.value);
        } else {
            updatePositionStatus(data.index, 'failed', null, data.error);
        }
        updateCloseAllProgress(data.closedCount + data.failedCount, totalPositions);
    });

    closeAllEventSource.addEventListener('complete', (e) => {
        const data = JSON.parse(e.data);
        closeAllEventSource.close();
        closeAllEventSource = null;

        closeAllProgressText.textContent = data.success ? 'Complete!' : 'Completed with errors';

        // Show close button to dismiss
        closeAllModalCloseBtn.style.display = 'block';

        // Refresh data
        fetchPositions();
        fetchBalance();
    });

    closeAllEventSource.addEventListener('error', (e) => {
        let errorMsg = 'Connection error';
        try {
            const data = JSON.parse(e.data);
            errorMsg = data.message || data.error || errorMsg;
        } catch {
            // Ignore JSON parse errors
        }

        closeAllProgressText.textContent = 'Error';
        closeAllDetail.textContent = errorMsg;
        closeAllModalCloseBtn.style.display = 'block';

        if (closeAllEventSource) {
            closeAllEventSource.close();
            closeAllEventSource = null;
        }
    });

    closeAllEventSource.onerror = () => {
        // SSE connection closed (could be normal end or error)
        if (closeAllEventSource) {
            closeAllEventSource.close();
            closeAllEventSource = null;
        }
    };
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
