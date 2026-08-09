/**
 * TraceLogger - LLM 请求/响应追踪日志
 *
 * 从 aet.js 抽离的追踪模块。
 * 拦截 globalThis.fetch，记录 LLM 请求/响应到 ~/.aet/log/trace/ 目录。
 * 依赖 configManager（用于 isTraceEnabled）和 checkpointManager（用于 metadata），
 * 通过构造函数注入。
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const TRACE_DIR = path.join(os.homedir(), '.aet', 'log', 'trace');

const SENSITIVE_HEADERS = [
  'authorization', 'api-key', 'x-api-key', 'apikey', 'x-apikey',
  'token', 'x-token', 'access-token', 'x-access-token',
  'secret', 'x-secret', 'cookie',
];

function redactHeaders(headers) {
  if (process.env.AET_TRACE_REDACT === 'false') return headers;
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.includes(key.toLowerCase())) {
      result[key] = value.toLowerCase().startsWith('bearer ') ? 'Bearer [REDACTED]' : '[REDACTED]';
    } else {
      result[key] = value;
    }
  }
  return result;
}

class TraceLogger {
  constructor(configManager, getCheckpointContext) {
    this.origFetch = globalThis.fetch;
    this.ids = new Map(); // sessionId -> last seq number
    this.installed = false;
    // 依赖注入
    this._configManager = configManager;
    // getCheckpointContext() -> { checkpointID, checkpointManager }
    this._getCheckpointContext = getCheckpointContext || (() => ({}));
  }

  install() {
    if (this.installed) return;
    this.origFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => this._tracedFetch(input, init);
    this.installed = true;
    this._writeConfig();
    const enabled = this._configManager.isTraceEnabled();
    console.log('[AET] Trace logging installed →', TRACE_DIR, '(enabled:', enabled, ')');
  }

  uninstall() {
    if (!this.installed) return;
    globalThis.fetch = this.origFetch;
    this.installed = false;
  }

  // --- config.json ---
  _writeConfig() {
    try {
      fs.mkdirSync(TRACE_DIR, { recursive: true });
      const configPath = path.join(TRACE_DIR, 'config.json');
      if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify({
          version: '1.0',
          createdAt: new Date().toISOString(),
          traceDir: TRACE_DIR,
        }, null, 2));
      }
    } catch (err) {
      console.error('[AET] trace config write error:', err.message);
    }
  }

  // --- per-session metadata.json ---
  _writeMetadata(sessionID) {
    const { checkpointID, checkpointManager } = this._getCheckpointContext();
    const sessionDir = path.join(TRACE_DIR, `ses_${sessionID}`);
    try {
      fs.mkdirSync(sessionDir, { recursive: true });
      const metaPath = path.join(sessionDir, 'metadata.json');
      if (!fs.existsSync(metaPath)) {
        const meta = {
          sessionID,
          createdAt: new Date().toISOString(),
          checkpointID: checkpointID || null,
          workflow: checkpointID && checkpointManager
            ? checkpointManager.getCheckpoint(checkpointID)?.workflow?.name || null
            : null,
        };
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
      } else {
        try {
          const existing = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          const newCheckpointID = checkpointID || null;
          const newWorkflow = checkpointID && checkpointManager
            ? checkpointManager.getCheckpoint(checkpointID)?.workflow?.name || null
            : null;
          if (existing.checkpointID !== newCheckpointID || existing.workflow !== newWorkflow) {
            existing.checkpointID = newCheckpointID;
            existing.workflow = newWorkflow;
            existing.updatedAt = new Date().toISOString();
            fs.writeFileSync(metaPath, JSON.stringify(existing, null, 2));
          }
        } catch { /* ignore read errors */ }
      }
    } catch (err) {
      console.error('[AET] trace metadata write error:', err.message);
    }
  }

  // --- parse request from fetch args ---
  _parseRequest(input, init) {
    try {
      return new Request(input, init);
    } catch {
      return null;
    }
  }

  _getSessionId(req) {
    return req.headers.get('x-opencode-session')
      || req.headers.get('x-session-affinity')
      || req.headers.get('session_id')
      || undefined;
  }

  _headersToObject(headers) {
    const obj = {};
    headers.forEach((value, key) => { obj[key] = value; });
    return obj;
  }

  _parseBody(text) {
    try { return JSON.parse(text); }
    catch { return text || null; }
  }

  _classifyPurpose(body) {
    if (typeof body === 'object' && body !== null && !Array.isArray(body)
      && Array.isArray(body.tools) && body.tools.length > 0) {
      return ''; // tool call — purpose is implied by tool name
    }
    return '[meta]';
  }

  // --- atomic write of seq.json ---
  _writeRecord(sessionID, seq, record) {
    const sessionDir = path.join(TRACE_DIR, `ses_${sessionID}`);
    try {
      fs.mkdirSync(sessionDir, { recursive: true });
      const tmpPath = path.join(sessionDir, `${seq}.json.tmp`);
      const finalPath = path.join(sessionDir, `${seq}.json`);
      fs.writeFileSync(tmpPath, JSON.stringify(record, null, 2));
      fs.renameSync(tmpPath, finalPath);
    } catch (err) {
      console.error('[AET] trace record write error:', err.message);
    }
  }

  // --- main fetch interceptor ---
  async _tracedFetch(input, init) {
    const req = this._parseRequest(input, init);
    if (!req) return this.origFetch(input, init);

    const sessionID = this._getSessionId(req);
    const { checkpointID } = this._getCheckpointContext();
    if (!sessionID || !this._configManager.isTraceEnabled() || !checkpointID) return this.origFetch(input, init);

    // Assign seq number
    const seq = (this.ids.get(sessionID) ?? 0) + 1;
    this.ids.set(sessionID, seq);

    const requestAt = new Date().toISOString();
    const requestSentAt = performance.now();

    // Clone request body before sending
    const reqBodyText = await req.clone().text().catch(() => '');
    const reqBody = this._parseBody(reqBodyText);
    const purpose = this._classifyPurpose(reqBody);
    const isStream = typeof reqBody === 'object' && reqBody?.stream === true;

    const traceReq = {
      method: req.method,
      url: req.url,
      headers: redactHeaders(this._headersToObject(req.headers)),
      body: reqBody,
    };

    // Write metadata for this session on first trace
    this._writeMetadata(sessionID);

    // Execute the original fetch
    let res;
    try {
      res = await this.origFetch(input, init);
    } catch (err) {
      const error = err instanceof Error
        ? { message: err.message }
        : { message: String(err) };
      this._writeRecord(sessionID, seq, {
        id: seq,
        purpose,
        requestAt,
        responseAt: new Date().toISOString(),
        request: traceReq,
        response: null,
        error,
        requestSentAt,
      });
      throw err;
    }

    // Stream responses: wrap to capture firstTokenAt / lastTokenAt
    let latencyMeta;
    if (isStream && res.body) {
      latencyMeta = { requestSentAt, firstTokenAt: null, lastTokenAt: null };
      const transform = new TransformStream({
        transform(chunk, controller) {
          if (latencyMeta.firstTokenAt === null) latencyMeta.firstTokenAt = performance.now();
          controller.enqueue(chunk);
        },
        flush() { latencyMeta.lastTokenAt = performance.now(); },
      });
      const wrappedBody = res.body.pipeThrough(transform);
      res = new Response(wrappedBody, { status: res.status, statusText: res.statusText, headers: res.headers });
      (res).__latencyMeta = latencyMeta;
    }

    // Fire-and-forget response recording (don't block the response stream)
    void this._recordResponse(sessionID, seq, purpose, requestAt, traceReq, res, latencyMeta);

    return res;
  }

  async _recordResponse(sessionID, seq, purpose, requestAt, traceReq, res, latencyMeta) {
    try {
      const resBodyText = await res.clone().text();
      const resBody = this._parseBody(resBodyText);
      const traceRes = {
        status: res.status,
        statusText: res.statusText,
        headers: redactHeaders(this._headersToObject(res.headers)),
        body: resBody,
      };

      const latency = latencyMeta || res.__latencyMeta;

      this._writeRecord(sessionID, seq, {
        id: seq,
        purpose,
        requestAt,
        responseAt: new Date().toISOString(),
        request: traceReq,
        response: traceRes,
        error: null,
        requestSentAt: latency?.requestSentAt,
        firstTokenAt: latency?.firstTokenAt ?? undefined,
        lastTokenAt: latency?.lastTokenAt ?? undefined,
      });
    } catch (err) {
      const error = err instanceof Error
        ? { message: err.message }
        : { message: String(err) };
      const latency = latencyMeta || res.__latencyMeta;

      this._writeRecord(sessionID, seq, {
        id: seq,
        purpose,
        requestAt,
        responseAt: new Date().toISOString(),
        request: traceReq,
        response: null,
        error,
        requestSentAt: latency?.requestSentAt,
        firstTokenAt: latency?.firstTokenAt ?? undefined,
        lastTokenAt: latency?.lastTokenAt ?? undefined,
      });
    }
  }
}

module.exports = { TraceLogger, redactHeaders, TRACE_DIR, SENSITIVE_HEADERS };
