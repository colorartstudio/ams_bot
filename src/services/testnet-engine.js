import { state } from "../state/store.js";
import {
    convertQuoteAmountToUsdt,
    formatMarketLabel,
    getQuoteSymbol
} from "../utils/markets.js";

function ensureAccountMetrics(account) {
    if (typeof account.initialBalance !== "number") account.initialBalance = account.balance;
    if (typeof account.equityPeak !== "number") account.equityPeak = account.balance;
    if (typeof account.trades !== "number") account.trades = 0;
    if (typeof account.wins !== "number") account.wins = 0;
    if (typeof account.losses !== "number") account.losses = 0;
    if (typeof account.grossProfit !== "number") account.grossProfit = 0;
    if (typeof account.grossLoss !== "number") account.grossLoss = 0;
    if (typeof account.realizedPnl !== "number") account.realizedPnl = 0;
    if (typeof account.lastPnl !== "number") account.lastPnl = 0;
    if (!account.lastPair) account.lastPair = state.currentAsset;
}

function getBiasBySignal(signalMode) {
    if (signalMode === "buy") {
        return { winChance: 0.73, minReturn: 0.0018, maxReturn: 0.0095 };
    }

    if (signalMode === "risk") {
        return { winChance: 0.28, minReturn: -0.012, maxReturn: -0.0018 };
    }

    return { winChance: 0.52, minReturn: -0.0045, maxReturn: 0.0048 };
}

function getRandomBetween(min, max) {
    return min + (Math.random() * (max - min));
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function getAccountSignalMode(market) {
    if (!market) {
        return "neutral";
    }

    if (market.price >= market.crHigh) {
        return "buy";
    }

    if (market.price <= market.znLow) {
        return "risk";
    }

    if ((market.microTrend || 0) > 0.1 || (market.changePercent24h || 0) > 0.15) {
        return "buy";
    }

    if ((market.microTrend || 0) < -0.1 || (market.changePercent24h || 0) < -0.15) {
        return "risk";
    }

    return "neutral";
}

function getDynamicBias(account, market, signalMode) {
    const tpWeight = clamp((account.tp || 0.3) / 1.2, 0.12, 1);
    const slWeight = clamp((account.sl || 0.3) / 1.2, 0.12, 1);
    const trendBoost = clamp((market.microTrend || 0) / 4, -0.18, 0.18);
    const dayBoost = clamp((market.changePercent24h || 0) / 16, -0.16, 0.16);
    const base = getBiasBySignal(signalMode);

    const winChance = clamp(base.winChance + trendBoost + dayBoost + (tpWeight - slWeight) * 0.04, 0.2, 0.82);
    const minReturn = base.minReturn * clamp(0.8 + slWeight, 0.4, 1.8);
    const maxReturn = base.maxReturn * clamp(0.8 + tpWeight, 0.4, 1.8);

    return { winChance, minReturn, maxReturn };
}

export function runTestnetSimulationCycle() {
    if (state.currentNetwork !== "testnet") {
        updateLiveSimulationSummary();
        return [];
    }

    const events = [];
    state.liveSimulation.cycle += 1;

    state.accountsRegistry.forEach((account) => {
        ensureAccountMetrics(account);
        const market = state.activeMarkets[account.activePair || state.currentAsset];

        if (account.status !== "RUNNING" || !market) {
            return;
        }

        const signalMode = getAccountSignalMode(market);
        const bias = getDynamicBias(account, market, signalMode);
        const riskCapital = Math.max(account.balance * 0.3, 10);
        const outcomeIsWin = Math.random() < bias.winChance;
        const move = outcomeIsWin
            ? getRandomBetween(Math.max(bias.minReturn, 0.0012), Math.max(bias.maxReturn, 0.0024))
            : getRandomBetween(Math.min(bias.minReturn, -0.0095), Math.min(bias.maxReturn, -0.0015));
        const tradePnl = riskCapital * move;

        account.balance = Math.max(5, account.balance + tradePnl);
        account.trades += 1;
        account.realizedPnl = account.balance - account.initialBalance;
        account.lastPnl = tradePnl;
        account.lastPair = account.activePair || state.currentAsset;
        account.equityPeak = Math.max(account.equityPeak, account.balance);

        if (tradePnl >= 0) {
            account.wins += 1;
            account.grossProfit += tradePnl;
        } else {
            account.losses += 1;
            account.grossLoss += Math.abs(tradePnl);
        }

        events.push({
            accountId: account.id,
            accountName: account.name,
            pair: account.activePair,
            pnl: tradePnl,
            balance: account.balance,
            quote: getQuoteSymbol(account.activePair),
            mode: signalMode,
            pairLabel: market?.label || formatMarketLabel(account.activePair || state.currentAsset)
        });
    });

    updateLiveSimulationSummary();
    return events;
}

export function updateLiveSimulationSummary() {
    const runningAccounts = state.accountsRegistry.filter((account) => account.status === "RUNNING");
    const accountsWithMetrics = state.accountsRegistry.map((account) => {
        ensureAccountMetrics(account);
        return account;
    });

    const totalEquity = accountsWithMetrics.reduce((sum, account) => {
        const quote = getQuoteSymbol(account.activePair || state.currentAsset);
        return sum + convertQuoteAmountToUsdt(state.activeMarkets, account.balance, quote);
    }, 0);
    const totalInitial = accountsWithMetrics.reduce((sum, account) => {
        const quote = getQuoteSymbol(account.activePair || state.currentAsset);
        return sum + convertQuoteAmountToUsdt(state.activeMarkets, account.initialBalance, quote);
    }, 0);
    const totalTrades = accountsWithMetrics.reduce((sum, account) => sum + account.trades, 0);
    const totalWins = accountsWithMetrics.reduce((sum, account) => sum + account.wins, 0);
    const grossProfit = accountsWithMetrics.reduce((sum, account) => {
        const quote = getQuoteSymbol(account.activePair || state.currentAsset);
        return sum + convertQuoteAmountToUsdt(state.activeMarkets, account.grossProfit, quote);
    }, 0);
    const grossLoss = accountsWithMetrics.reduce((sum, account) => {
        const quote = getQuoteSymbol(account.activePair || state.currentAsset);
        return sum + convertQuoteAmountToUsdt(state.activeMarkets, account.grossLoss, quote);
    }, 0);
    const bestAccount = [...accountsWithMetrics].sort((left, right) => {
        const leftQuote = getQuoteSymbol(left.activePair || state.currentAsset);
        const rightQuote = getQuoteSymbol(right.activePair || state.currentAsset);
        const leftPnl = convertQuoteAmountToUsdt(state.activeMarkets, left.realizedPnl, leftQuote);
        const rightPnl = convertQuoteAmountToUsdt(state.activeMarkets, right.realizedPnl, rightQuote);

        return rightPnl - leftPnl;
    })[0];

    state.liveSimulation.totalEquity = totalEquity;
    state.liveSimulation.totalPnl = totalEquity - totalInitial;
    state.liveSimulation.totalTrades = totalTrades;
    state.liveSimulation.winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
    state.liveSimulation.profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? grossProfit : 0;
    state.liveSimulation.bestAccountName = bestAccount?.name || "--";
    state.liveSimulation.activeAccounts = runningAccounts.length;
}

export function getGlobalSignalMode() {
    const market = state.activeMarkets[state.currentAsset];
    if (!market) {
        return "neutral";
    }

    const pnl = state.liveSimulation.totalPnl;
    const equityBase = Math.max(state.liveSimulation.totalEquity, 1);

    if ((market.microTrend || 0) > 0.08 && pnl > -(equityBase * 0.015)) {
        return "buy";
    }

    if ((market.microTrend || 0) < -0.08 || pnl < -(equityBase * 0.03)) {
        return "risk";
    }

    return "neutral";
}
