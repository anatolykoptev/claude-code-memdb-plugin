#!/usr/bin/env node
/**
 * Claude Code Hook: PreCompact — Compaction Flush
 *
 * Before Claude Code compacts context, sends transcript delta to MemDB
 * /product/add which handles extraction and preference memory server-side.
 *
 * Stdin: { session_id, transcript_path, hook_event_name }
 * Stdout: { continue: true }
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadConfig, getApiUrl, getUserId, getCubeId, getSecret } from "./lib/config.mjs";

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

// --- Offset marker (shared with Stop hook) ---

function getOffsetPath(sessionId) {
  return join(MARKER_DIR, sessionId.replace(/[^a-zA-Z0-9_-]/g, "_"));
}

function readOffset(sessionId) {
  try {
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

async function main() {
  const input = await readStdin();
  let event;
  try {
    event = JSON.parse(input);
  } catch {
    console.log(JSON.stringify({ continue: true }));
    return;
  }
  const transcriptPath = event.transcript_path;
  const sessionId = event.session_id;

  if (!transcriptPath) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  try {
    const raw = readFileSync(transcriptPath, "utf-8");
    const allLines = raw.trim().split("\n").filter(Boolean);
    const totalLines = allLines.length;
    const offset = sessionId ? readOffset(sessionId) : 0;
    const lines = offset > 0 ? allLines.slice(offset) : allLines;

    // Parse messages from unprocessed portion (last 50)
    const messages = [];
    for (const line of lines.slice(-50)) {
      try {
        const entry = JSON.parse(line);
        const role = entry.role || entry.type;
        const rawContent = entry.content ?? entry.message?.content;
        const text =
          typeof rawContent === "string"
            ? rawContent
            : Array.isArray(rawContent)
              ? rawContent.map((b) => b?.text || "").join("")
              : "";
        if ((role === "user" || role === "assistant") && text.length > 10) {
          messages.push({ role, content: text.slice(0, 2000) });
        }
      } catch { /* skip */ }
    }

    if (messages.length < 2) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    // Send to MemDB — server handles extraction, structuring, preference memory
    await fetch(`${MEMDB_API}/product/add`, {
      method: "POST",
      headers: makeHeaders(),
      body: JSON.stringify({
        user_id: USER_ID,
        writable_cube_ids: [CUBE_ID],
        messages: messages,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (sessionId) {
      writeOffset(sessionId, totalLines);
    }
  } catch {
    // Non-fatal: never block compaction
  }

  console.log(JSON.stringify({ continue: true }));
}

main();
