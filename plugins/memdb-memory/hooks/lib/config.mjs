/**
 * Shared config loader for memdb-memory plugin.
 *
 * Reads ~/.config/claude-code-memdb/config.env (KEY=VALUE lines),
 * falls back to legacy ~/.config/claude-code-memos/config.env,
 * sets process.env only if not already set (env vars take precedence).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_PATH = join(homedir(), ".config", "claude-code-memdb", "config.env");
const LEGACY_CONFIG_PATH = join(homedir(), ".config", "claude-code-memos", "config.env");

export function loadConfig() {
  const path = existsSync(CONFIG_PATH) ? CONFIG_PATH : LEGACY_CONFIG_PATH;
  try {
    const text = readFileSync(path, "utf-8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // Config file missing — env vars or defaults will be used
  }
}

export function getApiUrl() {
  return process.env.MEMDB_API_URL || process.env.MEMOS_API_URL || "http://127.0.0.1:8080";
}

export function getUserId() {
  // Phase 2: MEMDB_PERSON_ID is the person identity; fall back to legacy MEMDB_USER_ID for old setups
  return process.env.MEMDB_PERSON_ID || process.env.MEMDB_USER_ID || process.env.MEMOS_USER_ID || "krolik";
}

export function getCubeId() {
  return process.env.MEMDB_CUBE_ID || process.env.MEMOS_CUBE_ID || "memos";
}

export function getSecret() {
  return process.env.INTERNAL_SERVICE_SECRET || "";
}
