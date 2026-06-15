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
        await fetch(`${runtimeConfig.supabaseUrl}/functions/v1/audit-client-event`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
        });
    } catch {}
}

async function loadOperatorContext() {
    const supabase = getSupabaseClient();
    if (!supabase) {
        throw new Error("Supabase não configurado para autenticação.");
    }

    const { data, error } = await supabase.functions.invoke("read-operator-context", {
        body: {
            network: state.currentNetwork,
            currentAsset: state.currentAsset,
            origin: "web-auth",
            originContext: "session-bootstrap",
            requestId: crypto.randomUUID()
        }
    });

    if (error) {
        throw error;
    }

    state.auth.profile = data?.profile || null;
    applyOperatorAccounts(data?.accounts || []);
}

async function handleAuthenticatedSession(session) {
    state.auth.session = session;
    state.auth.user = session?.user || null;
    applyAuthState("authenticated", {
        session,
        user: session?.user || null,
        lastError: ""
    });
    await loadOperatorContext();
    updateAuthUi();
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
        applyAuthState("error", {
            lastError: "Configuração pública do Supabase ausente no runtime."
        });
        updateAuthUi();
        return;
    }

    const { data } = await supabase.auth.getSession();
    if (data.session) {
        await handleAuthenticatedSession(data.session);
    } else {
        await handleSignedOutState();
    }

    supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === "SIGNED_OUT" || !session) {
            await handleSignedOutState();
            return;
        }

        await handleAuthenticatedSession(session);
    });
}

export async function signInOperator(event) {
    event.preventDefault();

    const email = document.getElementById("auth-email")?.value.trim() || "";
    const password = document.getElementById("auth-password")?.value || "";
    const supabase = getSupabaseClient();

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
        applyAuthState("error", {
            lastError: error?.message || "Não foi possível autenticar o operador."
        });
        updateAuthUi();
        await postAuditEvent({
            action: "auth_sign_in_failure",
            status: "error",
            emailHint: email,
            errorMessage: error?.message || "Falha desconhecida.",
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
    showToast("Operador autenticado com sucesso.", "success");
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
