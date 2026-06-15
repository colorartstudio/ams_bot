import { ASSET_OPTIONS, MARKET_LABELS } from "../config/constants.js";

export function getMarketMeta(symbol) {
    return ASSET_OPTIONS.find((asset) => asset.symbol === symbol);
}

export function getQuoteSymbol(symbol) {
    return getMarketMeta(symbol)?.quote || "USDT";
}

export function formatMarketLabel(symbol) {
    return MARKET_LABELS[symbol] || symbol;
}

export function getSuggestedMarkets(symbol, limit = 2) {
    const activeQuote = getQuoteSymbol(symbol);
    const preferred = ASSET_OPTIONS.filter((asset) => asset.quote === activeQuote);
    const prioritized = preferred.filter((asset) => asset.symbol !== symbol);

    return [getMarketMeta(symbol), ...prioritized]
        .filter(Boolean)
        .slice(0, limit);
}

export function formatCurrencyByQuote(value, quote) {
    return `${quote} ${value.toFixed(2)}`;
}

export function buildAssetOptionsMarkup(selectedSymbol) {
    return ASSET_OPTIONS.map((asset) => `
        <option value="${asset.symbol}" ${asset.symbol === selectedSymbol ? "selected" : ""}>${asset.label}</option>
    `).join("");
}

export function getQuoteToUsdtRate(markets, quote) {
    if (quote === "USDT" || quote === "USDC") {
        return 1;
    }

    const btcUsdt = markets.BTCUSDT?.price;
    const btcBrl = markets.BTCBRL?.price;
    if (quote === "BRL" && btcUsdt && btcBrl) {
        return btcUsdt / btcBrl;
    }

    return 1;
}

export function convertQuoteAmountToUsdt(markets, amount, quote) {
    return amount * getQuoteToUsdtRate(markets, quote);
}
