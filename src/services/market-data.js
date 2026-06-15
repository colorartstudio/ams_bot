import {
    BYBIT_TESTNET_REST_URL,
    MARKET_POLL_INTERVAL_MS,
    DEFAULT_ASSET
} from "../config/constants.js";
import { state } from "../state/store.js";

let pollingTimer = null;
let onTickCallback = null;

function getTrackedSymbols() {
    const symbols = new Set([state.currentAsset || DEFAULT_ASSET]);

    state.accountsRegistry.forEach((account) => {
        if (account.activePair) {
            symbols.add(account.activePair);
        }
    });

    const backtestSelector = document.getElementById("bt-asset-selector");
    if (backtestSelector?.value) {
        symbols.add(backtestSelector.value);
    }

    return [...symbols];
}

function updateMarketHistory(market, nextPrice) {
    const history = Array.isArray(market.history) ? market.history : [];
    history.push({
        price: nextPrice,
        time: Date.now()
    });

    market.history = history.slice(-24);
}

function applyDerivedLevels(market) {
    const history = Array.isArray(market.history) ? market.history : [];
    const prices = history.map((entry) => entry.price);

    if (prices.length < 3) {
        const channelSize = market.price * 0.005;
        market.crHigh = market.price + (channelSize * 0.3);
        market.znLow = market.price - (channelSize * 0.7);
        market.microTrend = 0;
        return;
    }

    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const channelSize = Math.max(high - low, market.price * 0.0025);
    const first = prices[0];
    const last = prices[prices.length - 1];

    market.crHigh = high;
    market.znLow = high - channelSize;
    market.microTrend = first > 0 ? ((last - first) / first) * 100 : 0;
}

function normalizeTickerPayload(payload) {
    const lastPrice = Number.parseFloat(payload.lastPrice || payload.markPrice || "0");
    const prevPrice24h = Number.parseFloat(payload.prevPrice24h || payload.lastPrice || "0");
    const volume24h = Number.parseFloat(payload.volume24h || "0");

    return {
        lastPrice,
        prevPrice24h,
        volume24h,
        changePercent24h: prevPrice24h > 0 ? ((lastPrice - prevPrice24h) / prevPrice24h) * 100 : 0
    };
}

async function fetchTicker(symbol) {
    const url = `${BYBIT_TESTNET_REST_URL}/v5/market/tickers?category=spot&symbol=${symbol}`;
    const response = await fetch(url);
    const data = await response.json();
    const payload = data?.result?.list?.[0];

    if (!payload) {
        throw new Error(`Ticker indisponivel para ${symbol}`);
    }

    return normalizeTickerPayload(payload);
}

export async function refreshMarketData() {
    if (state.currentNetwork !== "testnet") {
        await Promise.resolve(onTickCallback?.());
        return;
    }

    const symbols = getTrackedSymbols();
    const settled = await Promise.allSettled(symbols.map((symbol) => fetchTicker(symbol)));

    settled.forEach((result, index) => {
        if (result.status !== "fulfilled") {
            return;
        }

        const symbol = symbols[index];
        const market = state.activeMarkets[symbol];
        if (!market) {
            return;
        }

        const { lastPrice, prevPrice24h, volume24h, changePercent24h } = result.value;
        market.prevPrice = market.price;
        market.price = lastPrice;
        market.prevPrice24h = prevPrice24h;
        market.volume24h = volume24h;
        market.changePercent24h = changePercent24h;
        market.lastUpdate = new Date().toISOString();
        market.source = "bybit-testnet-rest";
        updateMarketHistory(market, lastPrice);
        applyDerivedLevels(market);
    });

    await Promise.resolve(onTickCallback?.());
}

export function startMarketDataFeed(onTick) {
    onTickCallback = onTick;

    if (pollingTimer) {
        window.clearInterval(pollingTimer);
    }

    refreshMarketData();
    pollingTimer = window.setInterval(refreshMarketData, MARKET_POLL_INTERVAL_MS);
}

export function stopMarketDataFeed() {
    if (!pollingTimer) {
        return;
    }

    window.clearInterval(pollingTimer);
    pollingTimer = null;
}
