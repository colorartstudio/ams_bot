export const runtimeConfig = {
    geminiApiKey: window.AMS_RUNTIME_CONFIG?.GEMINI_API_KEY || "",
    supabaseUrl: window.AMS_RUNTIME_CONFIG?.SUPABASE_URL || "",
    supabasePublishableKey: window.AMS_RUNTIME_CONFIG?.SUPABASE_PUBLISHABLE_KEY || "",
    supabaseApiKey: window.AMS_RUNTIME_CONFIG?.SUPABASE_API_KEY || "",
    supabaseAnonKey: window.AMS_RUNTIME_CONFIG?.SUPABASE_ANON_KEY || ""
};

export async function loadRuntimeConfig() {
    return runtimeConfig;
}
