#!/usr/bin/env node
/**
 * memdb-cmd — backend of the /memory-* slash commands.
 *
 *   node memdb-cmd.mjs add|search|delete|update --file <path>
 *   node memdb-cmd.mjs info
 *
 * The user's text never travels on a command line: the slash command has Claude
 * save it to a file and passes only that path. The script reads the file, deletes
 * it, builds every request body with JSON.stringify and talks to MemDB over fetch,
 * so the text is data end to end and no shell ever parses it. Connection settings
 * come from the same config.env as the hooks (hooks/lib/config.mjs).
 *
 * Exit codes: 0 success, 1 MemDB unreachable or refused the request, 2 bad input.
 */
import { lstatSync, readFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfig, getApiUrl, getUserId, getCubeId, getSecret } from "../hooks/lib/config.mjs";

const MAX_INPUT_BYTES = 1024 * 1024;
const TIMEOUT_MS = 30_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USAGE = "usage: memdb-cmd.mjs add|search|delete|update --file <path>\n       memdb-cmd.mjs info";

class CmdError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.exitCode = code;
  }
}

/** Reads the input file, then removes it, whatever happens next. */
export function takeInput(path) {
  let st;
  try {
    st = lstatSync(path);
  } catch {
    throw new CmdError(`input file not found: ${path}`, 2);
  }
  // lstat does not follow links, so a symlink is not a regular file here
  if (!st.isFile()) throw new CmdError("input path is not a regular file", 2);
  if (st.size > MAX_INPUT_BYTES) {
    try { unlinkSync(path); } catch { /* best effort */ }
    throw new CmdError(`input is larger than ${MAX_INPUT_BYTES} bytes`, 2);
  }
  try {
    return readFileSync(path, "utf-8").trim();
  } finally {
    try { unlinkSync(path); } catch { /* already gone */ }
  }
}

async function call(method, path, body) {
  const headers = { "X-Internal-Service": getSecret() };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(getApiUrl().replace(/\/+$/, "") + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const why = err?.cause?.code || err?.name || "error";
    throw new CmdError(`cannot reach MemDB at ${getApiUrl()} (${why}); is it running?`);
  }
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  const ok = res.ok && json !== undefined && (json.code === undefined || json.code === 200);
  return { ok, status: res.status, text, json };
}

const failure = (what, r) =>
  new CmdError(`${what} failed (HTTP ${r.status}): ${(r.json?.message ?? r.text).toString().slice(0, 300)}`);

async function passthrough(what, r) {
  if (!r.ok) throw failure(what, r);
  process.stdout.write(r.text.endsWith("\n") ? r.text : r.text + "\n");
}

const requireText = (text, what) => {
  if (!text) throw new CmdError(`nothing to ${what}`, 2);
  return text;
};
const requireUuid = (id) => {
  if (!UUID.test(id)) throw new CmdError("memory id must be a UUID (8-4-4-4-12 hex)", 2);
  return id;
};

const addBody = (user, cube, content) => ({
  user_id: user,
  writable_cube_ids: [cube],
  mode: "fast",
  messages: [{ role: "user", content }],
});

async function add(text) {
  const content = requireText(text, "remember");
  await passthrough("add", await call("POST", "/product/add", addBody(getUserId(), getCubeId(), content)));
}

async function search(text) {
  const query = requireText(text, "search for");
  await passthrough("search", await call("POST", "/product/search", {
    query,
    user_id: getUserId(),
    readable_cube_ids: [getCubeId()],
    top_k: 10,
    relativity: 0.85,
  }));
}

async function del(text) {
  const id = requireUuid(text);
  await passthrough("delete", await call("POST", "/product/delete_memory", {
    user_id: getUserId(),
    memory_ids: [id],
  }));
}

/** Properties come back as an object, or as a JSON string when the server could not parse them. */
function propertiesOf(r) {
  let props = r.json?.data?.properties;
  if (typeof props === "string") {
    try { props = JSON.parse(props); } catch { props = undefined; }
  }
  return props && typeof props === "object" ? props : {};
}

const idsOf = (r) =>
  (Array.isArray(r.json?.data) ? r.json.data : [])
    .flatMap((m) => [m?.memory_id, m?.id])
    .filter((v) => typeof v === "string");

/**
 * Replaces a memory: look up its cube, add the new text there, and only then delete the old
 * one, so a failure at any step leaves the old memory in place.
 */
async function update(text) {
  const m = /^(\S+)\s+([\s\S]+)$/.exec(text);
  if (!m) throw new CmdError("need <memory_id> <new content>", 2);
  const id = requireUuid(m[1]);
  const content = m[2].trim();
  const user = getUserId();

  const got = await call("GET", `/product/get_memory/${encodeURIComponent(id)}`);
  if (!got.ok) throw failure(`looking up memory ${id}`, got);
  const props = propertiesOf(got);
  const cube = props.user_name ?? props.cube_id;
  if (typeof cube !== "string" || !cube || cube.length > 256) {
    throw new CmdError(`memory ${id} has no cube id in its properties; nothing changed`);
  }

  const added = await call("POST", "/product/add", addBody(user, cube, content));
  if (!added.ok) throw failure("adding the new content", added);
  const newIds = idsOf(added);
  if (!Array.isArray(added.json?.data) || added.json.data.length === 0) {
    throw new CmdError(`MemDB stored nothing for the new content; old memory ${id} kept`);
  }
  if (newIds.includes(id)) {
    throw new CmdError(`MemDB answered with the existing memory ${id} for the new content; nothing deleted`);
  }

  const deleted = await call("POST", "/product/delete_memory", {
    user_id: user,
    writable_cube_ids: [cube],
    memory_ids: [id],
  });
  if (!deleted.ok || !(deleted.json?.data?.deleted_count > 0)) {
    const why = deleted.ok ? "MemDB reported nothing deleted" : failure("deleting the old memory", deleted).message;
    throw new CmdError(
      `new memory added (${newIds.join(", ") || "see add response"}), but old memory ${id} was NOT deleted: ${why}. ` +
        `The old one is a duplicate now; remove it with /memory-delete ${id}.`,
    );
  }

  process.stdout.write(JSON.stringify({
    status: "updated",
    cube_id: cube,
    old_id: id,
    old_memory: props.memory ?? null,
    new_ids: newIds,
    added: added.json.data,
    deleted: deleted.json.data,
  }) + "\n");
}

async function info() {
  const user = getUserId();
  const cube = getCubeId();
  const u = encodeURIComponent(user);
  const sections = [
    ["Health", () => call("GET", "/health")],
    ["User Info", () => call("GET", `/product/users/${u}`)],
    ["User Config", () => call("GET", `/product/users/${u}/config`)],
    ["Memories", () => call("POST", "/product/get_memory", {
      readable_cube_ids: [cube], user_id: user, page: 0, page_size: 1,
    })],
  ];
  let failed = 0;
  console.log(`person_id: ${user}\ncube_id: ${cube}`);
  for (const [title, run] of sections) {
    console.log(`\n=== ${title} ===`);
    try {
      const r = await run();
      if (!r.ok) failed++;
      console.log(r.ok ? r.text : failure(title, r).message);
    } catch (err) {
      failed++;
      console.log(err.message);
    }
  }
  if (failed) process.exitCode = 1;
}

const TEXT_COMMANDS = { add, search, delete: del, update };

export async function main(argv) {
  const [sub, ...rest] = argv;
  if (sub === "info" && rest.length === 0) {
    loadConfig();
    return info();
  }
  const run = Object.hasOwn(TEXT_COMMANDS, sub) ? TEXT_COMMANDS[sub] : undefined;
  if (!run || rest.length !== 2 || rest[0] !== "--file" || !rest[1]) throw new CmdError(USAGE, 2);
  const text = takeInput(rest[1]);
  loadConfig();
  return run(text);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`memdb-cmd: ${err instanceof CmdError ? err.message : err}`);
    process.exitCode = err instanceof CmdError ? err.exitCode : 1;
  });
}
