import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();
const ENV_ALIASES = {
    development: "dev",
    preview: "test",
    production: "prod"
};

function parseEnvFile(text) {
    return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .reduce((accumulator, line) => {
            const separatorIndex = line.indexOf("=");
            if (separatorIndex === -1) {
                return accumulator;
            }

            const key = line.slice(0, separatorIndex).trim();
            const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
            accumulator[key] = value;
            return accumulator;
        }, {});
}

function loadEnvFromFile(filePath) {
    if (!existsSync(filePath)) {
        return {};
    }

    return parseEnvFile(readFileSync(filePath, "utf8"));
}

function normalizeTargetEnv(inputEnv) {
    const requested = (inputEnv || "").toLowerCase().trim();
    if (!requested || requested === "auto") {
        return ENV_ALIASES[(process.env.APP_ENV || process.env.VERCEL_ENV || "dev").toLowerCase()] || (process.env.APP_ENV || process.env.VERCEL_ENV || "dev").toLowerCase();
    }

    return ENV_ALIASES[requested] || requested;
}

function resolveEnvLayers(targetEnv) {
    const filenames = [
        ".env.runtime",
        ".env.runtime.local",
        `.env.runtime.${targetEnv}`,
        `.env.runtime.${targetEnv}.local`,
    ];

    return filenames.reduce((accumulator, filename) => {
        const filePath = path.join(ROOT_DIR, filename);
        return {
            ...accumulator,
            ...loadEnvFromFile(filePath)
        };
    }, {});
}

function getValue(name, fileValues, fallback = "") {
    return process.env[name] || fileValues[name] || fallback;
}

function getPublicSupabaseValue(publicName, legacyName, fileValues, fallback = "") {
    return process.env[publicName]
        || fileValues[publicName]
        || process.env[legacyName]
        || fileValues[legacyName]
        || fallback;
}

function getDefaultPanelUrl(targetEnv) {
    if (process.env.PUBLIC_PANEL_URL) {
        return process.env.PUBLIC_PANEL_URL;
    }

    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
    }

    if (targetEnv === "dev") {
        return "http://localhost:8080";
    }

    return "";
}

function toRuntimeConfig(targetEnv, fileValues) {
    const runtimeConfig = {
        APP_ENV: getValue("PUBLIC_APP_ENV", fileValues, getValue("APP_ENV", fileValues, targetEnv)),
        PANEL_ACCESS_MODE: getValue("PUBLIC_PANEL_ACCESS_MODE", fileValues, "restricted"),
        PANEL_URL: getValue("PUBLIC_PANEL_URL", fileValues, getDefaultPanelUrl(targetEnv)),
        SUPABASE_URL: getPublicSupabaseValue("PUBLIC_SUPABASE_URL", "SUPABASE_URL", fileValues),
        SUPABASE_ANON_KEY: getPublicSupabaseValue("PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY", fileValues)
    };

    const missingKeys = Object.entries(runtimeConfig)
        .filter(([, value]) => !String(value || "").trim())
        .map(([key]) => key);

    if (missingKeys.length > 0) {
        throw new Error(`Variáveis públicas ausentes para runtime: ${missingKeys.join(", ")}`);
    }

    return runtimeConfig;
}

function renderRuntimeConfig(runtimeConfig) {
    return [
        "// Arquivo gerado automaticamente por scripts/generate-runtime-config.mjs",
        "// Não edite manualmente; altere as variáveis públicas do ambiente.",
        "window.AMS_RUNTIME_CONFIG = {",
        ...Object.entries(runtimeConfig).map(([key, value]) => `    ${key}: ${JSON.stringify(value)},`),
        "};",
        ""
    ].join("\n");
}

function main() {
    const requestedEnv = process.argv[2] || "auto";
    const targetEnv = normalizeTargetEnv(requestedEnv);
    const fileValues = resolveEnvLayers(targetEnv);
    const runtimeConfig = toRuntimeConfig(targetEnv, fileValues);
    const outputPath = path.join(ROOT_DIR, "runtime-config.js");

    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, renderRuntimeConfig(runtimeConfig), "utf8");

    process.stdout.write(`runtime-config.js gerado para o ambiente "${targetEnv}".\n`);
}

main();
