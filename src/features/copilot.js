import { runtimeConfig } from "../config/runtime.js";
import { showToast } from "../ui/feedback.js";
import { escapeHtml } from "../utils/sanitize.js";

function formatMessageText(text) {
    return escapeHtml(text).replace(/\n/g, "<br>");
}

function appendChatMessage(sender, text, options = {}) {
    const box = document.getElementById("chat-messages");
    if (!box) {
        return;
    }

    const isAI = sender === "AI";
    const nameBg = isAI ? "bg-cyber-purple" : "bg-cyber-cyan text-cyber-bg";
    const align = isAI ? "justify-start" : "justify-end";
    const bubbleBg = isAI ? "bg-cyber-bg border border-cyber-border" : "bg-cyber-purple/20 border border-cyber-purple/40";
    const content = options.allowHtml ? text : formatMessageText(text);

    box.insertAdjacentHTML(
        "beforeend",
        `
            <div class="flex gap-2.5 ${align}">
                ${isAI ? `<div class="w-6 h-6 rounded-full ${nameBg} flex items-center justify-center text-[10px] font-bold shrink-0">AI</div>` : ""}
                <div class="${bubbleBg} p-3.5 rounded-2xl text-slate-200 leading-relaxed max-w-[85%]">
                    ${content}
                </div>
                ${!isAI ? `<div class="w-6 h-6 rounded-full ${nameBg} flex items-center justify-center text-[10px] font-bold shrink-0">EU</div>` : ""}
            </div>
        `
    );

    box.scrollTop = box.scrollHeight;
}

async function callGeminiWithBackoff(payload) {
    const apiKey = runtimeConfig.geminiApiKey;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY não configurada no runtime da aplicação.");
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    let delay = 1000;

    for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                return await response.json();
            }
        } catch {
            // Retry with exponential backoff.
        }

        await new Promise((resolve) => window.setTimeout(resolve, delay));
        delay *= 2;
    }

    throw new Error("Falha ao se conectar com o Gemini após várias tentativas com backoff exponencial.");
}

export function clearChatMessages() {
    const box = document.getElementById("chat-messages");
    if (!box) {
        return;
    }

    box.innerHTML = `
        <div class="flex gap-2.5">
            <div class="w-6 h-6 rounded-full bg-cyber-purple flex items-center justify-center text-[10px] font-bold shrink-0">AI</div>
            <div class="bg-cyber-bg p-3.5 rounded-2xl border border-cyber-border text-slate-300 leading-relaxed max-w-[85%]">
                Histórico de conversas limpo. Faça suas perguntas operacionais para mim.
            </div>
        </div>
    `;
}

export async function sendMessageToCopilot() {
    const input = document.getElementById("chat-user-input");
    const query = input?.value.trim();

    if (!input || !query) {
        return;
    }

    input.value = "";
    appendChatMessage("User", query);

    appendChatMessage(
        "AI",
        '<div class="flex gap-1 py-1"><span class="w-2 h-2 bg-cyber-purple rounded-full animate-bounce"></span><span class="w-2 h-2 bg-cyber-purple rounded-full animate-bounce delay-100"></span><span class="w-2 h-2 bg-cyber-purple rounded-full animate-bounce delay-200"></span></div>',
        { allowHtml: true }
    );

    try {
        const systemPrompt = `Você é o assistente técnico de inteligência artificial de elite "AMS AI Copilot".
Sua especialidade é trading de alta frequência (HFT), parametrização da API de cotação/execução da Bybit Testnet e simulações com a biblioteca hftbacktest.
Seu objetivo é dar orientações extremamente precisas para ajudar o operador a gerenciar riscos de bancas curtas ($50), calibrar canais Fimathe e depurar o código em Python.
Dê respostas concisas, diretas e extremamente técnicas em Português.`;

        const payload = {
            contents: [{ parts: [{ text: query }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] }
        };

        const data = await callGeminiWithBackoff(payload);
        const text =
            data.candidates?.[0]?.content?.parts?.[0]?.text ||
            "Desculpe, não consegui processar sua consulta operacional.";

        const box = document.getElementById("chat-messages");
        box?.lastElementChild?.remove();
        appendChatMessage("AI", text);
    } catch (error) {
        const box = document.getElementById("chat-messages");
        box?.lastElementChild?.remove();
        appendChatMessage("AI", `Erro ao se conectar com o Copilot: ${error.message}`);
        showToast("Falha na chamada do Copilot.", "error");
    }
}

export function handleChatInputKey(event) {
    if (event.key === "Enter") {
        sendMessageToCopilot();
    }
}

export function sendQuestionToCopilot(question, switchTab) {
    switchTab("copilot");
    const input = document.getElementById("chat-user-input");
    if (!input) {
        return;
    }

    input.value = question;
    sendMessageToCopilot();
}
