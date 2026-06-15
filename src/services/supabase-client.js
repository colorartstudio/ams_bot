import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runtimeConfig } from "../config/runtime.js";

let supabaseClient = null;

export function getSupabaseClient() {
    if (supabaseClient) {
        return supabaseClient;
    }

    if (!runtimeConfig.supabaseUrl || !runtimeConfig.supabaseAnonKey) {
        return null;
    }

    supabaseClient = createClient(
        runtimeConfig.supabaseUrl,
        runtimeConfig.supabaseAnonKey,
        {
            auth: {
                persistSession: true,
                autoRefreshToken: true
            }
        }
    );

    return supabaseClient;
}
