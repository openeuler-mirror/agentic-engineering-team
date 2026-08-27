#!/usr/bin/env node

// prepare.ts
import { access, copyFile, mkdir as mkdir2, readdir, stat as stat3, writeFile as writeFile2, realpath as realpath2, readFile as readFile2, rm as rm2, lstat } from "node:fs/promises";
import { join as join3, basename as basename2, resolve as resolve2 } from "node:path";
import { createHash as createHash2 } from "node:crypto";

// node_modules/env-paths/index.js
import path from "node:path";
import os from "node:os";
import process2 from "node:process";

// node_modules/is-safe-filename/index.js
var unsafeFilenameFixtures = Object.freeze([
  "",
  "   ",
  ".",
  "..",
  " .",
  ". ",
  " ..",
  ".. ",
  "../",
  "../foo",
  "foo/../bar",
  "foo/bar",
  "foo\\bar",
  "foo\0bar"
]);
function isSafeFilename(filename) {
  if (typeof filename !== "string") {
    return false;
  }
  const trimmed = filename.trim();
  return trimmed !== "" && trimmed !== "." && trimmed !== ".." && !filename.includes("/") && !filename.includes("\\") && !filename.includes("\0");
}
function assertSafeFilename(filename) {
  if (typeof filename !== "string") {
    throw new TypeError("Expected a string");
  }
  if (!isSafeFilename(filename)) {
    throw new Error(`Unsafe filename: ${JSON.stringify(filename)}`);
  }
}

// node_modules/env-paths/index.js
var homedir = os.homedir();
var tmpdir = os.tmpdir();
var { env } = process2;
var macos = (name) => {
  const library = path.join(homedir, "Library");
  return {
    data: path.join(library, "Application Support", name),
    config: path.join(library, "Preferences", name),
    cache: path.join(library, "Caches", name),
    log: path.join(library, "Logs", name),
    temp: path.join(tmpdir, name)
  };
};
var windows = (name) => {
  const appData = env.APPDATA || path.join(homedir, "AppData", "Roaming");
  const localAppData = env.LOCALAPPDATA || path.join(homedir, "AppData", "Local");
  return {
    // Data/config/cache/log are invented by me as Windows isn't opinionated about this
    data: path.join(localAppData, name, "Data"),
    config: path.join(appData, name, "Config"),
    cache: path.join(localAppData, name, "Cache"),
    log: path.join(localAppData, name, "Log"),
    temp: path.join(tmpdir, name)
  };
};
var linux = (name) => {
  const username = path.basename(homedir);
  return {
    data: path.join(env.XDG_DATA_HOME || path.join(homedir, ".local", "share"), name),
    config: path.join(env.XDG_CONFIG_HOME || path.join(homedir, ".config"), name),
    cache: path.join(env.XDG_CACHE_HOME || path.join(homedir, ".cache"), name),
    // https://wiki.debian.org/XDGBaseDirectorySpecification#state
    log: path.join(env.XDG_STATE_HOME || path.join(homedir, ".local", "state"), name),
    temp: path.join(tmpdir, username, name)
  };
};
function envPaths(name, { suffix = "nodejs" } = {}) {
  assertSafeFilename(name);
  if (suffix) {
    name += `-${suffix}`;
  }
  assertSafeFilename(name);
  if (process2.platform === "darwin") {
    return macos(name);
  }
  if (process2.platform === "win32") {
    return windows(name);
  }
  return linux(name);
}

// utils.ts
import { join, basename, resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
var SESSIONS_DIR = envPaths("interactive-revision").data;
function sessionDirFor(hash) {
  return join(SESSIONS_DIR, hash);
}
var LOG_FILE_NAME = "interactive-revision.log";
function stripBom(s) {
  return s.charCodeAt(0) === 65279 ? s.slice(1) : s;
}
function normalizeNewlines(s) {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
async function readTextCanonical(p) {
  const raw = await readFile(p, "utf-8");
  return normalizeNewlines(stripBom(raw));
}
async function canonicalizePath(p) {
  try {
    return await realpath(p);
  } catch {
    return resolve(p);
  }
}
async function generateSessionHash(paths) {
  const canon = await Promise.all(paths.map(canonicalizePath));
  const normalized = canon.sort().join("\n");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 12);
}
function snapshotFileName(fileName) {
  return `${randomUUID()}-${createHash("sha256").update(basename(fileName)).digest("hex").slice(0, 10)}.snap`;
}

// lock.ts
import { mkdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join as join2 } from "node:path";
var LOCK_STALE_MS = 30 * 60 * 1e3;
var HEARTBEAT_MS = 10 * 1e3;
var POLL_MS = 500;
var MAX_WAIT_MS = 30 * 1e3;
var lockPathDir = (sessionDir) => join2(sessionDir, ".lock");
var dataPath = (sessionDir) => join2(sessionDir, ".lock", "owner.json");
async function acquireNow(sessionDir) {
  try {
    await mkdir(lockPathDir(sessionDir), { recursive: false });
    await writeFile(
      dataPath(sessionDir),
      JSON.stringify({ pid: process.pid, time: Date.now(), host: "aet" })
    );
    return true;
  } catch {
    return false;
  }
}
async function isStale(sessionDir) {
  try {
    const s = await stat(lockPathDir(sessionDir));
    return Date.now() - s.mtimeMs > LOCK_STALE_MS;
  } catch {
    return true;
  }
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function acquireLock(sessionDir) {
  if (await acquireNow(sessionDir)) return true;
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    await sleep(POLL_MS);
    if (!await isStale(sessionDir)) continue;
    try {
      await rm(lockPathDir(sessionDir), { recursive: true, force: true });
    } catch {
    }
    if (await acquireNow(sessionDir)) return true;
  }
  return false;
}
async function releaseLock(sessionDir) {
  try {
    await rm(lockPathDir(sessionDir), { recursive: true, force: true });
  } catch {
  }
}
async function updateLock(sessionDir) {
  try {
    const now = /* @__PURE__ */ new Date();
    await utimes(lockPathDir(sessionDir), now, now);
  } catch {
  }
}
function startHeartbeat(sessionDir) {
  const t = setInterval(() => {
    void updateLock(sessionDir);
  }, HEARTBEAT_MS);
  t.unref?.();
  return () => clearInterval(t);
}

// node_modules/isbinaryfile/lib/index.js
import { open, stat as stat2 } from "node:fs/promises";

// node_modules/isbinaryfile/lib/encoding.js
var MAX_BYTES = 512;
function detectUtf16NoBom(fileBuffer, bytesRead) {
  if (bytesRead < 4)
    return null;
  const scanLength = Math.min(bytesRead, MAX_BYTES);
  let nullsAtEven = 0;
  let nullsAtOdd = 0;
  for (let i = 0; i < scanLength; i++) {
    if (fileBuffer[i] === 0) {
      if (i % 2 === 0)
        nullsAtEven++;
      else
        nullsAtOdd++;
    }
  }
  const totalNulls = nullsAtEven + nullsAtOdd;
  if (totalNulls > scanLength * 0.3 && totalNulls < scanLength * 0.7) {
    if (nullsAtOdd > nullsAtEven * 3)
      return "utf-16le";
    if (nullsAtEven > nullsAtOdd * 3)
      return "utf-16be";
  }
  return null;
}
function isTextWithEncodingHint(fileBuffer, bytesRead, encoding) {
  const scanLength = Math.min(bytesRead, MAX_BYTES);
  if (encoding === "utf-16" || encoding === "utf-16le" || encoding === "utf-16be") {
    for (let i = 0; i < scanLength; i += 2) {
      const byte1 = fileBuffer[i];
      const byte2 = i + 1 < scanLength ? fileBuffer[i + 1] : 0;
      if (encoding === "utf-16le" || encoding === "utf-16") {
        if (byte2 === 0 && byte1 < 32 && byte1 !== 9 && byte1 !== 10 && byte1 !== 13 && byte1 !== 0) {
          return false;
        }
      }
      if (encoding === "utf-16be" || encoding === "utf-16") {
        if (byte1 === 0 && byte2 < 32 && byte2 !== 9 && byte2 !== 10 && byte2 !== 13 && byte2 !== 0) {
          return false;
        }
      }
    }
    return true;
  }
  if (encoding === "latin1" || encoding === "iso-8859-1") {
    for (let i = 0; i < scanLength; i++) {
      const byte = fileBuffer[i];
      if (byte === 0)
        return false;
      if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
        return false;
      }
    }
    return true;
  }
  if (encoding === "cjk" || encoding === "big5" || encoding === "gb2312" || encoding === "gbk" || encoding === "euc-kr" || encoding === "shift-jis") {
    for (let i = 0; i < scanLength; i++) {
      const byte = fileBuffer[i];
      if (byte === 0)
        return false;
      if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
        return false;
      }
    }
    return true;
  }
  return false;
}

// node_modules/isbinaryfile/lib/index.js
var MAX_BYTES2 = 512;
var UTF8_BOUNDARY_RESERVE = 3;
var Reader = class {
  fileBuffer;
  size;
  offset;
  error;
  constructor(fileBuffer, size) {
    this.fileBuffer = fileBuffer;
    this.size = size;
    this.offset = 0;
    this.error = false;
  }
  hasError() {
    return this.error;
  }
  nextByte() {
    if (this.offset === this.size || this.hasError()) {
      this.error = true;
      return 255;
    }
    return this.fileBuffer[this.offset++];
  }
  next(len) {
    if (len < 0 || len > this.size - this.offset) {
      this.error = true;
      return [];
    }
    const n = new Array();
    for (let i = 0; i < len; i++) {
      if (this.error) {
        return n;
      }
      n[i] = this.nextByte();
    }
    return n;
  }
};
function readProtoVarInt(reader) {
  let idx = 0;
  let varInt = 0;
  while (!reader.hasError()) {
    const b = reader.nextByte();
    varInt = varInt | (b & 127) << 7 * idx;
    if ((b & 128) === 0) {
      break;
    }
    if (idx >= 10) {
      reader.error = true;
      break;
    }
    idx++;
  }
  return varInt;
}
function readProtoMessage(reader) {
  const varInt = readProtoVarInt(reader);
  const wireType = varInt & 7;
  switch (wireType) {
    case 0:
      readProtoVarInt(reader);
      return true;
    case 1:
      reader.next(8);
      return true;
    case 2:
      const len = readProtoVarInt(reader);
      reader.next(len);
      return true;
    case 5:
      reader.next(4);
      return true;
  }
  return false;
}
function isBinaryProto(fileBuffer, totalBytes) {
  const reader = new Reader(fileBuffer, totalBytes);
  let numMessages = 0;
  while (true) {
    if (!readProtoMessage(reader) && !reader.hasError()) {
      return false;
    }
    if (reader.hasError()) {
      break;
    }
    numMessages++;
  }
  return numMessages > 0;
}
async function isBinaryFile(file, options) {
  if (isString(file)) {
    const fileStat = await stat2(file);
    isStatFile(fileStat);
    const fileHandle = await open(file, "r");
    try {
      const allocBuffer = Buffer.alloc(MAX_BYTES2 + UTF8_BOUNDARY_RESERVE);
      const { bytesRead } = await fileHandle.read(allocBuffer, 0, MAX_BYTES2 + UTF8_BOUNDARY_RESERVE, 0);
      return isBinaryCheck(allocBuffer, bytesRead, options);
    } finally {
      await fileHandle.close();
    }
  } else {
    const size = options?.size !== void 0 ? options.size : file.length;
    return isBinaryCheck(file, size, options);
  }
}
function isBinaryCheck(fileBuffer, bytesRead, options) {
  if (bytesRead === 0) {
    return false;
  }
  let suspiciousBytes = 0;
  const totalBytes = Math.min(bytesRead, MAX_BYTES2 + UTF8_BOUNDARY_RESERVE);
  const scanBytes = Math.min(totalBytes, MAX_BYTES2);
  if (bytesRead >= 3 && fileBuffer[0] === 239 && fileBuffer[1] === 187 && fileBuffer[2] === 191) {
    return false;
  }
  if (bytesRead >= 4 && fileBuffer[0] === 0 && fileBuffer[1] === 0 && fileBuffer[2] === 254 && fileBuffer[3] === 255) {
    return false;
  }
  if (bytesRead >= 4 && fileBuffer[0] === 255 && fileBuffer[1] === 254 && fileBuffer[2] === 0 && fileBuffer[3] === 0) {
    return false;
  }
  if (bytesRead >= 4 && fileBuffer[0] === 132 && fileBuffer[1] === 49 && fileBuffer[2] === 149 && fileBuffer[3] === 51) {
    return false;
  }
  if (totalBytes >= 5 && fileBuffer.slice(0, 5).toString() === "%PDF-") {
    return true;
  }
  if (bytesRead >= 2 && fileBuffer[0] === 254 && fileBuffer[1] === 255) {
    return false;
  }
  if (bytesRead >= 2 && fileBuffer[0] === 255 && fileBuffer[1] === 254) {
    return false;
  }
  if (options?.encoding) {
    return !isTextWithEncodingHint(fileBuffer, bytesRead, options.encoding);
  }
  const utf16Detected = detectUtf16NoBom(fileBuffer, bytesRead);
  if (utf16Detected) {
    return !isTextWithEncodingHint(fileBuffer, bytesRead, utf16Detected);
  }
  for (let i = 0; i < scanBytes; i++) {
    if (fileBuffer[i] === 0) {
      return true;
    } else if ((fileBuffer[i] < 7 || fileBuffer[i] > 14) && (fileBuffer[i] < 32 || fileBuffer[i] > 127)) {
      if (fileBuffer[i] >= 192 && fileBuffer[i] <= 223 && i + 1 < totalBytes) {
        i++;
        if (fileBuffer[i] >= 128 && fileBuffer[i] <= 191) {
          continue;
        }
      } else if (fileBuffer[i] >= 224 && fileBuffer[i] <= 239 && i + 2 < totalBytes) {
        i++;
        if (fileBuffer[i] >= 128 && fileBuffer[i] <= 191 && fileBuffer[i + 1] >= 128 && fileBuffer[i + 1] <= 191) {
          i++;
          continue;
        }
      } else if (fileBuffer[i] >= 240 && fileBuffer[i] <= 247 && i + 3 < totalBytes) {
        i++;
        if (fileBuffer[i] >= 128 && fileBuffer[i] <= 191 && fileBuffer[i + 1] >= 128 && fileBuffer[i + 1] <= 191 && fileBuffer[i + 2] >= 128 && fileBuffer[i + 2] <= 191) {
          i += 2;
          continue;
        }
      }
      suspiciousBytes++;
      if (i >= 32 && suspiciousBytes * 100 / scanBytes > 10) {
        return true;
      }
    }
  }
  if (suspiciousBytes * 100 / scanBytes > 10) {
    return true;
  }
  if (suspiciousBytes > 1 && isBinaryProto(fileBuffer, scanBytes)) {
    return true;
  }
  return false;
}
function isString(x) {
  return typeof x === "string";
}
function isStatFile(stat4) {
  if (!stat4.isFile()) {
    throw new Error(`Path provided was not a file!`);
  }
}

// mime.ts
var TEXT_EXTENSIONS = /* @__PURE__ */ new Set([
  "md",
  "txt",
  "rst",
  "adoc",
  "asciidoc",
  "tex",
  "latex",
  "log",
  "html",
  "htm",
  "xhtml",
  "xml",
  "svg",
  "xslt",
  "rss",
  "atom",
  "json",
  "yaml",
  "yml",
  "toml",
  "ini",
  "conf",
  "cfg",
  "config",
  "env",
  "properties",
  "gradle",
  "maven",
  "pom",
  "csv",
  "tsv",
  "psv",
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "es6",
  "es",
  "py",
  "pyw",
  "pyi",
  "pyx",
  "java",
  "kt",
  "kts",
  "scala",
  "groovy",
  "gvy",
  "c",
  "cpp",
  "cc",
  "cxx",
  "h",
  "hpp",
  "hh",
  "hxx",
  "cs",
  "vb",
  "fs",
  "fsx",
  "go",
  "rs",
  "dart",
  "swift",
  "rb",
  "rake",
  "gemspec",
  "erb",
  "php",
  "phtml",
  "php3",
  "php4",
  "php5",
  "pl",
  "pm",
  "t",
  "pod",
  "sh",
  "bash",
  "zsh",
  "ksh",
  "csh",
  "fish",
  "ps1",
  "bat",
  "cmd",
  "sql",
  "ddl",
  "dml",
  "lua",
  "r",
  "rmd",
  "jl",
  "nim",
  "cr",
  "ex",
  "exs",
  "erl",
  "hrl",
  "vue",
  "svelte",
  "astro",
  "scss",
  "sass",
  "css",
  "less",
  "styl",
  "graphql",
  "gql",
  "dockerfile",
  "makefile",
  "cmake",
  "mk",
  "gitignore",
  "gitattributes",
  "editorconfig",
  "eslintrc",
  "prettierrc",
  "babelrc",
  "tsconfig",
  "jsconfig",
  "lock",
  "sum",
  "mod",
  "license",
  "licence",
  "copying",
  "authors",
  "contributors",
  "readme",
  "changelog",
  "changes",
  "history",
  "news",
  "todo",
  "manifest",
  "meta",
  "project",
  "workspace",
  "agents",
  "skill"
]);
function extensionIsText(basename3) {
  const ext = basename3.toLowerCase().split(".").pop() ?? "";
  return TEXT_EXTENSIONS.has(ext);
}
async function sniffText(basename3, filePath) {
  if (extensionIsText(basename3)) {
    return { isText: true, method: "extension" };
  }
  try {
    const head = await readHead(filePath);
    if (head === null) return null;
    if (head[0] === 255 && head[1] === 254 || head[0] === 254 && head[1] === 255 || head[0] === 255 && head[1] === 254 && head[2] === 0 && head[3] === 0 || head[0] === 0 && head[1] === 0 && head[2] === 254 && head[3] === 255 || head[0] === 255 && head[1] === 254 && head[2] === 0 && head[3] === 0 && head[4] === 0 || head[0] === 0 && head[1] === 0 && head[2] === 254 && head[3] === 255 && head[4] === 0) {
      return { isText: true, method: "utf16-or-utf32-bom" };
    }
    if (head[0] === 239 && head[1] === 187 && head[2] === 191) {
      return { isText: true, method: "utf8-bom" };
    }
    const isBinary = await isBinaryFile(filePath);
    return isBinary ? { isText: false, method: "isbinaryfile", reason: "Detected as a binary file" } : { isText: true, method: "isbinaryfile" };
  } catch {
    return null;
  }
}
async function readHead(filePath) {
  const { open: open2 } = await import("node:fs/promises");
  const handle = await open2(filePath, "r");
  try {
    const head = new Uint8Array(8);
    const { bytesRead } = await handle.read(head, 0, 8, 0);
    return head.slice(0, bytesRead);
  } finally {
    await handle.close();
  }
}

// prepare.ts
var DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;
var DEFAULT_TTL_HOURS = 24;
var maxFileSize = DEFAULT_MAX_FILE_SIZE;
var ttlHours = DEFAULT_TTL_HOURS;
function setPrepareOptions(opts) {
  if (opts.maxSize !== void 0) maxFileSize = opts.maxSize;
  if (opts.ttl !== void 0) ttlHours = opts.ttl;
}
async function logsDirPath() {
  return join3(SESSIONS_DIR, ".logs");
}
async function log(level, message, context = {}) {
  try {
    const dir = await logsDirPath();
    await mkdir2(dir, { recursive: true });
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    await writeFile2(join3(dir, LOG_FILE_NAME), `[${timestamp}] [${level}] ${message} ${JSON.stringify(context)}
`, {
      flag: "a"
    });
  } catch {
  }
}
async function cleanupExpired() {
  try {
    const entries = await readdir(SESSIONS_DIR);
    const now = Date.now();
    const ttlMs = ttlHours * 60 * 60 * 1e3;
    for (const entry of entries) {
      if (entry === ".logs" || entry.startsWith(".")) continue;
      const dir = sessionDirFor(entry);
      try {
        const meta = JSON.parse(await readFile2(join3(dir, ".session-meta.json"), "utf-8"));
        const createdAt = new Date(meta.createdAt).getTime();
        if (now - createdAt > ttlMs) {
          await rm2(dir, { recursive: true, force: true });
          await log("INFO", "Cleaned up expired session", { sessionHash: entry, ttlHours });
        }
      } catch {
        try {
          const s = await stat3(dir);
          if (now - s.mtimeMs > ttlMs) {
            await rm2(dir, { recursive: true, force: true });
            await log("INFO", "Cleaned up stale session (no meta)", { sessionHash: entry });
          }
        } catch {
        }
      }
    }
  } catch {
  }
}
async function normalizePath(filePath) {
  try {
    const lst = await lstat(filePath);
    if (lst.isSymbolicLink()) {
      return { path: await realpath2(filePath), isSymlink: true, originalPath: filePath };
    }
  } catch {
  }
  try {
    return { path: resolve2(filePath), isSymlink: false };
  } catch (error) {
    return { path: filePath, isSymlink: false, error: error instanceof Error ? error.message : String(error) };
  }
}
async function isTextFile(filePath, fileName) {
  if (extensionIsText(fileName)) return { isText: true, method: "extension" };
  const sniffed = await sniffText(fileName, filePath);
  if (sniffed) return sniffed;
  return { isText: true, method: "sniff-fallback" };
}
async function prepare(sourcePaths) {
  if (sourcePaths.length === 0) {
    return {
      success: false,
      files: [],
      message: "Missing required argument: --source <sourcePath> (specify at least one)"
    };
  }
  const sessionHash = await generateSessionHash(sourcePaths);
  const sessionDir = sessionDirFor(sessionHash);
  const manifestPath = join3(sessionDir, "manifest.json");
  const metaPath = join3(sessionDir, ".session-meta.json");
  await log("INFO", "Starting prepare", { sessionHash, sourcePaths, maxFileSize, ttlHours });
  await cleanupExpired();
  await mkdir2(SESSIONS_DIR, { recursive: true });
  await mkdir2(sessionDir, { recursive: true });
  const acquired = await acquireLock(sessionDir);
  if (!acquired) {
    await log("WARN", "Lock contention", { sessionHash });
    return { success: false, files: [], sessionHash, message: "Session locked (another revision in progress)" };
  }
  const stopHeartbeat = startHeartbeat(sessionDir);
  try {
    let manifest;
    try {
      manifest = JSON.parse(await readFile2(manifestPath, "utf-8"));
    } catch {
      manifest = { files: [], createdAt: (/* @__PURE__ */ new Date()).toISOString() };
    }
    await writeFile2(
      metaPath,
      JSON.stringify({ createdAt: manifest.createdAt || (/* @__PURE__ */ new Date()).toISOString(), ttlHours, lastAccess: (/* @__PURE__ */ new Date()).toISOString() }, null, 2)
    );
    const files = manifest.files || [];
    const addedFiles = [];
    const skippedFiles = [];
    const errors = [];
    for (const sourcePath of sourcePaths) {
      const normalized = await normalizePath(sourcePath);
      if (normalized.error) {
        errors.push({ sourcePath, message: `Failed to normalize path: ${normalized.error}` });
        continue;
      }
      const normalizedPath = normalized.path;
      if (normalized.isSymlink) {
        await log("WARN", "Source file is symlink", { originalPath: sourcePath, resolvedPath: normalizedPath });
      }
      try {
        await access(normalizedPath);
      } catch {
        errors.push({ sourcePath, normalizedPath, message: `Source file does not exist: ${sourcePath}` });
        continue;
      }
      const size = await statSize(normalizedPath);
      if (size.error) {
        errors.push({ sourcePath, message: `Failed to stat: ${size.error}` });
        continue;
      }
      if ((size.value ?? 0) > maxFileSize) {
        errors.push({ sourcePath, message: `File exceeds size limit (${size.value} bytes > ${maxFileSize} bytes)` });
        continue;
      }
      const textCheck = await isTextFile(normalizedPath, basename2(normalizedPath));
      if (!textCheck.isText) {
        errors.push({ sourcePath, normalizedPath, message: `Not a text document: ${textCheck.reason ?? "binary"}` });
        continue;
      }
      const existingIndex = files.findIndex((f) => f.normalizedPath === normalizedPath);
      if (existingIndex !== -1) {
        const old = files[existingIndex];
        skippedFiles.push(normalizedPath);
        await log("INFO", "Snapshot already exists; skipping (keeps A1 baseline)", { sourcePath, snapshotId: old.snapshotId });
        continue;
      }
      const fileName = basename2(normalizedPath);
      const snapId = createHash2("sha256").update(fileName).digest("hex").slice(0, 10);
      const snapshotPath = join3(sessionDir, snapshotFileName(fileName));
      try {
        await copyFile(normalizedPath, snapshotPath);
        const entry = {
          sourcePath,
          normalizedPath,
          snapshotPath,
          snapshotFileName: basename2(snapshotPath),
          snapshotId: createHash2("sha256").update(fileName).digest("hex").slice(0, 10),
          fileName,
          fileSize: size.value,
          isSymlink: normalized.isSymlink
        };
        files.push(entry);
        addedFiles.push(entry);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push({ sourcePath, message: `Failed to create backup: ${err.message}` });
      }
    }
    manifest.files = files;
    manifest.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    try {
      await writeFile2(manifestPath, JSON.stringify(manifest, null, 2));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push({ sourcePath: "manifest", message: `Failed to write manifest: ${err.message}` });
    }
    if (errors.length > 0 && files.length === 0) {
      return { success: false, sessionHash, sessionDir, files: [], errors, message: "All files failed to prepare." };
    }
    return {
      success: true,
      sessionHash,
      sessionDir,
      files,
      newFiles: addedFiles,
      skippedFiles: skippedFiles.length > 0 ? skippedFiles : void 0,
      errors: errors.length > 0 ? errors : void 0,
      ttlHours,
      message: skippedFiles.length > 0 ? `${addedFiles.length} file(s) added, ${skippedFiles.length} already snapshotted (A1 baseline kept).` : `${addedFiles.length} file(s) added. Session expires in ${ttlHours} hours.`
    };
  } finally {
    stopHeartbeat();
    await releaseLock(sessionDir);
  }
}
async function statSize(p) {
  try {
    const s = await stat3(p);
    return { value: s.size };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

// finalize.ts
import { access as access2, readFile as readFile3, rm as rm3, mkdir as mkdir3, writeFile as writeFile3 } from "node:fs/promises";
import { join as join5 } from "node:path";

// node_modules/diff/lib/index.mjs
function Diff() {
}
Diff.prototype = {
  diff: function diff(oldString, newString) {
    var _options$timeout;
    var options = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : {};
    var callback = options.callback;
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    this.options = options;
    var self = this;
    function done(value) {
      if (callback) {
        setTimeout(function() {
          callback(void 0, value);
        }, 0);
        return true;
      } else {
        return value;
      }
    }
    oldString = this.castInput(oldString);
    newString = this.castInput(newString);
    oldString = this.removeEmpty(this.tokenize(oldString));
    newString = this.removeEmpty(this.tokenize(newString));
    var newLen = newString.length, oldLen = oldString.length;
    var editLength = 1;
    var maxEditLength = newLen + oldLen;
    if (options.maxEditLength) {
      maxEditLength = Math.min(maxEditLength, options.maxEditLength);
    }
    var maxExecutionTime = (_options$timeout = options.timeout) !== null && _options$timeout !== void 0 ? _options$timeout : Infinity;
    var abortAfterTimestamp = Date.now() + maxExecutionTime;
    var bestPath = [{
      oldPos: -1,
      lastComponent: void 0
    }];
    var newPos = this.extractCommon(bestPath[0], newString, oldString, 0);
    if (bestPath[0].oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
      return done([{
        value: this.join(newString),
        count: newString.length
      }]);
    }
    var minDiagonalToConsider = -Infinity, maxDiagonalToConsider = Infinity;
    function execEditLength() {
      for (var diagonalPath = Math.max(minDiagonalToConsider, -editLength); diagonalPath <= Math.min(maxDiagonalToConsider, editLength); diagonalPath += 2) {
        var basePath = void 0;
        var removePath = bestPath[diagonalPath - 1], addPath = bestPath[diagonalPath + 1];
        if (removePath) {
          bestPath[diagonalPath - 1] = void 0;
        }
        var canAdd = false;
        if (addPath) {
          var addPathNewPos = addPath.oldPos - diagonalPath;
          canAdd = addPath && 0 <= addPathNewPos && addPathNewPos < newLen;
        }
        var canRemove = removePath && removePath.oldPos + 1 < oldLen;
        if (!canAdd && !canRemove) {
          bestPath[diagonalPath] = void 0;
          continue;
        }
        if (!canRemove || canAdd && removePath.oldPos + 1 < addPath.oldPos) {
          basePath = self.addToPath(addPath, true, void 0, 0);
        } else {
          basePath = self.addToPath(removePath, void 0, true, 1);
        }
        newPos = self.extractCommon(basePath, newString, oldString, diagonalPath);
        if (basePath.oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
          return done(buildValues(self, basePath.lastComponent, newString, oldString, self.useLongestToken));
        } else {
          bestPath[diagonalPath] = basePath;
          if (basePath.oldPos + 1 >= oldLen) {
            maxDiagonalToConsider = Math.min(maxDiagonalToConsider, diagonalPath - 1);
          }
          if (newPos + 1 >= newLen) {
            minDiagonalToConsider = Math.max(minDiagonalToConsider, diagonalPath + 1);
          }
        }
      }
      editLength++;
    }
    if (callback) {
      (function exec() {
        setTimeout(function() {
          if (editLength > maxEditLength || Date.now() > abortAfterTimestamp) {
            return callback();
          }
          if (!execEditLength()) {
            exec();
          }
        }, 0);
      })();
    } else {
      while (editLength <= maxEditLength && Date.now() <= abortAfterTimestamp) {
        var ret = execEditLength();
        if (ret) {
          return ret;
        }
      }
    }
  },
  addToPath: function addToPath(path2, added, removed, oldPosInc) {
    var last = path2.lastComponent;
    if (last && last.added === added && last.removed === removed) {
      return {
        oldPos: path2.oldPos + oldPosInc,
        lastComponent: {
          count: last.count + 1,
          added,
          removed,
          previousComponent: last.previousComponent
        }
      };
    } else {
      return {
        oldPos: path2.oldPos + oldPosInc,
        lastComponent: {
          count: 1,
          added,
          removed,
          previousComponent: last
        }
      };
    }
  },
  extractCommon: function extractCommon(basePath, newString, oldString, diagonalPath) {
    var newLen = newString.length, oldLen = oldString.length, oldPos = basePath.oldPos, newPos = oldPos - diagonalPath, commonCount = 0;
    while (newPos + 1 < newLen && oldPos + 1 < oldLen && this.equals(newString[newPos + 1], oldString[oldPos + 1])) {
      newPos++;
      oldPos++;
      commonCount++;
    }
    if (commonCount) {
      basePath.lastComponent = {
        count: commonCount,
        previousComponent: basePath.lastComponent
      };
    }
    basePath.oldPos = oldPos;
    return newPos;
  },
  equals: function equals(left, right) {
    if (this.options.comparator) {
      return this.options.comparator(left, right);
    } else {
      return left === right || this.options.ignoreCase && left.toLowerCase() === right.toLowerCase();
    }
  },
  removeEmpty: function removeEmpty(array) {
    var ret = [];
    for (var i = 0; i < array.length; i++) {
      if (array[i]) {
        ret.push(array[i]);
      }
    }
    return ret;
  },
  castInput: function castInput(value) {
    return value;
  },
  tokenize: function tokenize(value) {
    return value.split("");
  },
  join: function join4(chars) {
    return chars.join("");
  }
};
function buildValues(diff2, lastComponent, newString, oldString, useLongestToken) {
  var components = [];
  var nextComponent;
  while (lastComponent) {
    components.push(lastComponent);
    nextComponent = lastComponent.previousComponent;
    delete lastComponent.previousComponent;
    lastComponent = nextComponent;
  }
  components.reverse();
  var componentPos = 0, componentLen = components.length, newPos = 0, oldPos = 0;
  for (; componentPos < componentLen; componentPos++) {
    var component = components[componentPos];
    if (!component.removed) {
      if (!component.added && useLongestToken) {
        var value = newString.slice(newPos, newPos + component.count);
        value = value.map(function(value2, i) {
          var oldValue = oldString[oldPos + i];
          return oldValue.length > value2.length ? oldValue : value2;
        });
        component.value = diff2.join(value);
      } else {
        component.value = diff2.join(newString.slice(newPos, newPos + component.count));
      }
      newPos += component.count;
      if (!component.added) {
        oldPos += component.count;
      }
    } else {
      component.value = diff2.join(oldString.slice(oldPos, oldPos + component.count));
      oldPos += component.count;
      if (componentPos && components[componentPos - 1].added) {
        var tmp = components[componentPos - 1];
        components[componentPos - 1] = components[componentPos];
        components[componentPos] = tmp;
      }
    }
  }
  var finalComponent = components[componentLen - 1];
  if (componentLen > 1 && typeof finalComponent.value === "string" && (finalComponent.added || finalComponent.removed) && diff2.equals("", finalComponent.value)) {
    components[componentLen - 2].value += finalComponent.value;
    components.pop();
  }
  return components;
}
var characterDiff = new Diff();
var extendedWordChars = /^[A-Za-z\xC0-\u02C6\u02C8-\u02D7\u02DE-\u02FF\u1E00-\u1EFF]+$/;
var reWhitespace = /\S/;
var wordDiff = new Diff();
wordDiff.equals = function(left, right) {
  if (this.options.ignoreCase) {
    left = left.toLowerCase();
    right = right.toLowerCase();
  }
  return left === right || this.options.ignoreWhitespace && !reWhitespace.test(left) && !reWhitespace.test(right);
};
wordDiff.tokenize = function(value) {
  var tokens = value.split(/([^\S\r\n]+|[()[\]{}'"\r\n]|\b)/);
  for (var i = 0; i < tokens.length - 1; i++) {
    if (!tokens[i + 1] && tokens[i + 2] && extendedWordChars.test(tokens[i]) && extendedWordChars.test(tokens[i + 2])) {
      tokens[i] += tokens[i + 2];
      tokens.splice(i + 1, 2);
      i--;
    }
  }
  return tokens;
};
var lineDiff = new Diff();
lineDiff.tokenize = function(value) {
  if (this.options.stripTrailingCr) {
    value = value.replace(/\r\n/g, "\n");
  }
  var retLines = [], linesAndNewlines = value.split(/(\n|\r\n)/);
  if (!linesAndNewlines[linesAndNewlines.length - 1]) {
    linesAndNewlines.pop();
  }
  for (var i = 0; i < linesAndNewlines.length; i++) {
    var line = linesAndNewlines[i];
    if (i % 2 && !this.options.newlineIsToken) {
      retLines[retLines.length - 1] += line;
    } else {
      if (this.options.ignoreWhitespace) {
        line = line.trim();
      }
      retLines.push(line);
    }
  }
  return retLines;
};
function diffLines(oldStr, newStr, callback) {
  return lineDiff.diff(oldStr, newStr, callback);
}
var sentenceDiff = new Diff();
sentenceDiff.tokenize = function(value) {
  return value.split(/(\S.+?[.!?])(?=\s+|$)/);
};
var cssDiff = new Diff();
cssDiff.tokenize = function(value) {
  return value.split(/([{}:;,]|\s+)/);
};
function _typeof(obj) {
  "@babel/helpers - typeof";
  if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") {
    _typeof = function(obj2) {
      return typeof obj2;
    };
  } else {
    _typeof = function(obj2) {
      return obj2 && typeof Symbol === "function" && obj2.constructor === Symbol && obj2 !== Symbol.prototype ? "symbol" : typeof obj2;
    };
  }
  return _typeof(obj);
}
var objectPrototypeToString = Object.prototype.toString;
var jsonDiff = new Diff();
jsonDiff.useLongestToken = true;
jsonDiff.tokenize = lineDiff.tokenize;
jsonDiff.castInput = function(value) {
  var _this$options = this.options, undefinedReplacement = _this$options.undefinedReplacement, _this$options$stringi = _this$options.stringifyReplacer, stringifyReplacer = _this$options$stringi === void 0 ? function(k, v) {
    return typeof v === "undefined" ? undefinedReplacement : v;
  } : _this$options$stringi;
  return typeof value === "string" ? value : JSON.stringify(canonicalize(value, null, null, stringifyReplacer), stringifyReplacer, "  ");
};
jsonDiff.equals = function(left, right) {
  return Diff.prototype.equals.call(jsonDiff, left.replace(/,([\r\n])/g, "$1"), right.replace(/,([\r\n])/g, "$1"));
};
function canonicalize(obj, stack, replacementStack, replacer, key) {
  stack = stack || [];
  replacementStack = replacementStack || [];
  if (replacer) {
    obj = replacer(key, obj);
  }
  var i;
  for (i = 0; i < stack.length; i += 1) {
    if (stack[i] === obj) {
      return replacementStack[i];
    }
  }
  var canonicalizedObj;
  if ("[object Array]" === objectPrototypeToString.call(obj)) {
    stack.push(obj);
    canonicalizedObj = new Array(obj.length);
    replacementStack.push(canonicalizedObj);
    for (i = 0; i < obj.length; i += 1) {
      canonicalizedObj[i] = canonicalize(obj[i], stack, replacementStack, replacer, key);
    }
    stack.pop();
    replacementStack.pop();
    return canonicalizedObj;
  }
  if (obj && obj.toJSON) {
    obj = obj.toJSON();
  }
  if (_typeof(obj) === "object" && obj !== null) {
    stack.push(obj);
    canonicalizedObj = {};
    replacementStack.push(canonicalizedObj);
    var sortedKeys = [], _key;
    for (_key in obj) {
      if (obj.hasOwnProperty(_key)) {
        sortedKeys.push(_key);
      }
    }
    sortedKeys.sort();
    for (i = 0; i < sortedKeys.length; i += 1) {
      _key = sortedKeys[i];
      canonicalizedObj[_key] = canonicalize(obj[_key], stack, replacementStack, replacer, _key);
    }
    stack.pop();
    replacementStack.pop();
  } else {
    canonicalizedObj = obj;
  }
  return canonicalizedObj;
}
var arrayDiff = new Diff();
arrayDiff.tokenize = function(value) {
  return value.slice();
};
arrayDiff.join = arrayDiff.removeEmpty = function(value) {
  return value;
};

// diff.ts
var CONTEXT_MIN_LINES = 1;
var CONTEXT_MAX_LINES = 5;
function countEffectiveChars(text) {
  return text.replace(/\s/g, "").length;
}
function contextLengths(oldLines, oldStartIndex, oldEndIndex, direction) {
  const available = direction === "before" ? oldStartIndex : oldLines.length - oldEndIndex - 1;
  if (available <= 0) return 0;
  const anchorFixedIndex = direction === "before" ? oldStartIndex - 1 : oldEndIndex + 1;
  let totalChars = 0;
  let lineCount = 0;
  if (direction === "before") {
    for (let i = anchorFixedIndex; i >= 0 && lineCount < CONTEXT_MAX_LINES; i--) {
      totalChars += countEffectiveChars(oldLines[i]);
      lineCount++;
      if (totalChars >= 75) break;
    }
  } else {
    for (let i = anchorFixedIndex; i < oldLines.length && lineCount < CONTEXT_MAX_LINES; i++) {
      totalChars += countEffectiveChars(oldLines[i]);
      lineCount++;
      if (totalChars >= 75) break;
    }
  }
  return Math.max(CONTEXT_MIN_LINES, Math.min(lineCount, available, CONTEXT_MAX_LINES));
}
function getContext(oldLines, oldStart, oldEnd) {
  const before = contextLengths(oldLines, oldStart - 1, oldEnd - 1, "before");
  const after = contextLengths(oldLines, oldStart - 1, oldEnd - 1, "after");
  const contextBefore = oldLines.slice(Math.max(0, oldStart - 1 - before), oldStart - 1).join("\n");
  const contextAfter = oldLines.slice(oldEnd, oldEnd + after).join("\n");
  return { contextBefore, contextAfter };
}
function splitLines(text) {
  return (text ?? "").split("\n");
}
function contentLines(value) {
  return (value ?? "").replace(/\n$/, "").split("\n");
}
function convertToHunks(oldContent, newContent) {
  const changes = diffLines(oldContent, newContent);
  const oldLines = splitLines(oldContent);
  const hunks = [];
  let oldLine = 1;
  let newLine = 1;
  for (const change of changes) {
    const lineCount = change.count ?? 0;
    const value = change.value ?? "";
    if (change.added) {
      const { contextBefore, contextAfter } = getContext(oldLines, oldLine, oldLine - 1);
      hunks.push({
        type: "add",
        oldStart: oldLine,
        oldEnd: oldLine - 1,
        newStart: newLine,
        newEnd: newLine + lineCount - 1,
        oldContent: "",
        newContent: value,
        contextBefore,
        contextAfter
      });
      newLine += lineCount;
    } else if (change.removed) {
      const { contextBefore, contextAfter } = getContext(oldLines, oldLine, oldLine + lineCount - 1);
      hunks.push({
        type: "delete",
        oldStart: oldLine,
        oldEnd: oldLine + lineCount - 1,
        newStart: newLine,
        newEnd: newLine - 1,
        oldContent: value,
        newContent: "",
        contextBefore,
        contextAfter
      });
      oldLine += lineCount;
    } else {
      oldLine += lineCount;
      newLine += lineCount;
    }
  }
  return mergeAdjacentHunks(hunks, oldLines);
}
function mergeAdjacentHunks(hunks, oldLines) {
  const merged = [];
  let i = 0;
  while (i < hunks.length) {
    const current = hunks[i];
    if (current.type === "delete" && i + 1 < hunks.length && hunks[i + 1].type === "add") {
      const next = hunks[i + 1];
      const { contextBefore, contextAfter } = getContext(oldLines, current.oldStart, current.oldEnd);
      merged.push({
        type: "modify",
        oldStart: current.oldStart,
        oldEnd: current.oldEnd,
        oldContent: current.oldContent,
        newStart: next.newStart,
        newEnd: next.newEnd,
        newContent: next.newContent,
        contextBefore,
        contextAfter
      });
      i += 2;
    } else {
      merged.push(current);
      i++;
    }
  }
  return merged;
}
function calculateSummary(hunks) {
  let additions = 0;
  let deletions = 0;
  let modifications = 0;
  for (const hunk of hunks) {
    switch (hunk.type) {
      case "add":
        additions += hunk.newEnd - hunk.newStart + 1;
        break;
      case "delete":
        deletions += hunk.oldEnd - hunk.oldStart + 1;
        break;
      case "modify":
        modifications++;
        additions += hunk.newEnd - hunk.newStart + 1;
        deletions += hunk.oldEnd - hunk.oldStart + 1;
        break;
    }
  }
  return { additions, deletions, modifications };
}
function generateUnifiedDiff(hunks, oldPath, newPath) {
  if (hunks.length === 0) return "";
  const lines = [];
  lines.push(`--- ${oldPath}`);
  lines.push(`+++ ${newPath}`);
  for (const hunk of hunks) {
    const contentOld = hunk.type === "delete" || hunk.type === "modify" ? contentLines(hunk.oldContent) : [];
    const contentNew = hunk.type === "add" || hunk.type === "modify" ? contentLines(hunk.newContent) : [];
    const beforeLines = contentLines(hunk.contextBefore);
    const afterLines = contentLines(hunk.contextAfter);
    const ctxCount = beforeLines.length + afterLines.length;
    const startOld = hunk.oldStart > 0 && beforeLines.length > 0 ? hunk.oldStart - beforeLines.length : hunk.oldStart;
    const startNew = hunk.newStart > 0 && beforeLines.length > 0 ? hunk.newStart - beforeLines.length : hunk.newStart;
    lines.push(`@@ -${startOld},${contentOld.length + ctxCount} +${startNew},${contentNew.length + ctxCount} @@`);
    for (const line of beforeLines) lines.push(` ${line}`);
    for (const line of contentOld) lines.push(`-${line}`);
    for (const line of contentNew) lines.push(`+${line}`);
    for (const line of afterLines) lines.push(` ${line}`);
  }
  return lines.join("\n");
}

// finalize.ts
async function finalize(sourcePaths) {
  if (sourcePaths.length === 0) {
    return {
      success: false,
      files: [],
      summary: { totalAdditions: 0, totalDeletions: 0, totalModifications: 0 },
      message: "Missing required argument: --source <sourcePath> (specify at least one file from the revision session)"
    };
  }
  const sessionHash = await generateSessionHash(sourcePaths);
  const sessionDir = sessionDirFor(sessionHash);
  const manifestPath = join5(sessionDir, "manifest.json");
  const metaPath = join5(sessionDir, ".session-meta.json");
  await log2("INFO", "Starting finalize", { sessionHash, sourcePaths });
  for (const [p, what] of [
    [sessionDir, "session"],
    [manifestPath, "manifest"]
  ]) {
    const ok = await access2(p).then(() => true).catch(() => false);
    if (!ok) {
      return {
        success: false,
        sessionHash,
        sessionDir,
        files: [],
        summary: { totalAdditions: 0, totalDeletions: 0, totalModifications: 0 },
        message: what === "session" ? `No revision session found for this path. Session hash: ${sessionHash}. Call prepare first.` : "No manifest.json found in session directory. Session may have been cleaned up."
      };
    }
  }
  const acquired = await acquireLock(sessionDir);
  if (!acquired) {
    await log2("WARN", "Lock contention", { sessionHash });
    return {
      success: false,
      sessionHash,
      files: [],
      sessionRetained: true,
      message: "Session locked (already being finalized?)"
    };
  }
  const stopHeartbeat = startHeartbeat(sessionDir);
  try {
    let manifest;
    try {
      manifest = JSON.parse(await readFile3(manifestPath, "utf-8"));
    } catch (error) {
      await log2("ERROR", "Failed to read manifest", { sessionHash, error: String(error) });
      return {
        success: false,
        sessionHash,
        files: [],
        summary: { totalAdditions: 0, totalDeletions: 0, totalModifications: 0 },
        message: "Failed to read manifest"
      };
    }
    if (!manifest.files || manifest.files.length === 0) {
      return {
        success: false,
        sessionHash,
        files: [],
        summary: { totalAdditions: 0, totalDeletions: 0, totalModifications: 0 },
        message: "Manifest has no files. Nothing to process."
      };
    }
    try {
      await writeFile3(metaPath, JSON.stringify({ ...manifest, lastAccess: (/* @__PURE__ */ new Date()).toISOString(), status: "processing" }, null, 2));
    } catch {
    }
    const processedFiles = [];
    let totalAdditions = 0;
    let totalDeletions = 0;
    let totalModifications = 0;
    let hasAnyChanges = false;
    let failedCount = 0;
    for (const fileEntry of manifest.files) {
      const sourcePath = fileEntry.normalizedPath || fileEntry.sourcePath;
      const { snapshotPath, snapshotId, fileName } = fileEntry;
      const base = {
        sourcePath,
        fileName,
        snapshotId,
        hunks: [],
        summary: { additions: 0, deletions: 0, modifications: 0 }
      };
      const sourceExists = await access2(sourcePath).then(() => true).catch(() => false);
      if (!sourceExists) {
        failedCount++;
        processedFiles.push({ ...base, success: false, message: `Source file no longer exists: ${sourcePath}` });
        await log2("WARN", "Source file missing", { sessionHash, sourcePath });
        continue;
      }
      const snapshotExists = await access2(snapshotPath).then(() => true).catch(() => false);
      if (!snapshotExists) {
        failedCount++;
        processedFiles.push({ ...base, success: false, message: `Snapshot file missing: ${snapshotPath}` });
        await log2("ERROR", "Snapshot file missing", { sessionHash, sourcePath, snapshotPath });
        continue;
      }
      try {
        const [oldContent, newContent] = await Promise.all([
          readTextCanonical(snapshotPath),
          readTextCanonical(sourcePath)
        ]);
        const hunks = convertToHunks(oldContent, newContent);
        const summary = calculateSummary(hunks);
        const hasChanges = hunks.length > 0;
        if (hasChanges) {
          hasAnyChanges = true;
          totalAdditions += summary.additions;
          totalDeletions += summary.deletions;
          totalModifications += summary.modifications;
        }
        const unifiedDiff = hasChanges ? generateUnifiedDiff(hunks, snapshotPath, sourcePath) : "";
        processedFiles.push({
          ...base,
          success: true,
          hasChanges,
          hunks,
          summary,
          unifiedDiff,
          message: hasChanges ? `${hunks.length} hunks detected (${summary.additions} additions, ${summary.deletions} deletions)` : "No changes detected."
        });
      } catch (error) {
        failedCount++;
        processedFiles.push({ ...base, success: false, message: `Failed to compare files: ${String(error)}` });
        await log2("ERROR", "Failed to compare files", { sessionHash, sourcePath, error: String(error) });
      }
    }
    const cleanupErrors = [];
    if (failedCount === 0) {
      try {
        await rm3(sessionDir, { recursive: true, force: true });
      } catch (error) {
        cleanupErrors.push({ path: sessionDir, error: String(error) });
      }
      if (cleanupErrors.length > 0) {
        await log2("WARN", "Cleanup failed", { sessionHash, cleanupErrors });
      } else {
        await log2("INFO", "Cleanup completed", { sessionHash });
      }
    } else {
      cleanupErrors.push({
        path: sessionDir,
        error: `session retained for inspection (${failedCount} file(s) failed)`
      });
      await log2("WARN", "Session retained (per-file failures)", { sessionHash, failedCount });
    }
    const result = {
      success: true,
      sessionHash,
      sessionDir,
      files: processedFiles,
      summary: { totalAdditions, totalDeletions, totalModifications },
      hasAnyChanges,
      canProceedToNextStep: !hasAnyChanges,
      sessionRetained: failedCount > 0,
      cleanupErrors: cleanupErrors.length > 0 ? cleanupErrors : void 0,
      message: failedCount > 0 ? `Session finalized with ${failedCount} file(s) failing; session retained for inspection.` : hasAnyChanges ? `Session finalized. ${processedFiles.length} files processed, ${totalModifications} hunks total. Cleanup completed.` : "Session finalized. No changes detected. Cleanup completed. You may proceed to next step."
    };
    await log2("INFO", "finalize completed", { sessionHash, hasChanges: hasAnyChanges, sessionRetained: failedCount > 0 });
    return result;
  } finally {
    stopHeartbeat();
    try {
      await releaseLock(sessionDir);
    } catch {
    }
  }
}
async function log2(level, message, context = {}) {
  try {
    const dir = join5(SESSIONS_DIR, ".logs");
    await mkdir3(dir, { recursive: true });
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    await writeFile3(join5(dir, LOG_FILE_NAME), `[${timestamp}] [${level}] ${message} ${JSON.stringify(context)}
`, {
      flag: "a"
    });
  } catch {
  }
}

// index.ts
var NODE_MAJOR = Number.parseInt(process.versions.node, 10);
if (Number.isNaN(NODE_MAJOR) || NODE_MAJOR < 20) {
  console.error(
    `interactive-revision requires Node.js >= 20 (current: ${process.versions.node}). The scripts have no fallback mechanism \u2014 halting.`
  );
  process.exit(1);
}
async function main() {
  const argv = process.argv.slice(2);
  const [command, ...rest] = argv;
  if (!command) {
    console.error(usage());
    process.exit(2);
  }
  const args = parseArgs(rest);
  const sourcesRaw = args.source ?? [];
  const sources = Array.isArray(sourcesRaw) ? sourcesRaw : [sourcesRaw];
  if (sources.length === 0) {
    console.error(usage());
    console.error("Missing required argument: --source <sourcePath> (specify at least one)");
    process.exit(2);
  }
  if (command === "prepare") {
    const maxSizeRaw = asString(args["max-size"]);
    const ttlRaw = asString(args.ttl);
    const maxSize = maxSizeRaw !== void 0 ? parsePositiveInt(maxSizeRaw) : void 0;
    const ttl = ttlRaw !== void 0 ? parsePositiveInt(ttlRaw) : void 0;
    if (maxSize !== void 0 && Number.isNaN(maxSize)) {
      console.error("Invalid --max-size (expected a positive integer)");
      process.exit(2);
    }
    if (ttl !== void 0 && Number.isNaN(ttl)) {
      console.error("Invalid --ttl (expected a positive integer)");
      process.exit(2);
    }
    setPrepareOptions({ maxSize, ttl });
    const result = await prepare(sources);
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === "finalize") {
    const result = await finalize(sources);
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.error(usage());
  console.error(`Unknown command: ${command}`);
  process.exit(2);
}
function usage() {
  return [
    "Usage: node revision.mjs <prepare|finalize> --source <path> [--source <path2> ...]",
    "",
    "  prepare   --source <path> [--source <path> ...] [--max-size <bytes>] [--ttl <hours>]",
    "  finalize  --source <path> [--source <path> ...]"
  ].join("\n");
}
function asString(v) {
  return typeof v === "string" ? v : void 0;
}
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw.startsWith("--")) continue;
    let key = raw.slice(2);
    let value;
    const eq = raw.indexOf("=");
    if (eq !== -1) {
      key = raw.slice(2, eq);
      value = raw.slice(eq + 1);
    } else if (argv[i + 1] !== void 0 && !argv[i + 1].startsWith("--")) {
      value = argv[i + 1];
      i++;
    }
    if (key === "source") {
      if (value && value.length > 0) {
        const list = out.source ?? [];
        list.push(value);
        out.source = list;
      }
    } else {
      out[key] = value ?? "";
    }
  }
  return out;
}
function parsePositiveInt(s) {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : Number.NaN;
}
await main();
