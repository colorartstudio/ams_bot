import { pythonHftCodeTemplate, pythonLiveCodeTemplate } from "../config/code-templates.js";
import { persistAppState } from "../services/storage.js";
import { state } from "../state/store.js";
import { showToast } from "../ui/feedback.js";

export function switchCodeFile(file) {
    state.activeCodeType = file;
    persistAppState();

    const buttonLive = document.getElementById("code-btn-live");
    const buttonHft = document.getElementById("code-btn-hft");
    const filename = document.getElementById("code-display-filename");

    if (file === "live") {
        buttonLive.className = "bg-cyber-card text-cyber-cyan border border-cyber-cyan/20 px-3 py-1.5 rounded font-bold transition-colors";
        buttonHft.className = "text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded transition-colors";
        filename.innerText = "aegis_bybit_bot.py";
    } else {
        buttonHft.className = "bg-cyber-card text-cyber-cyan border border-cyber-cyan/20 px-3 py-1.5 rounded font-bold transition-colors";
        buttonLive.className = "text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded transition-colors";
        filename.innerText = "hft_backtest_runner.py";
    }

    updateCodeViewer();
}

export function updateCodeViewer() {
    const block = document.getElementById("code-display-block");
    if (!block) {
        return;
    }

    block.innerText = state.activeCodeType === "live"
        ? pythonLiveCodeTemplate
        : pythonHftCodeTemplate;
}

export async function copyActiveCodeToClipboard() {
    const text = document.getElementById("code-display-block")?.innerText || "";

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            const dummy = document.createElement("textarea");
            document.body.appendChild(dummy);
            dummy.value = text;
            dummy.select();
            document.execCommand("copy");
            document.body.removeChild(dummy);
        }

        showToast("Código copiado!", "success");
    } catch {
        showToast("Não foi possível copiar o código.", "error");
    }
}
