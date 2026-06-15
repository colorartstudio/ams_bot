export const TAB_IDS = ["dashboard", "backtest", "copilot", "code"];

export const DEFAULT_NETWORK = "testnet";
export const DEFAULT_ASSET = "SOLUSDT";
export const DEFAULT_CODE_TYPE = "live";
export const DEFAULT_BALANCE = 50;
export const STORAGE_KEY = "ams-local-session";
export const BYBIT_TESTNET_REST_URL = "https://api-testnet.bybit.com";
export const MARKET_POLL_INTERVAL_MS = 6000;
export const SUPABASE_SNAPSHOT_INTERVAL_MS = 20000;
export const SUPABASE_CYCLE_INTERVAL_MS = 18000;
export const SUPABASE_METRICS_INTERVAL_MS = 30000;
export const SUPABASE_HISTORY_REFRESH_INTERVAL_MS = 25000;
export const DASHBOARD_HISTORY_PERIODS = ["1h", "24h", "7d", "30d"];

export const DEFAULT_ACCOUNTS = [
    {
        id: 101,
        name: "Banca_Micro_Mestre",
        key: "demo-key-01",
        secret: "****",
        balance: 50,
        activePair: "SOLUSDT",
        tp: 0.3,
        sl: 0.3,
        status: "PAUSED"
    },
    {
        id: 102,
        name: "Banca_Cliente_VIP",
        key: "demo-key-02",
        secret: "****",
        balance: 100,
        activePair: "BTCUSDT",
        tp: 0.5,
        sl: 0.5,
        status: "PAUSED"
    }
];

export const ASSET_OPTIONS = [
    { symbol: "SOLUSDT", label: "SOL/USDT", quote: "USDT", price: 67.35 },
    { symbol: "XRPUSDT", label: "XRP/USDT", quote: "USDT", price: 1.182 },
    { symbol: "BTCUSDT", label: "BTC/USDT", quote: "USDT", price: 63450 },
    { symbol: "ETHUSDT", label: "ETH/USDT", quote: "USDT", price: 3450 },
    { symbol: "SOLUSDC", label: "SOL/USDC", quote: "USDC", price: 67.31 },
    { symbol: "XRPUSDC", label: "XRP/USDC", quote: "USDC", price: 1.181 },
    { symbol: "BTCUSDC", label: "BTC/USDC", quote: "USDC", price: 63520 },
    { symbol: "ETHUSDC", label: "ETH/USDC", quote: "USDC", price: 3452 },
    { symbol: "SOLBRL", label: "SOL/BRL", quote: "BRL", price: 373.2 },
    { symbol: "XRPBRL", label: "XRP/BRL", quote: "BRL", price: 6.58 },
    { symbol: "BTCBRL", label: "BTC/BRL", quote: "BRL", price: 352000 },
    { symbol: "ETHBRL", label: "ETH/BRL", quote: "BRL", price: 19150 }
];

export const MARKET_LABELS = Object.fromEntries(
    ASSET_OPTIONS.map(({ symbol, label }) => [symbol, label])
);

export const DEFAULT_MARKETS = Object.fromEntries(
    ASSET_OPTIONS.map(({ symbol, label, quote, price }) => [
        symbol,
        {
            label,
            quote,
            price,
            prevPrice: price,
            changePercent24h: 0,
            source: "bootstrap",
            lastUpdate: null,
            history: [],
            crHigh: price * 1.0022,
            znLow: price * 0.9965
        }
    ])
);
