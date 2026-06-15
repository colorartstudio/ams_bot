import { runtimeConfig } from "../config/runtime.js";
import { state } from "../state/store.js";
import { getSupabaseClient } from "../services/supabase-client.js";
import { clearPersistedState, persistAppState } from "../services/storage.js";
import { updateLiveSimulationSummary } from "../services/testnet-engine.js";
import { calculateAllocationSuggestions, renderAccountsRegistry } from "./accounts.js";
import { showToast } from "../ui/feedback.js";

let authCallbacks = {
    onAuthenticated: async () => {},
    onSignedOut: async () => {}
};

function getEmptyAuthPayload() {
    return {
        session: null,
        user: null,
        profile: null
    };
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.innerText = value;
    }
}

function applyAuthState(status, overrides = {}) {
    state.auth.status = status;
    state.auth = {
        ...state.auth,
        ...overrides,
        status,
        initialized: true
    };
}

function mapRemoteAccount(account) {
    return {
        id: account.databaseId || Date.now(),
        databaseId: account.databaseId || null,
        externalId: account.id,
        name: account.name,
        key: "",
        keyMasked: account.keyMasked || "masked",
        secret: "",
        activePair: account.activePair || state.currentAsset,
        balance: Number(account.balance || 0),
        initialBalance: Number(account.initialBalance || account.balance || 0),
        equityPeak: Number(account.balance || 0),
        tp: Number(account.tp || 0.3),
        sl: Number(account.sl || 0.3),
        status: account.status || "PAUSED",
        trades: 0,
        wins: 0,
        losses: 0,
        grossProfit: 0,
        grossLoss: 0,
        realizedPnl: 0,
        lastPnl: 0,
        lastPair: account.activePair || state.currentAsset
    };
}

function applyOperatorAccounts(accounts = []) {
    state.accountsRegistry = accounts.map(mapRemoteAccount);
    updateLiveSimulationSummary();
    renderAccountsRegistry();
    calculateAllocationSuggestions(state.accountsRegistry[0]?.balance ?? state.mockWalletBalance);
    persistAppState();
}

function updateAuthUi() {
    const overlay = document.getElementById("auth-overlay");
    const submitButton = document.getElementById("auth-submit-btn");
    const logoutButton = document.getElementById("operator-logout-btn");
    const loginError = document.getElementById("auth-login-error");
    const badge = document.getElementById("operator-auth-badge");
    const role = state.auth.profile?.role?.toUpperCase() || "--";
    const email = state.auth.profile?.email || state.auth.user?.email || "Sessão não autenticada";

    if (overlay) {
        overlay.classList.toggle("hidden", Boolean(state.auth.session));
    }

    if (submitButton) {
        submitButton.disabled = state.auth.status === "authenticating";
        submitButton.innerText = state.auth.status === "authenticating" ? "AUTENTICANDO..." : "ENTRAR";
    }

    if (logoutButton) {
        logoutButton.classList.toggle("hidden", !state.auth.session);
    }

    if (badge) {
        badge.innerText = state.auth.session ? `${role} | ${email}` : "OPERADOR DESCONECTADO";
        badge.className = state.auth.session
            ? "px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-mono border border-cyber-up/30 bg-cyber-up/10 text-cyber-up"
            : "px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-mono border border-cyber-warning/30 bg-cyber-warning/10 text-cyber-warning";
    }

    if (loginError) {
        loginError.innerText = state.auth.status === "error" ? (state.auth.lastError || "Falha na autenticação.") : "";
    }

    setText("operator-email-label", email);
    setText("operator-role-label", role);
}

function applyBlockingAuthError(message) {
    applyAuthState("error", {
        ...getEmptyAuthPayload(),
        lastError: message
    });
    updateAuthUi();
}

function isRestrictedPanel() {
    return runtimeConfig.panelAccessMode === "restricted";
}

export function togglePasswordVisibility() {
    const input = document.getElementById("auth-password");
    const icon = document.getElementById("auth-password-toggle-icon");
    if (!input) {
        return;
    }

    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    if (icon) {
        icon.setAttribute("data-lucide", isHidden ? "eye-off" : "eye");
    }

    if (typeof window?.lucide?.createIcons === "function") {
        window.lucide.createIcons();
    }
}

async function readErrorBody(response) {
    const contentType = response.headers.get("content-type") || "";
    try {
        if (contentType.includes("application/json")) {
            const payload = await response.json();
            return payload?.error || payload?.message || "";
        }

        return await response.text();
    } catch {
        return "";
    }
}

async function invokeEdgeFunction(functionName, payload, accessToken = "") {
    if (!runtimeConfig.supabaseUrl || !runtimeConfig.supabaseAnonKey) {
        throw new Error("Configuração pública do Supabase ausente no runtime.");
    }

    const headers = {
        "Content-Type": "application/json",
        apikey: runtimeConfig.supabaseAnonKey
    };

    if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${runtimeConfig.supabaseUrl}/functions/v1/${functionName}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorBody = await readErrorBody(response);
        throw new Error(errorBody || `Falha na função ${functionName} (${response.status}).`);
    }

    return response.json();
}

function normalizeAccessError(error) {
    const raw = error instanceof Error ? error.message : String(error || "");
    const message = raw || "Falha ao comunicar com o backend restrito.";

    if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
        return "Falha ao acessar as funções do Supabase (CORS ou funções não publicadas).";
    }

    if (message.includes("(404)")) {
        return "Funções do Supabase não encontradas (deploy pendente).";
    }

    if (message.includes("Origem não autorizada")) {
        return "Origem do painel não autorizada no Supabase. Ajuste ALLOWED_ORIGINS/PANEL_URL.";
    }

    return message;
}

async function postAuditEvent(payload, accessToken = "") {
    if (!runtimeConfig.supabaseUrl || !runtimeConfig.supabaseAnonKey) {
        return;
    }

    const headers = {
        "Content-Type": "application/json",
        apikey: runtimeConfig.supabaseAnonKey
    };

    if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
    }

    try {
        const response = await fetch(`${runtimeConfig.supabaseUrl}/functions/v1/audit-client-event`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(await readErrorBody(response));
        }
    } catch {}
}

async function loadOperatorContext(session) {
    if (!session?.access_token) {
        throw new Error("Sessão do operador ausente.");
    }

    const data = await invokeEdgeFunction("read-operator-context", {
        network: state.currentNetwork,
        currentAsset: state.currentAsset,
        origin: "web-auth",
        originContext: "session-bootstrap",
        requestId: crypto.randomUUID()
    }, session.access_token);

    if (!data?.ok) {
        throw new Error(data?.error || "Falha ao carregar contexto do operador.");
    }

    state.auth.profile = data.profile || null;
    applyOperatorAccounts(data.accounts || []);
}

async function handleAuthBootstrapFailure(message) {
    const supabase = getSupabaseClient();
    const safeMessage = normalizeAccessError(message);
    if (
        supabase
        && state.auth.session
        && (safeMessage.includes("Sessão inválida") || safeMessage.includes("Origem do painel"))
    ) {
        try {
            await supabase.auth.signOut();
        } catch {}
    }

    applyBlockingAuthError(safeMessage);
    showToast(safeMessage, "error");
}

async function handleAuthenticatedSession(session) {
    state.auth.session = session;
    state.auth.user = session?.user || null;
    applyAuthState("authenticated", {
        session,
        user: session?.user || null,
        lastError: ""
    });

    try {
        await loadOperatorContext(session);
    } catch (error) {
        const safeMessage = normalizeAccessError(error);
        state.auth.profile = null;
        state.supabaseSync.status = "offline";
        state.supabaseSync.lastError = safeMessage;
        applyAuthState("authenticated", { lastError: safeMessage });
        showToast(safeMessage, "warning");
    }

    updateAuthUi();
    showToast("Operador autenticado com sucesso.", "success");
    await authCallbacks.onAuthenticated();
}

async function handleSignedOutState() {
    clearPersistedState();
    state.accountsRegistry = [];
    state.supabaseSync.status = "offline";
    state.supabaseSync.lastError = "Autenticação obrigatória para leitura e escrita remotas.";
    updateLiveSimulationSummary();
    renderAccountsRegistry();
    calculateAllocationSuggestions(state.mockWalletBalance);
    applyAuthState("signed_out", {
        session: null,
        user: null,
        profile: null,
        lastError: ""
    });
    updateAuthUi();
    await authCallbacks.onSignedOut();
}

export async function initializeAuthFlow(callbacks = {}) {
    authCallbacks = {
        ...authCallbacks,
        ...callbacks
    };

    const supabase = getSupabaseClient();
    if (!supabase) {
        applyBlockingAuthError("Configuração pública do Supabase ausente no runtime.");
        return;
    }

    try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
            await handleAuthenticatedSession(data.session);
        } else {
            await handleSignedOutState();
        }
    } catch (error) {
        await handleAuthBootstrapFailure(error instanceof Error ? error : "Falha ao inicializar o painel restrito.");
    }

    supabase.auth.onAuthStateChange(async (event, session) => {
        try {
            if (event === "SIGNED_OUT" || !session) {
                await handleSignedOutState();
                return;
            }

            await handleAuthenticatedSession(session);
        } catch (error) {
            await handleAuthBootstrapFailure(error instanceof Error ? error : "Falha ao validar o operador.");
        }
    });
}

export async function signInOperator(event) {
    event.preventDefault();

    const email = document.getElementById("auth-email")?.value.trim() || "";
    const password = document.getElementById("auth-password")?.value || "";
    const supabase = getSupabaseClient();

    if (isRestrictedPanel() && window.location.protocol === "file:") {
        applyBlockingAuthError("Painel restrito indisponível em file://. Use a URL HTTPS publicada no Vercel.");
        return;
    }

    if (!email || !password || !supabase) {
        return;
    }

    applyAuthState("authenticating", { lastError: "" });
    updateAuthUi();
    await postAuditEvent({
        action: "auth_sign_in_attempt",
        status: "info",
        emailHint: email,
        description: "Tentativa de login por email e senha.",
        origin: "web-auth",
        originContext: "login-form",
        network: state.currentNetwork,
        currentAsset: state.currentAsset,
        requestId: crypto.randomUUID()
    });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
        const safeMessage = normalizeAccessError(error?.message || "Não foi possível autenticar o operador.");
        applyAuthState("error", {
            lastError: safeMessage
        });
        updateAuthUi();
        await postAuditEvent({
            action: "auth_sign_in_failure",
            status: "error",
            emailHint: email,
            errorMessage: safeMessage,
            description: "Falha de autenticação por email e senha.",
            origin: "web-auth",
            originContext: "login-form",
            network: state.currentNetwork,
            currentAsset: state.currentAsset,
            requestId: crypto.randomUUID()
        });
        showToast("Falha ao autenticar operador.", "error");
        return;
    }

    await postAuditEvent({
        action: "auth_sign_in_success",
        status: "success",
        emailHint: email,
        description: "Login realizado com sucesso.",
        origin: "web-auth",
        originContext: "login-form",
        network: state.currentNetwork,
        currentAsset: state.currentAsset,
        requestId: crypto.randomUUID(),
        metadata: {
            userId: data.user?.id || null
        }
    }, data.session.access_token);
}

export async function signOutOperator() {
    const supabase = getSupabaseClient();
    const accessToken = state.auth.session?.access_token || "";
    await postAuditEvent({
        action: "auth_sign_out",
        status: "success",
        description: "Logout do operador.",
        origin: "web-auth",
        originContext: "logout-button",
        network: state.currentNetwork,
        currentAsset: state.currentAsset,
        requestId: crypto.randomUUID()
    }, accessToken);

    if (supabase) {
        await supabase.auth.signOut();
    }
}
