/**
 * Helpers for memdb-inject.mjs: memory extraction, project scoping,
 * session dedup, and recency formatting. Split out to keep the hook
 * orchestrator under the 200-line file limit.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

export function getMemoryText(m) {
  return m.memory || m.content || m.memory_content || "";
}

/**
 * Derive a project scope keyword from the current working directory.
 * E.g. /home/krolik/src/oxpulse-chat → "oxpulse-chat".
 * Returns null if no useful hint.
 */
export function getProjectScope() {
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (!cwd) return null;
  const parts = cwd.split("/").filter(Boolean);
  const rootIdx = parts.findIndex((p) =>
    ["src", "sites", "plugins", "tools", "deploy", "vendor"].includes(p),
  );
  if (rootIdx >= 0 && parts[rootIdx + 1]) return parts[rootIdx + 1].toLowerCase();
  const base = basename(cwd).toLowerCase();
  // Exclude home directories and usernames — they are not project names
  const ignoreBases = ["krolik", "home", "root", "ubuntu"];
  if (!base || ignoreBases.includes(base)) return null;
  // If CWD is a home directory (e.g. /Users/foo, /home/foo), it's not a project
  if (/^(\/Users\/[^/]+|\/home\/[^/]+|\/root)\/?$/.test(cwd)) return null;
  return base;
}

/**
 * Session dedup: track memory IDs already injected this session to avoid
 * re-injecting the same facts over and over during a long conversation.
 */
function seenPath(sessionId) {
  const safe = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, "_");
  return `/tmp/memdb-inject-seen-${safe}.txt`;
}

export function readSeen(sessionId) {
  try {
    const txt = readFileSync(seenPath(sessionId), "utf-8");
    return new Set(txt.split("\n").filter(Boolean));
  } catch {
    return new Set();
  }
}

export function writeSeen(sessionId, set) {
  try {
    writeFileSync(seenPath(sessionId), [...set].join("\n") + "\n");
  } catch { /* non-fatal */ }
}

/**
 * Format recency tag from metadata timestamps.
 */
export function formatRecency(m) {
  const meta = m.metadata || m;
  const ts = meta.updated_at || meta.created_at;
  if (!ts) return "";
  try {
    const date = new Date(ts);
    if (isNaN(date.getTime())) return "";
    const diffMs = Date.now() - date.getTime();
    const diffH = Math.floor(diffMs / 3600000);
    if (diffH < 1) return "[<1h ago]";
    if (diffH < 24) return `[${diffH}h ago]`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 14) return `[${diffD}d ago]`;
    const month = date.toLocaleString("en", { month: "short" });
    return `[${month} ${date.getDate()}]`;
  } catch {
    return "";
  }
}
