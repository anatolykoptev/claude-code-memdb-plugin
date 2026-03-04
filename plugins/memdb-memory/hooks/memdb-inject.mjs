#!/usr/bin/env node
/**
 * Claude Code Hook: UserPromptSubmit — Context Injection
 *
 * Searches MemDB for relevant memories and injects them as additionalContext.
 * Uses HTTP REST API via Go gateway (:8080) for native search performance.
 *
 * Stdin: { prompt, session_id, hook_event_name }
 * Stdout: { hookSpecificOutput: { hookEventName, additionalContext } }
 */
import { loadConfig, getApiUrl, getUserId, getCubeId, getSecret } from "./lib/config.mjs";
import { readBuffer, appendBuffer, buildContextQuery } from "./lib/context-buffer.mjs";

loadConfig();

const MEMDB_API = getApiUrl();
const USER_ID = getUserId();
const CUBE_ID = getCubeId();
const SECRET = getSecret();
const FETCH_K = 5;
const INJECT_K = 5;
const MAX_CHARS = 500;

// Skip patterns: casual prompts not worth searching
const SKIP_RE = /^(hi|hello|hey|ok|yes|no|thanks|спасибо|привет|ок|да|нет|ладно|понял|хорошо|перезагрузил|перезагрузи|готово|сделал|сделано|проверь|проверил|жди|подожди|продолжай|продолжи|дальше|всё|стоп|отлично|класс|круто|погнали|делай|запусти|покажи|давай|закоммить|запушь|пушни|применяй|обнови|удали|открой|закрой|\/\w+)\s*[.!?]*$/i;

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

function getMemoryText(m) {
  return m.memory || m.content || m.memory_content || "";
}

/**
 * Format recency tag from metadata timestamps.
 */
function formatRecency(m) {
  const meta = m.metadata || m;
  const ts = meta.updated_at || meta.created_at;
  if (!ts) return "";
  try {
    const date = new Date(ts);
    if (isNaN(date.getTime())) return "";
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffH = Math.floor(diffMs / 3600000);
    if (diffH < 1) return "[<1h ago]";
    if (diffH < 24) return `[${diffH}h ago]`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 14) return `[${diffD}d ago]`;
    const month = date.toLocaleString("en", { month: "short" });
    return `[${month} ${date.getDate()}]`;
  } catch { return ""; }
}

async function main() {
  const input = await readStdin();
  let event;
  try {
    event = JSON.parse(input);
  } catch {
    process.exit(0);
  }
  const prompt = event.prompt || "";
  const sessionId = event.session_id || "default";

  // Skip short or casual prompts
  if (prompt.length < 20 || SKIP_RE.test(prompt.trim())) {
    process.exit(0);
  }

  // Write current prompt to context buffer for future queries
  appendBuffer(sessionId, "user", prompt);

  try {
    // Build context-aware search query from recent conversation
    const buffer = readBuffer(sessionId, 4);
    const searchQuery = buildContextQuery(prompt, buffer);

    const res = await fetch(`${MEMDB_API}/product/search`, {
      method: "POST",
      headers: makeHeaders(),
      body: JSON.stringify({
        query: searchQuery,
        user_id: USER_ID,
        readable_cube_ids: [CUBE_ID],
        top_k: FETCH_K,
        dedup: "mmr",
        relativity: 0.93,
        num_stages: 2,
        include_skill_memory: false,
        include_preference: false,
        internet_search: false,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) process.exit(0);

    const data = await res.json();

    const rawCubes = data?.data?.text_mem || data?.text_mem || [];
    let memories = rawCubes.flatMap((cube) => cube.memories || []);

    // Post-search quality filter: drop borderline memories
    memories = memories.filter((m) => {
      const rel = m.metadata?.relativity;
      return rel == null || rel >= 0.88;
    });

    if (!memories.length) process.exit(0);

    // Format and inject
    const items = memories.slice(0, INJECT_K);
    const BUDGET = 3000;
    const perItem = Math.min(MAX_CHARS, Math.floor(BUDGET / Math.max(items.length, 1)));
    const textLines = items.map((m) => {
      const text = getMemoryText(m);
      const recency = formatRecency(m);
      const truncated = text.length > perItem ? text.slice(0, perItem) + "..." : text;
      return `- ${recency ? recency + " " : ""}${truncated}`;
    }).filter((l) => l.length > 4);

    if (!textLines.length) process.exit(0);

    const context = `<user_memory_context>\nRelevant memories from MemDB:\n${textLines.join("\n")}\n</user_memory_context>`;

    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: context,
      },
    }));
  } catch {
    // Non-fatal: silently exit on any error
    process.exit(0);
  }
}

main();
