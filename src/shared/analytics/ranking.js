export function calculateWinRate(wins = 0, trades = 0) {
    return trades > 0 ? (wins / trades) * 100 : 0;
}

export function calculateProfitFactor(grossProfit = 0, grossLoss = 0) {
    if (grossLoss > 0) {
        return grossProfit / grossLoss;
    }

    return grossProfit > 0 ? grossProfit : 0;
}

export function calculateMaxDrawdown(points = [], key = "equityUsdt") {
    let peak = 0;
    let maxDrawdown = 0;

    points.forEach((point) => {
        const value = Number(point?.[key] || 0);
        peak = Math.max(peak, value);
        if (peak <= 0) {
            return;
        }

        const drawdown = ((peak - value) / peak) * 100;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
    });

    return maxDrawdown;
}

function normalizePnl(value, minPnl, pnlRange) {
    return ((value - minPnl) / pnlRange) * 100;
}

export function calculateRankingScore(account, context) {
    const normalizedPnl = normalizePnl(account.pnlUsdt || 0, context.minPnl, context.pnlRange);
    const drawdownHealth = Math.max(0, 100 - Math.min(Number(account.drawdownPct || 0), 100));

    return (normalizedPnl * 0.55) + ((account.winRate || 0) * 0.25) + (drawdownHealth * 0.20);
}

export function rankAccounts(accounts = []) {
    const pnlValues = accounts.map((account) => Number(account.pnlUsdt || 0));
    const maxPnl = pnlValues.length > 0 ? Math.max(...pnlValues) : 0;
    const minPnl = pnlValues.length > 0 ? Math.min(...pnlValues) : 0;
    const pnlRange = maxPnl - minPnl || 1;

    return accounts
        .map((account) => ({
            ...account,
            score: calculateRankingScore(account, { minPnl, pnlRange })
        }))
        .sort((left, right) => right.score - left.score);
}
