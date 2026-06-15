import { TAB_IDS } from "../config/constants.js";
import { state } from "../state/store.js";
import { renderBacktestChart, renderFimatheChart } from "../services/charts.js";
import { persistAppState } from "../services/storage.js";

export function switchTab(tabId, hooks = {}) {
    state.activeTab = tabId;
    persistAppState();

    TAB_IDS.forEach((tab) => {
        const section = document.getElementById(`tab-${tab}`);
        const button = document.getElementById(`tab-btn-${tab}`);
        const isActive = tab === tabId;

        section?.classList.toggle("hidden", !isActive);

        if (button) {
            button.className = isActive
                ? "text-cyber-cyan border-b-2 border-cyber-cyan pb-1 flex items-center gap-1.5 transition-all shrink-0"
                : "hover:text-cyber-cyan flex items-center gap-1.5 transition-all shrink-0";
        }
    });

    if (tabId === "dashboard") {
        window.setTimeout(renderFimatheChart, 100);
    } else if (tabId === "backtest") {
        window.setTimeout(renderBacktestChart, 100);
    } else if (tabId === "code") {
        hooks.onCodeTabOpen?.();
    }
}
