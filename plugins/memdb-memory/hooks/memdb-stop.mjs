#!/usr/bin/env node
/**
 * Claude Code Hook: Stop — Memory Save
 *
 * After each meaningful turn, sends transcript delta to MemDB /product/add
 * which handles extraction, structuring, and storage server-side.
 *
 * Stdin: { session_id, transcript_path, stop_hook_active, hook_event_name }
 * Stdout: { continue: true }
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadConfig, getApiUrl, getUserId, getCubeId, getSecret } from "./lib/config.mjs";
import { appendBuffer } from "./lib/context-buffer.mjs";

loadConfig();

const MEMDB_API = getApiUrl();
const USER_ID = getUserId();
const CUBE_ID = getCubeId();
const SECRET = getSecret();
const MARKER_DIR = join(homedir(), ".claude", "memdb-offsets");

function makeHeaders() {
  const h = { "Content-Type": "application/json" };
  if (SECRET) h["X-Internal-Service"] = SECRET;
  return h;
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
  });
}

// --- Offset marker ---

function getOffsetPath(sessionId) {
  return join(MARKER_DIR, sessionId.replace(/[^a-zA-Z0-9_-]/g, "_"));
}

function readOffset(sessionId) {
  try {
    // Check new dir first, then legacy
    const newPath = getOffsetPath(sessionId);
    const legacyPath = join(homedir(), ".claude", "memos-offsets", sessionId.replace(/[^a-zA-Z0-9_-]/g, "_"));
    if (existsSync(newPath)) {
      return parseInt(readFileSync(newPath, "utf-8").trim(), 10) || 0;
    }
    if (existsSync(legacyPath)) {
      return parseInt(readFileSync(legacyPath, "utf-8").trim(), 10) || 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

function writeOffset(sessionId, lineNumber) {
  try {
    mkdirSync(MARKER_DIR, { recursive: true });
    writeFileSync(getOffsetPath(sessionId), String(lineNumber), "utf-8");
  } catch { /* non-fatal */ }
}

// --- Transcript parsing ---

function parseTranscriptDelta(transcriptPath, fromLine) {
  const raw = readFileSync(transcriptPath, "utf-8");
  const allLines = raw.split("\n").filter(Boolean);
  const totalLines = allLines.length;
  const lines = allLines.slice(fromLine);

  const messages = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const role = entry.role || entry.type;
      const rawContent = entry.content ?? entry.message?.content;
      const text =
        typeof rawContent === "string"
          ? rawContent
          : Array.isArray(rawContent)
            ? rawContent.map((b) => {
                if (b?.type === "tool_use") return `[tool: ${b.name}]`;
                if (b?.type === "tool_result") return "";
                return b?.text || "";
              }).filter(Boolean).join(" ")
            : "";

      if ((role === "user" || role === "assistant") && text.length > 10) {
        messages.push({ role, content: text.slice(0, 2000) });
      }
    } catch { /* skip malformed */ }
  }

  return { messages, totalLines };
}

// --- Heuristic gate ---

const SIGNAL_EN = /\b(decided|decision|chose|switched|migrated|replaced|deployed|fixed|implemented|completed|created|built|added|removed|prefer|always use|config|architecture|design|refactor|bug|error|crash|workaround|gotcha|caveat|important)\b/i;
const SIGNAL_RU = /(?:решил|выбрал|переключил|заменил|задеплоил|исправил|реализовал|завершил|создал|добавил|удалил|предпочита|конфиг|архитектур|ошибк|баг|важно)/i;

function shouldSave(messages) {
  if (messages.length < 3) return false;
  const totalChars = messages.reduce((s, m) => s + m.content.length, 0);
  if (totalChars < 200) return false;
  if (!messages.some((m) => m.role === "user")) return false;
  const allText = messages.map((m) => m.content).join(" ");
  return SIGNAL_EN.test(allText) || SIGNAL_RU.test(allText);
}

// --- Main ---

async function main() {
  const input = await readStdin();
  let event;
  try {
    event = JSON.parse(input);
  } catch {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  if (event.stop_hook_active) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  const sessionId = event.session_id;
  const transcriptPath = event.transcript_path;
  const lastMessage = event.last_assistant_message;

  // Write assistant response to context buffer for inject hook's context-aware search
  if (sessionId && lastMessage && lastMessage.length > 10) {
    appendBuffer(sessionId, "assistant", lastMessage);
  }

  if (!sessionId || !transcriptPath || !existsSync(transcriptPath)) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  try {
    const fromLine = readOffset(sessionId);
    const { messages, totalLines } = parseTranscriptDelta(transcriptPath, fromLine);

    if (messages.length === 0 || !shouldSave(messages)) {
      writeOffset(sessionId, totalLines);
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    // Send to MemDB — server handles extraction, structuring, preference memory
    fetch(`${MEMDB_API}/product/add`, {
      method: "POST",
      headers: makeHeaders(),
      body: JSON.stringify({
        user_id: USER_ID,
        writable_cube_ids: [CUBE_ID],
        messages: messages.slice(-30),
      }),
      signal: AbortSignal.timeout(30000),
    }).catch(() => {}); // fire-and-forget

    writeOffset(sessionId, totalLines);
  } catch {
    // Non-fatal: never block the session
  }

  console.log(JSON.stringify({ continue: true }));
}

main();
