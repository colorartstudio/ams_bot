import {
    calculateAllocationSuggestions,
    changeAccountPair,
    closeClientModal,
    deleteAccount,
    registerBybitAccount,
    renderAccountsRegistry,
    saveClientModalChanges,
    toggleAccountStatus,
    updateClientBalance
} from "../features/accounts.js";
import { startHftBacktestSim, updateTargetSliders } from "../features/backtest.js";
import { switchCodeFile, updateCodeViewer, copyActiveCodeToClipboard } from "../features/code-viewer.js";
import {
    clearChatMessages,
    handleChatInputKey,
    sendMessageToCopilot,
    sendQuestionToCopilot
} from "../features/copilot.js";
import { state } from "../state/store.js";
import {
    changeDashboardAccountCurve,
    changeDashboardHistoryRange,
    changeAssetSymbol,
    initializeDashboardState,
    setNetwork,
    startWebSocketPriceMock,
    stopWebSocketPriceMock
} from "../features/dashboard.js";
import { initializeAuthFlow, signInOperator, signOutOperator } from "../features/auth.js";
import { loadRuntimeConfig } from "../config/runtime.js";
import { renderFimatheChart } from "../services/charts.js";
import { hydrateAppState, persistAppState } from "../services/storage.js";
import { clearTerminalLogs, refreshIcons } from "../ui/feedback.js";
import { switchTab as changeTab } from "../ui/tabs.js";

function switchTab(tabId) {
    changeTab(tabId, { onCodeTabOpen: updateCodeViewer });
}

function exposeGlobals() {
    window.switchTab = switchTab;
    window.setNetwork = setNetwork;
    window.clearTerminalLogs = clearTerminalLogs;
    window.updateTargetSliders = updateTargetSliders;
    window.registerBybitAccount = registerBybitAccount;
    window.deleteAccount = deleteAccount;
    window.toggleAccountStatus = toggleAccountStatus;
    window.changeAccountPair = changeAccountPair;
    window.updateClientBalance = updateClientBalance;
    window.closeClientModal = closeClientModal;
    window.saveClientModalChanges = saveClientModalChanges;
    window.changeAssetSymbol = changeAssetSymbol;
    window.changeDashboardHistoryRange = changeDashboardHistoryRange;
    window.changeDashboardAccountCurve = changeDashboardAccountCurve;
    window.startHftBacktestSim = startHftBacktestSim;
    window.switchCodeFile = switchCodeFile;
    window.copyActiveCodeToClipboard = copyActiveCodeToClipboard;
    window.clearChatMessages = clearChatMessages;
    window.handleChatInputKey = handleChatInputKey;
    window.sendMessageToCopilot = sendMessageToCopilot;
    window.sendQuestionToCopilot = (question) => sendQuestionToCopilot(question, switchTab);
    window.signInOperator = signInOperator;
    window.signOutOperator = signOutOperator;
}

let runtimeStarted = false;

function startProtectedRuntime() {
    if (runtimeStarted) {
        return;
    }

    initializeDashboardState();
    renderAccountsRegistry();
    calculateAllocationSuggestions(state.mockWalletBalance ?? 50);
    changeAssetSymbol(true);
    renderFimatheChart();
    startWebSocketPriceMock();
    persistAppState();
    runtimeStarted = true;
}

function stopProtectedRuntime() {
    if (runtimeStarted) {
        stopWebSocketPriceMock();
    }

    runtimeStarted = false;
}

async function bootstrap() {
    await loadRuntimeConfig();
    hydrateAppState();
    exposeGlobals();
    switchTab(state.activeTab || "dashboard");
    const accountPairSelector = document.getElementById("acc-pair");
    if (accountPairSelector) {
        accountPairSelector.value = state.currentAsset;
    }
    renderAccountsRegistry();
    calculateAllocationSuggestions(state.mockWalletBalance ?? 50);
    changeAssetSymbol(true);
    renderFimatheChart();
    updateTargetSliders();
    updateCodeViewer();
    refreshIcons();

    await initializeAuthFlow({
        onAuthenticated: async () => {
            startProtectedRuntime();
            refreshIcons();
        },
        onSignedOut: async () => {
            stopProtectedRuntime();
            refreshIcons();
        }
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
} else {
    bootstrap();
}
