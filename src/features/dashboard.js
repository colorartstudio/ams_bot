import { calculateAllocationSuggestions, renderAccountsRegistry } from "./accounts.js";
import {
    changeDashboardAccountCurve,
    changeDashboardHistoryRange,
    updateDashboardAnalyticsPanel
} from "./dashboard-analytics.js";
import { state } from "../state/store.js";
import { renderFimatheChart } from "../services/charts.js";
import { refreshMarketData, startMarketDataFeed, stopMarketDataFeed } from "../services/market-data.js";
import { persistAppState } from "../services/storage.js";
import {
    loadRecentSupabaseHistory,
    persistOperationalData,
    syncAccountsToSupabase
} from "../services/supabase-persistence.js";
import {
    getGlobalSignalMode,
    runTestnetSimulationCycle,
    updateLiveSimulationSummary
} from "../services/testnet-engine.js";
import { appendTerminalLog, showToast } from "../ui/feedback.js";
import { formatMarketLabel, getQuoteSymbol } from "../utils/markets.js";

function formatPrice(value) {
    if (value >= 10000) return value.toFixed(2);
    if (value >= 100) return value.toFixed(3);
    return value.toFixed(4);
}

function updateSummaryCards() {
    const equity = document.getElementById("sim-total-equity");
    const pnl = document.getElementById("sim-total-pnl");
    const trades = document.getElementById("sim-total-trades");
    const accounts = document.getElementById("sim-active-accounts");
    const efficiency = document.getElementById("sim-bot-efficiency");
    const profitFactor = document.getElementById("sim-profit-factor");
    const bestAccount = document.getElementById("sim-best-account");

    if (!equity || !pnl || !trades || !accounts || !efficiency || !bestAccount) {
        return;
    }

    const pnlValue = state.liveSimulation.totalPnl;
    const efficiencyValue = state.liveSimulation.winRate.toFixed(1);
    const pfValue = state.liveSimulation.profitFactor.toFixed(2);

    equity.innerText = `USDT Eq. ${state.liveSimulation.totalEquity.toFixed(2)}`;
    pnl.innerText = `${pnlValue >= 0 ? "+" : ""}USDT Eq. ${pnlValue.toFixed(2)}`;
    pnl.className = pnlValue >= 0 ? "text-lg font-bold text-cyber-up block mt-1 font-mono" : "text-lg font-bold text-cyber-down block mt-1 font-mono";
    trades.innerText = String(state.liveSimulation.totalTrades);
    accounts.innerText = String(state.liveSimulation.activeAccounts);
    efficiency.innerText = `${efficiencyValue}%`;
    if (profitFactor) {
        profitFactor.innerText = pfValue;
    }
    bestAccount.innerText = state.liveSimulation.bestAccountName;

    state.generalSignal.efficiency = efficiencyValue;
    state.generalSignal.profitFactor = pfValue;
}

function formatSyncTime(value) {
    if (!value) {
        return "--";
    }

    return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function updateSupabasePanel() {
    const status = document.getElementById("supabase-sync-status");
    const lastWrite = document.getElementById("supabase-last-write");
    const lastRead = document.getElementById("supabase-last-read");
    const cycleCount = document.getElementById("supabase-cycle-count");
    const tradeCount = document.getElementById("supabase-trade-count");
    const latestCycle = document.getElementById("supabase-latest-cycle");
    const latestTrade = document.getElementById("supabase-latest-trade");
    const latestSnapshot = document.getElementById("supabase-latest-snapshot");
    const lastError = document.getElementById("supabase-last-error");

    if (!status || !lastWrite || !lastRead || !cycleCount || !tradeCount || !latestCycle || !latestTrade || !latestSnapshot) {
        return;
    }

    const syncStatus = state.supabaseSync.status;
    const statusMap = {
        idle: {
            label: "IDLE",
            className: "px-3 py-1 rounded-full text-xs font-bold border border-cyber-border text-slate-300 bg-cyber-bg"
        },
        syncing: {
            label: "SINCRONIZANDO",
            className: "px-3 py-1 rounded-full text-xs font-bold border border-cyber-cyan/30 text-cyber-cyan bg-cyber-cyan/10"
        },
        synced: {
            label: "SINCRONIZADO",
            className: "px-3 py-1 rounded-full text-xs font-bold border border-cyber-up/30 text-cyber-up bg-cyber-up/10"
        },
        error: {
            label: "ERRO",
            className: "px-3 py-1 rounded-full text-xs font-bold border border-cyber-down/30 text-cyber-down bg-cyber-down/10"
        },
        offline: {
            label: "OFFLINE",
            className: "px-3 py-1 rounded-full text-xs font-bold border border-cyber-warning/30 text-cyber-warning bg-cyber-warning/10"
        }
    };
    const currentStatus = statusMap[syncStatus] || statusMap.offline;

    status.innerText = currentStatus.label;
    status.className = currentStatus.className;
    lastWrite.innerText = formatSyncTime(state.supabaseSync.lastWriteAt);
    lastRead.innerText = formatSyncTime(state.supabaseSync.lastReadAt);
    cycleCount.innerText = String(state.supabaseSync.recentCycles.length);
    tradeCount.innerText = String(state.supabaseSync.recentTrades.length);

    const cycle = state.supabaseSync.recentCycles[0];
    latestCycle.innerText = cycle
        ? `#${cycle.cycle_number} | ${formatMarketLabel(cycle.global_symbol)} | ${cycle.global_mode.toUpperCase()} | ${Number(cycle.total_pnl_usdt).toFixed(2)} USDT`
        : "Aguardando dados remotos.";

    const trade = state.supabaseSync.recentTrades[0];
    latestTrade.innerText = trade
        ? `${formatMarketLabel(trade.symbol)} | ${trade.signal_mode.toUpperCase()} | ${Number(trade.pnl_usdt).toFixed(2)} USDT`
        : "Aguardando dados remotos.";

    const snapshot = state.supabaseSync.recentSnapshots[0];
    latestSnapshot.innerText = snapshot
        ? `${formatMarketLabel(snapshot.symbol)} | ${Number(snapshot.price).toFixed(4)} | ${Number(snapshot.change_percent_24h || 0).toFixed(2)}%`
        : "Aguardando dados remotos.";

    if (lastError) {
        lastError.innerText = state.supabaseSync.lastError || "Sem erros recentes na camada remota.";
        lastError.className = state.supabaseSync.lastError
            ? "text-[11px] text-cyber-down font-mono"
            : "text-[11px] text-slate-500 font-mono";
    }
}

function resolveGeneralSignal(mode) {
    if (mode === "buy") {
        return {
            title: "TENDENCIA FAVORAVEL (VERDE)",
            description: "Mapeamento macro e fluxo operacional alinhados. O motor esta aumentando exposicao com maior confianca no TESTNET.",
            accent: "border-cyber-up/40",
            textClass: "text-cyber-up"
        };
    }

    if (mode === "risk") {
        return {
            title: "TENDENCIA DEFENSIVA (VERMELHO)",
            description: "O mercado ou o resultado agregado ficaram adversos. O software reduz a agressividade e protege a banca simulada.",
            accent: "border-cyber-down/40",
            textClass: "text-cyber-down"
        };
    }

    return {
        title: "TENDENCIA EM OBSERVACAO (AMARELO)",
        description: "A leitura geral ainda esta consolidando confluencia. O motor segue seletivo, monitorando risco e eficiencia.",
        accent: "border-cyber-warning/40",
        textClass: "text-cyber-warning"
    };
}

function updateGeneralSemaphore(mode) {
    const panel = document.getElementById("general-semaphore-panel");
    const title = document.getElementById("general-semaphore-state");
    const description = document.getElementById("general-semaphore-description");
    const green = document.getElementById("general-light-green");
    const yellow = document.getElementById("general-light-yellow");
    const red = document.getElementById("general-light-red");
    const marketLabel = document.getElementById("general-semaphore-market");
    const networkLabel = document.getElementById("general-semaphore-network");
    const efficiency = document.getElementById("general-efficiency");
    const profitFactor = document.getElementById("general-profit-factor");
    const marketSource = document.getElementById("general-market-source");

    if (!panel || !title || !description || !green || !yellow || !red) {
        return;
    }

    const signal = resolveGeneralSignal(mode);
    const market = state.activeMarkets[state.currentAsset];
    panel.className = `bg-cyber-card p-5 md:p-6 rounded-2xl border ${signal.accent} space-y-4`;
    title.innerText = signal.title;
    title.className = `text-xl md:text-2xl font-black font-display ${signal.textClass}`;
    description.innerText = signal.description;
    marketLabel.innerText = formatMarketLabel(state.currentAsset);
    networkLabel.innerText = state.currentNetwork.toUpperCase();
    efficiency.innerText = `${state.generalSignal.efficiency}%`;
    profitFactor.innerText = state.generalSignal.profitFactor;
    if (marketSource) {
        marketSource.innerText = market?.source === "bybit-testnet-rest" ? "Bybit Testnet REST" : "Bootstrap";
    }

    green.className = mode === "buy" ? "w-5 h-5 rounded-full bg-emerald-500 glow-green" : "w-5 h-5 rounded-full bg-emerald-950";
    yellow.className = mode === "neutral" ? "w-5 h-5 rounded-full bg-yellow-500 glow-yellow" : "w-5 h-5 rounded-full bg-yellow-950";
    red.className = mode === "risk" ? "w-5 h-5 rounded-full bg-red-500 glow-red" : "w-5 h-5 rounded-full bg-red-950";

    state.generalSignal.mode = mode;
    state.generalSignal.title = signal.title;
    state.generalSignal.description = signal.description;
}

export function setNetwork(network) {
    state.currentNetwork = network;

    const testnetButton = document.getElementById("net-testnet-btn");
    const liveButton = document.getElementById("net-live-btn");
    const statusText = document.getElementById("network-status-text");

    if (!testnetButton || !liveButton || !statusText) {
        return;
    }

    if (network === "testnet") {
        testnetButton.className = "bg-cyber-cyan/20 text-cyber-cyan px-2.5 py-1.5 rounded-md font-bold transition-all border border-cyber-cyan/20 text-xs";
        liveButton.className = "text-slate-400 hover:text-slate-200 px-2.5 py-1.5 rounded-md transition-all font-semibold text-xs";
        statusText.innerText = "Bybit Testnet | BRL USDT USDC";
        statusText.className = "text-cyber-cyan font-semibold font-mono";
        appendTerminalLog("Bybit", "Conectado no ambiente Sandbox Testnet: api-testnet.bybit.com");
    } else {
        liveButton.className = "bg-cyber-purple/20 text-cyber-purple px-2.5 py-1.5 rounded-md font-bold transition-all border border-cyber-purple/20 text-xs";
        testnetButton.className = "text-slate-400 hover:text-slate-200 px-2.5 py-1.5 rounded-md transition-all font-semibold text-xs";
        statusText.innerText = "Bybit Live (API) | BRL USDT USDC";
        statusText.className = "text-cyber-purple font-semibold font-mono";
        appendTerminalLog("Bybit", "Conexão em produção ativada. Operando com fundos reais.", "warning");
    }

    updateSummaryCards();
    updateSupabasePanel();
    updateDashboardAnalyticsPanel();
    persistAppState();
    showToast(`Rede alternada para: ${network.toUpperCase()}`);

    if (network === "testnet") {
        refreshMarketData();
    }

    loadRecentSupabaseHistory(true).then(() => {
        updateSupabasePanel();
        updateDashboardAnalyticsPanel();
    }).catch(() => {});
}

export function changeAssetSymbol(silent = false) {
    const selector = document.getElementById("asset-selector");
    if (selector) {
        state.currentAsset = selector.value;
    }

    const market = state.activeMarkets[state.currentAsset];
    if (!market) {
        return;
    }

    const crHigh = document.getElementById("fimathe-cr-high");
    const znLow = document.getElementById("fimathe-zn-low");
    const target = document.getElementById("fimathe-target");
    const stop = document.getElementById("fimathe-stop");
    const volumeStats = document.getElementById("vol-ratio-stats");

    if (crHigh) crHigh.innerText = `${market.quote} ${formatPrice(market.crHigh)}`;
    if (znLow) znLow.innerText = `${market.quote} ${formatPrice(market.znLow)}`;
    if (target) target.innerText = `${market.quote} ${formatPrice(market.crHigh * 1.003)}`;
    if (stop) stop.innerText = `${market.quote} ${formatPrice(market.crHigh * 0.997)}`;
    if (volumeStats) {
        volumeStats.innerText = `${(market.volume24h || 0).toFixed(2)} vol | ${market.changePercent24h?.toFixed(2) || "0.00"}%`;
    }

    if (!silent) {
        appendTerminalLog("AMS Engine", `Par de monitoramento de canais alterado para ${state.currentAsset}`, "info");
        persistAppState();
    }

    calculateAllocationSuggestions(state.mockWalletBalance);
    persistAppState();
    renderFimatheChart();
}

function updateSignalPanel(mode) {
    const green = document.getElementById("signal-light-green");
    const orange = document.getElementById("signal-light-orange");
    const red = document.getElementById("signal-light-red");
    const badgeText = document.getElementById("signal-badge-text");
    const checklist = {
        ema: document.getElementById("chk-ema"),
        rsi: document.getElementById("chk-rsi"),
        boll: document.getElementById("chk-boll"),
        macd: document.getElementById("chk-macd"),
        volume: document.getElementById("chk-volume")
    };

    if (!green || !orange || !red || !badgeText) {
        return;
    }

    if (mode === "buy") {
        green.className = "w-6 h-6 rounded-full bg-emerald-500 glow-green transition-all duration-300";
        orange.className = "w-6 h-6 rounded-full bg-yellow-950 transition-all duration-300";
        red.className = "w-6 h-6 rounded-full bg-red-950 transition-all duration-300";
        badgeText.innerText = "GATILHO COMPRA (CONFLUENTE)";
        badgeText.className = "text-xs font-bold text-cyber-up px-3 py-1 rounded bg-cyber-card border border-cyber-up/25 font-mono";

        checklist.ema.className = "w-2.5 h-2.5 rounded-full bg-cyber-up";
        checklist.rsi.className = "w-2.5 h-2.5 rounded-full bg-cyber-up";
        checklist.boll.className = "w-2.5 h-2.5 rounded-full bg-cyber-up";
        checklist.macd.className = "w-2.5 h-2.5 rounded-full bg-cyber-up";
        checklist.volume.className = "w-2.5 h-2.5 rounded-full bg-cyber-up";
        return;
    }

    if (mode === "risk") {
        green.className = "w-6 h-6 rounded-full bg-emerald-950 transition-all duration-300";
        orange.className = "w-6 h-6 rounded-full bg-yellow-950 transition-all duration-300";
        red.className = "w-6 h-6 rounded-full bg-red-500 glow-red transition-all duration-300";
        badgeText.innerText = "SPOT BLOQUEADO (RISCO)";
        badgeText.className = "text-xs font-bold text-cyber-down px-3 py-1 rounded bg-cyber-card border border-cyber-down/25 font-mono";

        checklist.ema.className = "w-2.5 h-2.5 rounded-full bg-cyber-down";
        checklist.rsi.className = "w-2.5 h-2.5 rounded-full bg-cyber-down";
        checklist.boll.className = "w-2.5 h-2.5 rounded-full bg-cyber-down";
        checklist.macd.className = "w-2.5 h-2.5 rounded-full bg-slate-600";
        checklist.volume.className = "w-2.5 h-2.5 rounded-full bg-slate-600";
        return;
    }

    green.className = "w-6 h-6 rounded-full bg-emerald-950 transition-all duration-300";
    orange.className = "w-6 h-6 rounded-full bg-yellow-500 glow-yellow transition-all duration-300";
    red.className = "w-6 h-6 rounded-full bg-red-950 transition-all duration-300";
    badgeText.innerText = "ESTRUTURA NEUTRA (AGUARDAR)";
    badgeText.className = "text-xs font-bold text-cyber-warning px-3 py-1 rounded bg-cyber-card border border-cyber-warning/25 font-mono";

    checklist.ema.className = "w-2.5 h-2.5 rounded-full bg-cyber-up";
    checklist.rsi.className = "w-2.5 h-2.5 rounded-full bg-slate-600";
    checklist.boll.className = "w-2.5 h-2.5 rounded-full bg-slate-600";
    checklist.macd.className = "w-2.5 h-2.5 rounded-full bg-cyber-up";
    checklist.volume.className = "w-2.5 h-2.5 rounded-full bg-slate-600";
}

async function processMarketCycle() {
    updateLiveSimulationSummary();
    const events = runTestnetSimulationCycle();
    const generalMode = getGlobalSignalMode();
    const market = state.activeMarkets[state.currentAsset];

    updateSignalPanel(generalMode);
    updateSummaryCards();
    updateGeneralSemaphore(generalMode);
    renderAccountsRegistry();

    if (market && state.activeTab === "dashboard") {
        changeAssetSymbol(true);
    }

    if (market && generalMode === "buy") {
        appendTerminalLog(
            "MARKET",
            `[TESTNET] ${formatMarketLabel(state.currentAsset)} em impulso favoravel a ${market.quote} ${formatPrice(market.price)} (${market.changePercent24h.toFixed(2)}% 24h).`,
            "success"
        );
    } else if (market && generalMode === "risk") {
        appendTerminalLog(
            "MARKET",
            `[TESTNET] ${formatMarketLabel(state.currentAsset)} entrou em regime defensivo a ${market.quote} ${formatPrice(market.price)}.`,
            "error"
        );
    }

    events.slice(0, 3).forEach((event) => {
        appendTerminalLog(
            "TESTNET",
            `[${event.accountName}] ${event.mode === "buy" ? "entrada favoravel" : event.mode === "risk" ? "gestao defensiva" : "janela neutra"} em ${event.pairLabel}. PnL ${event.pnl >= 0 ? "+" : ""}${event.quote} ${Math.abs(event.pnl).toFixed(2)} | Saldo: ${event.quote} ${event.balance.toFixed(2)}`,
            event.pnl >= 0 ? "success" : "warning"
        );
    });

    await persistOperationalData({ events, generalMode });
    updateSupabasePanel();
    updateDashboardAnalyticsPanel();
    persistAppState();
}

export function startWebSocketPriceMock() {
    startMarketDataFeed(processMarketCycle);
}

export function stopWebSocketPriceMock() {
    stopMarketDataFeed();
}

export function initializeDashboardState() {
    const assetSelector = document.getElementById("asset-selector");
    if (assetSelector) {
        assetSelector.value = state.currentAsset;
    }

    const backtestSelector = document.getElementById("bt-asset-selector");
    if (backtestSelector) {
        backtestSelector.value = state.currentAsset;
    }

    setNetwork(state.currentNetwork);
    updateLiveSimulationSummary();
    updateSummaryCards();
    updateSupabasePanel();
    updateDashboardAnalyticsPanel();
    updateGeneralSemaphore("neutral");
    changeAssetSymbol(true);
    syncAccountsToSupabase(true).catch(() => {});
    loadRecentSupabaseHistory(true).then(() => {
        updateSupabasePanel();
        updateDashboardAnalyticsPanel();
    }).catch(() => {});
}

export { changeDashboardHistoryRange, changeDashboardAccountCurve };
