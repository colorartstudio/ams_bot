import {
    DEFAULT_ACCOUNTS,
    DEFAULT_ASSET,
    DEFAULT_BALANCE,
    DEFAULT_CODE_TYPE,
    DEFAULT_MARKETS,
    DEFAULT_NETWORK
} from "../config/constants.js";

function cloneAccounts(accounts) {
    return accounts.map((account) => ({
        ...account,
        activePair: account.activePair || DEFAULT_ASSET,
        initialBalance: account.balance,
        equityPeak: account.balance,
        trades: 0,
        wins: 0,
        losses: 0,
        grossProfit: 0,
        grossLoss: 0,
        realizedPnl: 0,
        lastPnl: 0,
        lastPair: account.activePair || DEFAULT_ASSET
    }));
}

function cloneMarkets(markets) {
    return Object.fromEntries(
        Object.entries(markets).map(([symbol, data]) => [symbol, { ...data }])
    );
}

export const state = {
    auth: {
        initialized: false,
        status: "idle",
        user: null,
        profile: null,
        session: null
    },
    activeTab: "dashboard",
    activeCodeType: DEFAULT_CODE_TYPE,
    currentNetwork: DEFAULT_NETWORK,
    currentAsset: DEFAULT_ASSET,
    mockWalletBalance: DEFAULT_BALANCE,
    accountsRegistry: cloneAccounts(DEFAULT_ACCOUNTS),
    fimatheChartObj: null,
    backtestChartObj: null,
    equityHistoryChartObj: null,
    accountEquityChartObj: null,
    activeMarkets: cloneMarkets(DEFAULT_MARKETS),
    liveSimulation: {
        cycle: 0,
        totalEquity: DEFAULT_ACCOUNTS.reduce((sum, account) => sum + account.balance, 0),
        totalPnl: 0,
        totalTrades: 0,
        winRate: 0,
        profitFactor: 0,
        bestAccountName: DEFAULT_ACCOUNTS[0]?.name || "--",
        activeAccounts: 0
    },
    generalSignal: {
        mode: "neutral",
        title: "ESTRUTURA EM OBSERVACAO",
        description: "O motor ainda esta consolidando o contexto operacional antes de liberar a melhor leitura.",
        efficiency: "0.0",
        profitFactor: "0.00"
    },
    supabaseSync: {
        status: "idle",
        lastWriteAt: null,
        lastReadAt: null,
        lastError: "",
        historyRange: "24h",
        selectedAccountCurveId: "",
        recentCycles: [],
        recentTrades: [],
        recentSnapshots: [],
        latestMetrics: null,
        dashboardHistory: {
            summary: null,
            ranking: [],
            performanceByAccount: [],
            performanceByPair: [],
            equityCurve: [],
            accountCurves: [],
            generatedAt: null
        }
    }
};
