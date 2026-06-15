import { state } from "../state/store.js";

function buildChartLabels(points, fallbackLabel) {
    if (!Array.isArray(points) || points.length === 0) {
        return [fallbackLabel];
    }

    return points.map((point) => {
        const stamp = point.createdAt || point.time || point.label;
        return new Date(stamp).toLocaleString([], {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        });
    });
}

function buildChartValues(points, key, fallbackValue) {
    if (!Array.isArray(points) || points.length === 0) {
        return [fallbackValue];
    }

    return points.map((point) => Number(point[key] || 0));
}

export function renderFimatheChart() {
    const canvas = document.getElementById("fimatheChart");
    if (!canvas) {
        return;
    }

    const ctx = canvas.getContext("2d");
    if (state.fimatheChartObj) {
        state.fimatheChartObj.destroy();
    }

    const market = state.activeMarkets[state.currentAsset];
    const history = Array.isArray(market.history) && market.history.length > 0
        ? market.history.slice(-12)
        : [{ price: market.price, time: Date.now() }];
    const labels = history.map((entry) => new Date(entry.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    const basePrices = history.map((entry) => entry.price);

    state.fimatheChartObj = new window.Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [
                {
                    label: "Cotação Spot",
                    data: basePrices,
                    borderColor: "#00f0ff",
                    borderWidth: 2,
                    pointRadius: 3,
                    backgroundColor: "rgba(0, 240, 255, 0.05)",
                    fill: false,
                    tension: 0.15
                },
                {
                    label: "CR High (Limite Rompimento)",
                    data: Array(12).fill(market.crHigh),
                    borderColor: "#fbbf24",
                    borderWidth: 1.5,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                },
                {
                    label: "ZN Low (Zona Neutra)",
                    data: Array(12).fill(market.znLow),
                    borderColor: "#f43f5e",
                    borderWidth: 1.5,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: "#94a3b8", font: { size: 9 } }
                }
            },
            scales: {
                x: {
                    grid: { color: "rgba(20, 29, 48, 0.3)" },
                    ticks: { color: "#64748b", font: { size: 8 } }
                },
                y: {
                    grid: { color: "rgba(20, 29, 48, 0.3)" },
                    ticks: { color: "#64748b", font: { size: 8 } }
                }
            }
        }
    });
}

export function renderBacktestChart(labels = ["Início"], data = [50]) {
    const canvas = document.getElementById("backtestChart");
    if (!canvas) {
        return;
    }

    const ctx = canvas.getContext("2d");
    if (state.backtestChartObj) {
        state.backtestChartObj.destroy();
    }

    state.backtestChartObj = new window.Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [
                {
                    label: "Patrimônio AMS (USD)",
                    data,
                    borderColor: "#9d4edd",
                    borderWidth: 2,
                    pointRadius: data.length > 10 ? 1 : 3,
                    backgroundColor: "rgba(157, 78, 221, 0.05)",
                    fill: true,
                    tension: 0.15
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: "#64748b", font: { size: 8 } }
                },
                y: {
                    grid: { color: "rgba(20, 29, 48, 0.2)" },
                    ticks: { color: "#64748b", font: { size: 8 } }
                }
            }
        }
    });
}

export function renderEquityHistoryChart(points = [], period = "24h") {
    const canvas = document.getElementById("equityHistoryChart");
    if (!canvas) {
        return;
    }

    const ctx = canvas.getContext("2d");
    if (state.equityHistoryChartObj) {
        state.equityHistoryChartObj.destroy();
    }

    const labels = buildChartLabels(points, "Sem histórico");
    const data = buildChartValues(points, "equityUsdt", 0);

    state.equityHistoryChartObj = new window.Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [
                {
                    label: `Patrimônio Global (${period})`,
                    data,
                    borderColor: "#00f0ff",
                    borderWidth: 2,
                    pointRadius: data.length > 10 ? 1 : 3,
                    backgroundColor: "rgba(0, 240, 255, 0.08)",
                    fill: true,
                    tension: 0.2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: "#94a3b8", font: { size: 10 } }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: "#64748b", font: { size: 8 } }
                },
                y: {
                    grid: { color: "rgba(20, 29, 48, 0.2)" },
                    ticks: { color: "#64748b", font: { size: 8 } }
                }
            }
        }
    });
}

export function renderAccountEquityChart(accountCurve = null, period = "24h") {
    const canvas = document.getElementById("accountEquityChart");
    if (!canvas) {
        return;
    }

    const ctx = canvas.getContext("2d");
    if (state.accountEquityChartObj) {
        state.accountEquityChartObj.destroy();
    }

    const points = accountCurve?.points || [];
    const labels = buildChartLabels(points, "Sem dados");
    const data = buildChartValues(points, "equityUsdt", 0);

    state.accountEquityChartObj = new window.Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [
                {
                    label: `${accountCurve?.accountName || "Conta"} (${period})`,
                    data,
                    borderColor: "#9d4edd",
                    borderWidth: 2,
                    pointRadius: data.length > 10 ? 1 : 3,
                    backgroundColor: "rgba(157, 78, 221, 0.08)",
                    fill: true,
                    tension: 0.2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: "#94a3b8", font: { size: 10 } }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: "#64748b", font: { size: 8 } }
                },
                y: {
                    grid: { color: "rgba(20, 29, 48, 0.2)" },
                    ticks: { color: "#64748b", font: { size: 8 } }
                }
            }
        }
    });
}
