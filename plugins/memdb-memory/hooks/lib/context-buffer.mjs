/**
 * Rolling context buffer for session-aware memory search.
 *
 * Maintains a JSONL file per session at /tmp/memdb-ctx-<session_id>.jsonl
 * with recent user and assistant messages. The inject hook reads this
 * buffer to build context-aware search queries, while the stop hook
 * appends assistant responses to it.
 */
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { redactSensitive } from "./redact.mjs";

const MAX_ENTRIES = 10;

function bufferPath(sessionId) {
  return `/tmp/memdb-ctx-${sessionId.replace(/[^a-zA-Z0-9_-]/g, "_")}.jsonl`;
}

export function readBuffer(sessionId, n = 4) {
  try {
    const lines = readFileSync(bufferPath(sessionId), "utf-8")
      .trim().split("\n").filter(Boolean);
    return lines.slice(-n).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

export function appendBuffer(sessionId, role, content) {
  const path = bufferPath(sessionId);
  const line = JSON.stringify({ role, content: redactSensitive(content.slice(0, 300)) }) + "\n";
  try {
    appendFileSync(path, line);
    // Trim to MAX_ENTRIES
    const lines = readFileSync(path, "utf-8").trim().split("\n").filter(Boolean);
    if (lines.length > MAX_ENTRIES) {
      writeFileSync(path, lines.slice(-MAX_ENTRIES).join("\n") + "\n");
    }
  } catch { /* non-fatal */ }
}

/**
 * Build a context-aware search query.
 * Short/ambiguous prompts get augmented with recent conversation context.
 * Self-contained prompts pass through unchanged.
 */
export function buildContextQuery(prompt, buffer) {
  if (prompt.length > 60 && !needsContext(prompt)) {
    return prompt.slice(0, 500);
  }
  const recent = buffer.slice(-3);
  if (recent.length === 0) {
    return prompt.slice(0, 500);
  }
  const contextParts = recent.map((m) => {
    const prefix = m.role === "user" ? "User" : "Assistant";
    return `${prefix}: ${m.content.slice(0, 120)}`;
  });
  const query = `${prompt}\n\nRecent context:\n${contextParts.join("\n")}`;
  return query.slice(0, 500);
}

function needsContext(prompt) {
  const lower = prompt.toLowerCase();
  // Short prompts always need context
  if (prompt.length < 30) return true;
  // Continuation patterns (EN)
  if (/^(what|how|why|where|when|which|and|but|also|then|so)\s/i.test(prompt)) return true;
  // Continuation patterns (RU)
  if (/^(а |и |но |ещё|еще|тоже|потом|так |ну |давай|покажи|сделай|что |как |где |когда |зачем |почему )/i.test(prompt)) return true;
  // Deictic pronouns
  if (/\b(this|that|these|those|it|they|them)\b/i.test(lower)) return true;
  if (/\b(это|эт[иоу]|тот|те |них|нем|ней|его|её|их)\b/i.test(lower)) return true;
  return false;
}
