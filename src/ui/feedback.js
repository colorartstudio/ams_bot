export function refreshIcons() {
    if (window.lucide?.createIcons) {
        window.lucide.createIcons();
    }
}

export function showToast(message, type = "info") {
    const toast = document.getElementById("custom-toast");
    const toastMessage = document.getElementById("toast-msg");
    const toastIcon = document.getElementById("toast-icon");

    if (!toast || !toastMessage || !toastIcon) {
        return;
    }

    toastMessage.innerText = message;

    if (type === "success") {
        toastIcon.setAttribute("class", "w-5 h-5 text-cyber-up");
    } else if (type === "warning") {
        toastIcon.setAttribute("class", "w-5 h-5 text-cyber-warning");
    } else if (type === "error") {
        toastIcon.setAttribute("class", "w-5 h-5 text-cyber-down");
    } else {
        toastIcon.setAttribute("class", "w-5 h-5 text-cyber-cyan");
    }

    toast.classList.remove("translate-y-20", "opacity-0");
    toast.classList.add("glow-cyan");

    window.setTimeout(() => {
        toast.classList.add("translate-y-20", "opacity-0");
    }, 3000);
}

export function appendTerminalLog(moduleName, text, type = "info") {
    const container = document.getElementById("live-terminal-logs");
    if (!container) {
        return;
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString();
    let colorClass = "text-cyber-cyan";

    if (type === "warning") colorClass = "text-cyber-warning";
    if (type === "error") colorClass = "text-cyber-down";
    if (type === "success") colorClass = "text-cyber-up";

    container.innerHTML += `<div><span class="text-slate-500">[${timeStr}]</span> <span class="${colorClass}">[${moduleName.toUpperCase()}]</span> ${text}</div>`;
    container.scrollTop = container.scrollHeight;
}

export function clearTerminalLogs() {
    const container = document.getElementById("live-terminal-logs");
    if (!container) {
        return;
    }

    container.innerHTML = `<div><span class="text-slate-500">[${new Date().toLocaleTimeString()}]</span> <span class="text-cyber-cyan">[CORE]</span> Console limpo pelo operador. Monitor ativo.</div>`;
}
