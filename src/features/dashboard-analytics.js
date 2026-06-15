import { DASHBOARD_HISTORY_PERIODS } from "../config/constants.js";
import { rankAccounts } from "../shared/analytics/ranking.js";
import { state } from "../state/store.js";
import { renderAccountEquityChart, renderEquityHistoryChart } from "../services/charts.js";
import { loadRecentSupabaseHistory } from "../services/supabase-persistence.js";
import { formatMarketLabel } from "../utils/markets.js";

function formatSignedCurrency(value) {
    const numeric = Number(value || 0);
    return `${numeric >= 0 ? "+" : "-"}USDT ${Math.abs(numeric).toFixed(2)}`;
}

function formatCurrency(value) {
    return `USDT ${Number(value || 0).toFixed(2)}`;
}

function formatPercent(value) {
    return `${Number(value || 0).toFixed(1)}%`;
}

function formatPeriodLabel(period) {
    const labels = {
        "1h": "Última 1 hora",
        "24h": "Últimas 24 horas",
        "7d": "Últimos 7 dias",
        "30d": "Últimos 30 dias"
    };

    return labels[period] || period;
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.innerText = value;
    }
}

function updatePeriodButtons() {
    DASHBOARD_HISTORY_PERIODS.forEach((period) => {
        const button = document.getElementById(`history-period-${period}`);
        if (!button) {
            return;
        }

        const isActive = state.supabaseSync.historyRange === period;
        button.className = isActive
            ? "px-3 py-1.5 rounded-lg text-[11px] font-bold border border-cyber-cyan/30 bg-cyber-cyan/10 text-cyber-cyan"
            : "px-3 py-1.5 rounded-lg text-[11px] font-bold border border-cyber-border bg-cyber-bg text-slate-400 hover:text-slate-200";
    });
}

function renderPerformanceCards(items, containerId, type) {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }

    if (!Array.isArray(items) || items.length === 0) {
        container.innerHTML = `<div class="rounded-xl border border-cyber-border bg-cyber-bg/70 p-4 text-xs text-slate-500">Aguardando dados históricos do período selecionado.</div>`;
        return;
    }

    const limited = items.slice(0, 4);
    container.innerHTML = limited.map((item) => {
        const pnlClass = Number(item.pnlUsdt || 0) >= 0 ? "text-cyber-up" : "text-cyber-down";
        const title = type === "account" ? item.accountName : formatMarketLabel(item.symbol);
        const meta = type === "account"
            ? `${item.trades} trades | WR ${formatPercent(item.winRate)} | DD ${formatPercent(item.drawdownPct || 0)}`
            : `${item.trades} trades | WR ${formatPercent(item.winRate)} | Média ${formatSignedCurrency(item.avgPnlUsdt)}`;

        return `
            <div class="rounded-xl border border-cyber-border bg-cyber-bg/70 p-4 space-y-2">
                <div class="flex items-start justify-between gap-2">
                    <div>
                        <span class="text-white font-bold text-sm block">${title}</span>
                        <span class="text-[10px] text-slate-500">${meta}</span>
                    </div>
                    <span class="text-[10px] px-2 py-1 rounded border border-cyber-border bg-cyber-card text-slate-300">${type === "account" ? (item.quoteCurrency || "USDT") : "PAR"}</span>
                </div>
                <div class="grid grid-cols-2 gap-2 text-[11px] font-mono">
                    <div class="rounded-lg border border-cyber-border/60 bg-cyber-card/40 px-2 py-1.5">
                        <span class="text-slate-500 block">PnL</span>
                        <span class="${pnlClass} font-bold">${formatSignedCurrency(item.pnlUsdt)}</span>
                    </div>
                    <div class="rounded-lg border border-cyber-border/60 bg-cyber-card/40 px-2 py-1.5">
                        <span class="text-slate-500 block">${type === "account" ? "Saldo Atual" : "Profit Factor"}</span>
                        <span class="text-cyber-cyan font-bold">${type === "account" ? `${item.quoteCurrency || "USDT"} ${Number(item.currentBalanceQuote || 0).toFixed(2)}` : Number(item.profitFactor || 0).toFixed(2)}</span>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

function renderRankingList(items) {
    const container = document.getElementById("ranking-list");
    if (!container) {
        return;
    }

    if (!Array.isArray(items) || items.length === 0) {
        container.innerHTML = `<div class="rounded-xl border border-cyber-border bg-cyber-bg/70 p-4 text-xs text-slate-500">Sem ranking disponível para o período atual.</div>`;
        return;
    }

    container.innerHTML = items.slice(0, 5).map((item, index) => `
        <div class="rounded-xl border border-cyber-border bg-cyber-bg/70 p-3 flex items-center justify-between gap-3 text-xs font-mono">
            <div class="flex items-center gap-3">
                <span class="w-7 h-7 rounded-full border border-cyber-cyan/20 bg-cyber-card flex items-center justify-center text-cyber-cyan font-bold">${index + 1}</span>
                <div>
                    <span class="text-white font-bold block">${item.accountName}</span>
                    <span class="text-slate-500">${item.trades} trades | WR ${formatPercent(item.winRate)}</span>
                </div>
            </div>
            <div class="text-right">
                <span class="${Number(item.pnlUsdt || 0) >= 0 ? "text-cyber-up" : "text-cyber-down"} font-bold block">${formatSignedCurrency(item.pnlUsdt)}</span>
                <span class="text-cyber-cyan text-[10px]">Score ${Number(item.score || 0).toFixed(1)}</span>
            </div>
        </div>
    `).join("");
}

function syncAccountCurveSelector(accountCurves) {
    const selector = document.getElementById("account-curve-selector");
    if (!selector) {
        return;
    }

    if (!Array.isArray(accountCurves) || accountCurves.length === 0) {
        selector.innerHTML = `<option value="">Sem histórico por conta</option>`;
        state.supabaseSync.selectedAccountCurveId = "";
        return;
    }

    const selectedId = accountCurves.some((curve) => curve.accountId === state.supabaseSync.selectedAccountCurveId)
        ? state.supabaseSync.selectedAccountCurveId
        : accountCurves[0].accountId;

    state.supabaseSync.selectedAccountCurveId = selectedId;
    selector.innerHTML = accountCurves.map((curve) => `
        <option value="${curve.accountId}" ${curve.accountId === selectedId ? "selected" : ""}>${curve.accountName}</option>
    `).join("");
}

export function updateDashboardAnalyticsPanel() {
    updatePeriodButtons();

    const history = state.supabaseSync.dashboardHistory;
    const summary = history.summary || {};
    const accountCurves = history.accountCurves || [];
    const ranking = rankAccounts(history.performanceByAccount || []);

    setText("history-period-label", formatPeriodLabel(state.supabaseSync.historyRange));
    setText("history-cycle-total", String(summary.cycleCount || 0));
    setText("history-trade-total", String(summary.tradeCount || 0));
    setText("history-period-pnl", formatSignedCurrency(summary.totalPnlUsdt || 0));
    setText("history-period-win-rate", formatPercent(summary.avgWinRate || 0));
    setText("history-period-equity-delta", formatSignedCurrency(summary.equityDeltaUsdt || 0));

    const pnlElement = document.getElementById("history-period-pnl");
    if (pnlElement) {
        pnlElement.className = Number(summary.totalPnlUsdt || 0) >= 0
            ? "text-lg font-black text-cyber-up font-mono"
            : "text-lg font-black text-cyber-down font-mono";
    }

    const deltaElement = document.getElementById("history-period-equity-delta");
    if (deltaElement) {
        deltaElement.className = Number(summary.equityDeltaUsdt || 0) >= 0
            ? "text-lg font-black text-cyber-up font-mono"
            : "text-lg font-black text-cyber-down font-mono";
    }

    renderPerformanceCards(history.performanceByAccount || [], "account-performance-list", "account");
    renderPerformanceCards(history.performanceByPair || [], "pair-performance-list", "pair");
    renderRankingList(ranking);
    syncAccountCurveSelector(accountCurves);

    const selectedCurve = accountCurves.find((curve) => curve.accountId === state.supabaseSync.selectedAccountCurveId) || null;
    renderEquityHistoryChart(history.equityCurve || [], state.supabaseSync.historyRange);
    renderAccountEquityChart(selectedCurve, state.supabaseSync.historyRange);

    const generatedAt = history.generatedAt
        ? new Date(history.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        : "--";
    setText("history-generated-at", generatedAt);
}

export function changeDashboardHistoryRange(period) {
    if (!DASHBOARD_HISTORY_PERIODS.includes(period)) {
        return;
    }

    state.supabaseSync.historyRange = period;
    updateDashboardAnalyticsPanel();
    loadRecentSupabaseHistory(true).then(() => {
        updateDashboardAnalyticsPanel();
    }).catch(() => {});
}

export function changeDashboardAccountCurve(accountId) {
    state.supabaseSync.selectedAccountCurveId = accountId;
    updateDashboardAnalyticsPanel();
}
