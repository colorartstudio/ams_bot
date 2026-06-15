import { state } from "../state/store.js";
import { syncAccountsToSupabase } from "../services/supabase-persistence.js";
import { persistAppState } from "../services/storage.js";
import { updateLiveSimulationSummary } from "../services/testnet-engine.js";
import { refreshIcons, appendTerminalLog, showToast } from "../ui/feedback.js";
import { openModal, closeModal } from "../ui/modal.js";
import { escapeHtml } from "../utils/sanitize.js";
import {
    buildAssetOptionsMarkup,
    formatCurrencyByQuote,
    formatMarketLabel,
    getQuoteSymbol,
    getSuggestedMarkets
} from "../utils/markets.js";

export function calculateAllocationSuggestions(balance) {
    state.mockWalletBalance = balance;

    const selectedBalance = document.getElementById("banca-selecionada-val");
    const lotValueElement = document.getElementById("lote-operacional-val");
    const breakdownContainer = document.getElementById("suggested-lot-breakdown");

    if (!selectedBalance || !lotValueElement || !breakdownContainer) {
        return;
    }

    const activeQuote = getQuoteSymbol(state.currentAsset);
    selectedBalance.innerText = formatCurrencyByQuote(balance, activeQuote);

    const lotValue = balance * 0.3;
    lotValueElement.innerText = formatCurrencyByQuote(lotValue, activeQuote);

    const suggestions = getSuggestedMarkets(state.currentAsset, 2);
    breakdownContainer.innerHTML = suggestions.map((market) => {
        const baseAsset = market.label.split("/")[0];
        const quantity = lotValue / state.activeMarkets[market.symbol].price;

        return `
            <div class="p-2.5 bg-cyber-card rounded-lg border border-cyber-border flex justify-between items-center">
                <span class="font-bold text-white font-display">${market.label}</span>
                <span class="text-slate-400 font-mono">Quant: <strong class="text-cyber-cyan">${quantity.toFixed(quantity >= 10 ? 2 : 4)} ${baseAsset}</strong> (~${formatCurrencyByQuote(lotValue, market.quote)})</span>
            </div>
        `;
    }).join("");
}

export function renderAccountsRegistry() {
    const container = document.getElementById("bybit-accounts-list");
    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (state.accountsRegistry.length === 0) {
        container.innerHTML = `<div class="text-center py-4 text-slate-500 text-xs font-sans">Nenhuma conta cadastrada para simulação.</div>`;
        return;
    }

    state.accountsRegistry.forEach((account) => {
        const isRunning = account.status === "RUNNING";
        const accountPair = account.activePair || state.currentAsset;
        const accountQuote = getQuoteSymbol(accountPair);
        const statusBadge = isRunning
            ? `<span class="text-[9px] text-cyber-up font-bold bg-cyber-up/10 px-1.5 py-0.5 rounded border border-cyber-up/20 animate-pulse">RUNNING</span>`
            : `<span class="text-[9px] text-cyber-down font-bold bg-cyber-down/10 px-1.5 py-0.5 rounded border border-cyber-down/20">PAUSED</span>`;

        const statusClass = isRunning
            ? "bg-cyber-down/20 text-cyber-down hover:bg-cyber-down/30 border border-cyber-down/30"
            : "bg-cyber-up/20 text-cyber-up hover:bg-cyber-up/30 border border-cyber-up/30";
        const profitFactor = account.grossLoss > 0
            ? account.grossProfit / account.grossLoss
            : account.grossProfit > 0 ? account.grossProfit : 0;
        const pnlClass = account.realizedPnl >= 0 ? "text-cyber-up" : "text-cyber-down";
        const keyLabel = escapeHtml(account.keyMasked || (account.key ? `${account.key.substring(0, 6)}...` : "masked"));

        container.innerHTML += `
            <div class="p-3 bg-cyber-bg rounded-xl border border-cyber-border text-xs font-mono space-y-2">
                <div class="flex items-center justify-between">
                    <div>
                        <span class="font-bold text-white block font-sans">${escapeHtml(account.name)}</span>
                        <div class="text-[9px] text-slate-500 space-x-1">
                            <span>Key: ${keyLabel}</span>
                            <span>•</span>
                            <span class="text-cyber-cyan">TP: ${account.tp}%</span>
                            <span>•</span>
                            <span class="text-cyber-down">SL: ${account.sl}%</span>
                        </div>
                    </div>
                    <div class="text-right flex flex-col items-end gap-1">
                        <span class="font-bold text-cyber-cyan block text-sm">${formatCurrencyByQuote(account.balance, accountQuote)}</span>
                        ${statusBadge}
                        <span class="text-[10px] ${pnlClass}">PnL: ${account.realizedPnl >= 0 ? "+" : ""}${formatCurrencyByQuote(Math.abs(account.realizedPnl), accountQuote)}</span>
                    </div>
                </div>
                <div class="grid grid-cols-[1fr_auto] gap-2 items-center">
                    <label class="text-[10px] text-slate-500">Par dedicado</label>
                    <select onchange="changeAccountPair(${account.id}, this.value)" class="bg-cyber-card border border-cyber-border rounded-lg px-2 py-1 text-[10px] text-cyber-cyan font-bold outline-none">
                        ${buildAssetOptionsMarkup(accountPair)}
                    </select>
                </div>
                <div class="grid grid-cols-3 gap-1.5 text-[10px]">
                    <div class="rounded-lg border border-cyber-border/60 bg-cyber-card/40 px-2 py-1 text-center">
                        <span class="text-slate-500 block">Trades</span>
                        <span class="text-white font-bold">${account.trades}</span>
                    </div>
                    <div class="rounded-lg border border-cyber-border/60 bg-cyber-card/40 px-2 py-1 text-center">
                        <span class="text-slate-500 block">Win Rate</span>
                        <span class="text-cyber-up font-bold">${account.trades > 0 ? ((account.wins / account.trades) * 100).toFixed(1) : "0.0"}%</span>
                    </div>
                    <div class="rounded-lg border border-cyber-border/60 bg-cyber-card/40 px-2 py-1 text-center">
                        <span class="text-slate-500 block">PF</span>
                        <span class="text-cyber-cyan font-bold">${profitFactor.toFixed(2)}</span>
                    </div>
                </div>
                <div class="flex items-center justify-between text-[10px] text-slate-400 border-t border-cyber-border/40 pt-1.5">
                    <span>Ultimo par: <strong class="text-white">${escapeHtml(formatMarketLabel(account.lastPair || accountPair))}</strong></span>
                    <span>Ultimo trade: <strong class="${account.lastPnl >= 0 ? "text-cyber-up" : "text-cyber-down"}">${account.lastPnl >= 0 ? "+" : ""}${formatCurrencyByQuote(Math.abs(account.lastPnl), accountQuote)}</strong></span>
                </div>
                <div class="flex gap-1.5 pt-1.5 border-t border-cyber-border/40">
                    <button onclick="toggleAccountStatus(${account.id})" class="flex-1 py-1.5 px-2 rounded font-sans font-bold text-[10px] transition-all flex items-center justify-center gap-1 ${statusClass}">
                        <i data-lucide="${isRunning ? "octagon" : "play"}" class="w-3.5 h-3.5"></i> ${isRunning ? "STOP" : "START"}
                    </button>
                    <button onclick="updateClientBalance(${account.id})" class="py-1.5 px-2.5 bg-cyber-cyan/15 hover:bg-cyber-cyan/25 text-cyber-cyan rounded border border-cyber-cyan/30 font-sans font-semibold text-[10px] transition-all flex items-center justify-center gap-1">
                        <i data-lucide="settings" class="w-3.5 h-3.5"></i> AJUSTAR
                    </button>
                    <button onclick="deleteAccount(${account.id})" class="py-1.5 px-2 bg-cyber-down/10 hover:bg-cyber-down/20 text-cyber-down rounded border border-cyber-down/25 transition-all">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                </div>
            </div>
        `;
    });

    refreshIcons();
}

export function registerBybitAccount(event) {
    event.preventDefault();

    const name = document.getElementById("acc-name")?.value.trim();
    const key = document.getElementById("acc-key")?.value.trim();
    const secret = document.getElementById("acc-secret")?.value.trim();
    const balance = Number.parseFloat(document.getElementById("acc-balance")?.value || "");
    const activePair = document.getElementById("acc-pair")?.value || state.currentAsset;

    if (!name || !key || !secret || Number.isNaN(balance)) {
        showToast("Preencha os dados da conta corretamente.", "warning");
        return;
    }

    state.accountsRegistry.push({
        id: Date.now(),
        name,
        key,
        keyMasked: `${key.slice(0, 6)}...`,
        secret,
        activePair,
        balance,
        initialBalance: balance,
        equityPeak: balance,
        tp: 0.3,
        sl: 0.3,
        status: "PAUSED",
        trades: 0,
        wins: 0,
        losses: 0,
        grossProfit: 0,
        grossLoss: 0,
        realizedPnl: 0,
        lastPnl: 0,
        lastPair: activePair
    });

    updateLiveSimulationSummary();
    persistAppState();
    syncAccountsToSupabase(true).catch(() => {});
    renderAccountsRegistry();
    calculateAllocationSuggestions(balance);
    document.getElementById("account-form")?.reset();
    document.getElementById("acc-pair").value = state.currentAsset;

    appendTerminalLog(
        "AMS API",
        `Conta [${name}] vinculada com sucesso. Banca inicial: $${balance.toFixed(2)} USDT. Status: PAUSED`,
        "success"
    );
    showToast("Cliente vinculado com sucesso!", "success");
}

export function deleteAccount(id) {
    state.accountsRegistry = state.accountsRegistry.filter((account) => account.id !== id);
    updateLiveSimulationSummary();
    persistAppState();
    syncAccountsToSupabase(true).catch(() => {});
    renderAccountsRegistry();

    const nextBalance = state.accountsRegistry[0]?.balance ?? 50;
    calculateAllocationSuggestions(nextBalance);

    appendTerminalLog("AMS SYSTEM", "Conta de cliente removida da suíte.", "warning");
    showToast("Conta removida!", "warning");
}

export function toggleAccountStatus(id) {
    const account = state.accountsRegistry.find((item) => item.id === id);
    if (!account) {
        return;
    }

    if (account.status === "PAUSED") {
        account.status = "RUNNING";
        appendTerminalLog(
            "AMS ENGINE",
            `Iniciando robô para conta [${account.name}] em ${state.currentNetwork.toUpperCase()} - Escaneamento ativado no canal Maker.`,
            "success"
        );
        showToast(`Robô ativado para ${account.name}!`, "success");
    } else {
        account.status = "PAUSED";
        appendTerminalLog(
            "AMS ENGINE",
            `Robô pausado para conta [${account.name}] - Remoção temporária de ordens do book.`,
            "warning"
        );
        showToast(`Robô pausado para ${account.name}!`);
    }

    updateLiveSimulationSummary();
    persistAppState();
    syncAccountsToSupabase(true).catch(() => {});
    renderAccountsRegistry();
}

export function changeAccountPair(id, pair) {
    const account = state.accountsRegistry.find((item) => item.id === id);
    if (!account) {
        return;
    }

    account.activePair = pair;
    account.lastPair = pair;
    updateLiveSimulationSummary();
    persistAppState();
    syncAccountsToSupabase(true).catch(() => {});
    renderAccountsRegistry();

    appendTerminalLog("AMS ROUTER", `Conta [${account.name}] agora opera prioritariamente em ${formatMarketLabel(pair)}.`, "info");
    showToast(`Par da conta ajustado para ${formatMarketLabel(pair)}.`, "success");
}

export function updateClientBalance(id) {
    const account = state.accountsRegistry.find((item) => item.id === id);
    if (!account) {
        return;
    }

    document.getElementById("modal-client-id").value = account.id;
    document.getElementById("modal-client-name").value = account.name;
    document.getElementById("modal-client-balance").value = account.balance;
    document.getElementById("modal-client-tp").value = account.tp;
    document.getElementById("modal-client-sl").value = account.sl;
    document.getElementById("modal-client-pair").value = account.activePair || state.currentAsset;

    openModal("client-modal");
}

export function closeClientModal() {
    closeModal("client-modal");
}

export function saveClientModalChanges() {
    const id = Number.parseInt(document.getElementById("modal-client-id")?.value || "", 10);
    const account = state.accountsRegistry.find((item) => item.id === id);

    if (!account) {
        return;
    }

    const newName = document.getElementById("modal-client-name")?.value.trim();
    const newBalance = Number.parseFloat(document.getElementById("modal-client-balance")?.value || "");
    const newTp = Number.parseFloat(document.getElementById("modal-client-tp")?.value || "");
    const newSl = Number.parseFloat(document.getElementById("modal-client-sl")?.value || "");
    const newPair = document.getElementById("modal-client-pair")?.value || state.currentAsset;

    if (!newName || Number.isNaN(newBalance) || Number.isNaN(newTp) || Number.isNaN(newSl)) {
        showToast("Por favor, preencha todos os campos corretamente.", "warning");
        return;
    }

    account.name = newName;
    account.balance = newBalance;
    account.initialBalance = newBalance;
    account.equityPeak = newBalance;
    account.activePair = newPair;
    account.tp = newTp;
    account.sl = newSl;
    account.trades = 0;
    account.wins = 0;
    account.losses = 0;
    account.grossProfit = 0;
    account.grossLoss = 0;
    account.realizedPnl = 0;
    account.lastPnl = 0;
    account.lastPair = newPair;

    updateLiveSimulationSummary();
    persistAppState();
    syncAccountsToSupabase(true).catch(() => {});
    renderAccountsRegistry();
    calculateAllocationSuggestions(newBalance);
    closeClientModal();

    appendTerminalLog(
        "AMS BANK",
        `Parâmetros atualizados para [${account.name}]: Banca ${newBalance.toFixed(2)} | Par ${formatMarketLabel(newPair)} | TP ${newTp}% | SL ${newSl}%`,
        "success"
    );
    showToast("Configurações do cliente salvas!", "success");
}
