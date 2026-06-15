import { STORAGE_KEY } from "../config/constants.js";
import { state } from "../state/store.js";

function isBrowserStorageAvailable() {
    return typeof window !== "undefined" && !!window.localStorage;
}

function sanitizeAccount(account) {
    return {
        ...account,
        key: "",
        secret: "",
        keyMasked: account.keyMasked || (account.key ? `${account.key.slice(0, 6)}...` : "masked")
    };
}

function serializeState() {
    return {
        activeTab: state.activeTab,
        activeCodeType: state.activeCodeType,
        currentNetwork: state.currentNetwork,
        currentAsset: state.currentAsset,
        mockWalletBalance: state.mockWalletBalance,
        accountsRegistry: state.accountsRegistry.map(sanitizeAccount),
        liveSimulation: state.liveSimulation,
        generalSignal: state.generalSignal
    };
}

export function persistAppState() {
    if (!isBrowserStorageAvailable()) {
        return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState()));
}

export function hydrateAppState() {
    if (!isBrowserStorageAvailable()) {
        return false;
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
        return false;
    }

    try {
        const saved = JSON.parse(raw);
        state.activeTab = saved.activeTab || state.activeTab;
        state.activeCodeType = saved.activeCodeType || state.activeCodeType;
        state.currentNetwork = saved.currentNetwork || state.currentNetwork;
        state.currentAsset = saved.currentAsset || state.currentAsset;
        state.mockWalletBalance = Number.isFinite(saved.mockWalletBalance)
            ? saved.mockWalletBalance
            : state.mockWalletBalance;

        if (Array.isArray(saved.accountsRegistry) && saved.accountsRegistry.length > 0) {
            state.accountsRegistry = saved.accountsRegistry.map((account) => ({
                ...account,
                key: account.key || "",
                secret: "",
                keyMasked: account.keyMasked || "masked"
            }));
        }

        if (saved.liveSimulation && typeof saved.liveSimulation === "object") {
            state.liveSimulation = { ...state.liveSimulation, ...saved.liveSimulation };
        }

        if (saved.generalSignal && typeof saved.generalSignal === "object") {
            state.generalSignal = { ...state.generalSignal, ...saved.generalSignal };
        }

        return true;
    } catch {
        return false;
    }
}

export function clearPersistedState() {
    if (!isBrowserStorageAvailable()) {
        return;
    }

    window.localStorage.removeItem(STORAGE_KEY);
}
