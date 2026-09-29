/**
 * AgentInsightClient - agent-insight 平台 API 客户端
 *
 * 负责向 agent-insight 平台上传跨 Session 协作关系事件（增量上报）。
 * POST /api/ingest/collaborations/events
 * 请求头: Content-Type: application/json, x-witty-api-key
 *
 * 当 config.agentInsight.enabled = true 时才执行上传，否则跳过。
 */

import crypto from 'crypto';

function generateCollaborationId() {
  const ts = Date.now();
  const rand = crypto.randomBytes(16).toString('hex');
  return `collab_${ts}_${rand}`;
}

function generateEventId() {
  const ts = Date.now();
  const rand = crypto.randomBytes(16).toString('hex');
  return `evt_${ts}_${rand}`;
}

class AgentInsightClient {
  constructor(config) {
    this.enabled = config?.enabled ?? false;
    this.apiBaseUrl = config?.apiBaseUrl ?? '';
    this.apiKey = config?.apiKey ?? '';
  }

  /**
   * 上传单条协作关系事件
   * 返回:
   *   2xx — 上传成功
   *   400 — 字段/数量/时间不合规
   *   413 — 请求体超过 64 KiB
   *   429 — 限流，稍后重试
   */
  async uploadEvent(event) {
    if (!this.enabled || !this.apiBaseUrl) return;
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/ingest/collaborations/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-witty-api-key': this.apiKey,
        },
        body: JSON.stringify(event),
      });

      if (response.ok) {
        return true;
      }

      return null;
    } catch {
      return null;
    }
  }
}

export { AgentInsightClient, generateCollaborationId, generateEventId };
