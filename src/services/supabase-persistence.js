import {
    SUPABASE_CYCLE_INTERVAL_MS,
    SUPABASE_HISTORY_REFRESH_INTERVAL_MS,
    SUPABASE_METRICS_INTERVAL_MS,
    SUPABASE_SNAPSHOT_INTERVAL_MS
} from "../config/constants.js";
import { state } from "../state/store.js";
import {
    convertQuoteAmountToUsdt,
    formatMarketLabel,
    getQuoteSymbol
} from "../utils/markets.js";
import { getSupabaseClient } from "./supabase-client.js";

const persistenceState = {
    accountSignature: "",
    marketWrites: new Map(),
    lastCycleWriteAt: 0,
    lastMetricsWriteAt: 0,
    lastHistoryRefreshAt: 0,
    pendingTrades: []
};

function now() {
    return Date.now();
}

function isDue(lastAt, intervalMs) {
    return now() - lastAt >= intervalMs;
}

function updateSyncStatus(status, error = "") {
    state.supabaseSync.status = status;
    state.supabaseSync.lastError = error;
    if (status === "synced") {
        state.supabaseSync.lastWriteAt = new Date().toISOString();
    }
}

function getTrackedSymbols() {
    const symbols = new Set([state.currentAsset]);
    state.accountsRegistry.forEach((account) => {
        if (account.activePair) {
            symbols.add(account.activePair);
        }
    });
    return [...symbols];
}

function getAccountExternalId(account) {
    return account.externalId || `${state.currentNetwork}:${account.id}`;
}

function getApiKeyMasked(account) {
    if (account.keyMasked) {
        return account.keyMasked;
    }

    if (account.key) {
        return `${account.key.slice(0, 6)}...`;
    }

    return "masked";
}

function getAccountSignature() {
    return JSON.stringify(
        state.accountsRegistry.map((account) => ({
            id: getAccountExternalId(account),
            name: account.name,
            status: account.status,
            balance: account.balance,
            pair: account.activePair,
            tp: account.tp,
            sl: account.sl
        }))
    );
}

function getAccountsPayload() {
    return state.accountsRegistry.map((account) => ({
        externalId: getAccountExternalId(account),
        name: account.name,
        network: state.currentNetwork,
        status: account.status.toLowerCase(),
        apiKeyMasked: getApiKeyMasked(account),
        quoteCurrency: getQuoteSymbol(account.activePair || state.currentAsset),
        initialBalance: account.initialBalance ?? account.balance,
        currentBalance: account.balance,
        activePair: account.activePair || state.currentAsset,
        tp: account.tp,
        sl: account.sl
    }));
}

function applyAccountMapping(mappedAccounts = []) {
    const idMap = new Map((mappedAccounts || []).map((item) => [item.externalId, item.id]));
    state.accountsRegistry.forEach((account) => {
        account.databaseId = idMap.get(getAccountExternalId(account)) || account.databaseId;
    });
}

async function invokeSupabaseFunction(functionName, payload) {
    const supabase = getSupabaseClient();
    if (!supabase) {
        return null;
    }

    const requestId = payload.requestId || crypto.randomUUID();

    const { data, error } = await supabase.functions.invoke(functionName, {
        body: {
            ...payload,
            requestId,
            origin: payload.origin || "web-dashboard",
            originContext: payload.originContext || functionName
        }
    });

    if (error) {
        throw error;
    }

    return data || null;
}

export async function syncAccountsToSupabase(force = false) {
    const supabase = getSupabaseClient();
    if (!supabase || !state.auth.session) {
        return;
    }

    const signature = getAccountSignature();
    if (!force && signature === persistenceState.accountSignature) {
        return;
    }

    const accountsPayload = getAccountsPayload();
    if (accountsPayload.length === 0) {
        persistenceState.accountSignature = signature;
        return;
    }

    const response = await invokeSupabaseFunction("persist-operational-data", {
        mode: "accounts_sync",
        network: state.currentNetwork,
        currentAsset: state.currentAsset,
        accounts: accountsPayload,
        originContext: "accounts-sync"
    });

    applyAccountMapping(response?.accountsMapping);
    persistenceState.accountSignature = signature;
}

function getSnapshotsPayload() {
    const symbols = getTrackedSymbols();
    return symbols
        .filter((symbol) => {
            const key = `${state.currentNetwork}:${symbol}`;
            const lastAt = persistenceState.marketWrites.get(key) || 0;
            return isDue(lastAt, SUPABASE_SNAPSHOT_INTERVAL_MS);
        })
        .map((symbol) => {
            const market = state.activeMarkets[symbol];
            if (!market) {
                return null;
            }

            return {
                network: state.currentNetwork,
                symbol,
                label: market.label || formatMarketLabel(symbol),
                source: market.source || "ui-runtime",
                quoteCurrency: market.quote || getQuoteSymbol(symbol),
                price: market.price,
                prevPrice: market.prevPrice ?? null,
                prevPrice24h: market.prevPrice24h ?? null,
                changePercent24h: market.changePercent24h ?? null,
                volume24h: market.volume24h ?? null,
                crHigh: market.crHigh ?? null,
                znLow: market.znLow ?? null,
                microTrend: market.microTrend ?? null
            };
        })
        .filter(Boolean);
}

function queueTradeEvents(events) {
    if (!events || events.length === 0) {
        return;
    }

    const serialized = events.map((event) => {
        const account = state.accountsRegistry.find((item) => item.id === event.accountId);
        const quote = event.quote || getQuoteSymbol(event.pair || state.currentAsset);
        return {
            network: state.currentNetwork,
            accountExternalId: account ? getAccountExternalId(account) : null,
            symbol: event.pair || account?.activePair || state.currentAsset,
            signalMode: event.mode,
            quoteCurrency: quote,
            pnlQuote: event.pnl,
            pnlUsdt: convertQuoteAmountToUsdt(state.activeMarkets, event.pnl, quote),
            balanceQuote: event.balance,
            wasWin: event.pnl >= 0
        };
    });

    persistenceState.pendingTrades.push(...serialized);
}

function buildCyclePayload(generalMode) {
    return {
        cycleNumber: state.liveSimulation.cycle,
        network: state.currentNetwork,
        globalSymbol: state.currentAsset,
        globalMode: generalMode,
        totalEquityUsdt: state.liveSimulation.totalEquity,
        totalPnlUsdt: state.liveSimulation.totalPnl,
        totalTrades: state.liveSimulation.totalTrades,
        activeAccounts: state.liveSimulation.activeAccounts,
        winRate: state.liveSimulation.winRate,
        profitFactor: state.liveSimulation.profitFactor,
        bestAccountName: state.liveSimulation.bestAccountName
    };
}

function buildSystemMetricsPayload(generalMode) {
    return {
        metricKey: "dashboard_runtime",
        network: state.currentNetwork,
        metricValue: {
            globalMode: generalMode,
            currentAsset: state.currentAsset,
            totalEquity: state.liveSimulation.totalEquity,
            totalPnl: state.liveSimulation.totalPnl,
            totalTrades: state.liveSimulation.totalTrades,
            winRate: state.liveSimulation.winRate,
            profitFactor: state.liveSimulation.profitFactor,
            bestAccountName: state.liveSimulation.bestAccountName,
            trackedSymbols: getTrackedSymbols(),
            generatedAt: new Date().toISOString()
        }
    };
}

function buildOperationalWritePayload(events, generalMode) {
    const accountSignature = getAccountSignature();
    const snapshots = getSnapshotsPayload();
    const shouldSyncAccounts = accountSignature !== persistenceState.accountSignature;

    queueTradeEvents(events);

    const shouldWriteCycle = persistenceState.pendingTrades.length > 0
        || isDue(persistenceState.lastCycleWriteAt, SUPABASE_CYCLE_INTERVAL_MS);
    const shouldWriteMetrics = isDue(persistenceState.lastMetricsWriteAt, SUPABASE_METRICS_INTERVAL_MS);

    const payload = {
        mode: "operational_cycle",
        network: state.currentNetwork,
        currentAsset: state.currentAsset,
        originContext: "market-cycle"
    };

    if (shouldSyncAccounts) {
        payload.accounts = getAccountsPayload();
    }

    if (snapshots.length > 0) {
        payload.snapshots = snapshots;
    }

    if (shouldWriteCycle) {
        payload.cycle = buildCyclePayload(generalMode);
        payload.trades = [...persistenceState.pendingTrades];
    }

    if (shouldWriteMetrics) {
        payload.systemMetric = buildSystemMetricsPayload(generalMode);
    }

    return {
        payload,
        bookkeeping: {
            accountSignature,
            snapshotsWritten: snapshots.map((item) => ({ network: item.network, symbol: item.symbol })),
            wroteCycle: shouldWriteCycle,
            wroteMetrics: shouldWriteMetrics,
            wroteTrades: shouldWriteCycle && persistenceState.pendingTrades.length > 0
        }
    };
}

function hasOperationalWork(payload) {
    return Array.isArray(payload.accounts)
        || Array.isArray(payload.snapshots)
        || Boolean(payload.cycle)
        || Boolean(payload.systemMetric);
}

function applyOperationalSuccess(bookkeeping, response) {
    applyAccountMapping(response?.accountsMapping);

    if (Array.isArray(bookkeeping.snapshotsWritten) && bookkeeping.snapshotsWritten.length > 0) {
        bookkeeping.snapshotsWritten.forEach((item) => {
            persistenceState.marketWrites.set(`${item.network}:${item.symbol}`, now());
        });
    }

    if (bookkeeping.wroteTrades) {
        persistenceState.pendingTrades = [];
    }

    if (bookkeeping.wroteCycle) {
        persistenceState.lastCycleWriteAt = now();
    }

    if (bookkeeping.wroteMetrics) {
        persistenceState.lastMetricsWriteAt = now();
    }

    persistenceState.accountSignature = bookkeeping.accountSignature;
    if (response?.processedAt) {
        state.supabaseSync.lastWriteAt = response.processedAt;
    }
}

export async function loadRecentSupabaseHistory(force = false) {
    const supabase = getSupabaseClient();
    if (!supabase || !state.auth.session || (!force && !isDue(persistenceState.lastHistoryRefreshAt, SUPABASE_HISTORY_REFRESH_INTERVAL_MS))) {
        return;
    }

    const response = await invokeSupabaseFunction("read-dashboard-history", {
        network: state.currentNetwork,
        currentAsset: state.currentAsset,
        period: state.supabaseSync.historyRange,
        originContext: "dashboard-history"
    });

    state.supabaseSync.recentCycles = response?.recentCycles || [];
    state.supabaseSync.recentTrades = response?.recentTrades || [];
    state.supabaseSync.recentSnapshots = response?.recentSnapshots || [];
    state.supabaseSync.latestMetrics = response?.latestMetrics || null;
    state.supabaseSync.dashboardHistory = {
        summary: response?.summary || null,
        ranking: response?.ranking || [],
        performanceByAccount: response?.performanceByAccount || [],
        performanceByPair: response?.performanceByPair || [],
        equityCurve: response?.equityCurve || [],
        accountCurves: response?.accountCurves || [],
        generatedAt: response?.generatedAt || null
    };
    state.supabaseSync.lastReadAt = response?.generatedAt || new Date().toISOString();
    persistenceState.lastHistoryRefreshAt = now();
}

export async function persistOperationalData({ events = [], generalMode = "neutral" } = {}) {
    const supabase = getSupabaseClient();
    if (!supabase || !state.auth.session) {
        state.supabaseSync.status = "offline";
        return;
    }

    try {
        updateSyncStatus("syncing");
        const { payload, bookkeeping } = buildOperationalWritePayload(events, generalMode);

        if (hasOperationalWork(payload)) {
            const response = await invokeSupabaseFunction("persist-operational-data", payload);
            applyOperationalSuccess(bookkeeping, response);
        }

        await loadRecentSupabaseHistory();
        updateSyncStatus("synced");
    } catch (error) {
        updateSyncStatus("error", error.message || "Falha ao persistir no Supabase.");
    }
}
