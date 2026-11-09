/**
 * @file src/plugins/opencode/prompt_text.ts
 *
 * V2 `event.prompt.text` 的编解码辅助。
 *
 * 实测（opencode v2.0.18）：prompt hook 收到的 `event.prompt.text` 是 JSON
 * 编码后的字符串（形如 `"\"/design 冒烟\""`），而 `event.prompt.parts`
 * 为 undefined。直接对该值做斜杠命令正则匹配或拼接注入都会失效，
 * 因此统一先解码，写回时按原编码还原。
 */

export interface DecodedPromptText {
  text: string;
  encoded: boolean;
}

export function decodePromptText(raw: unknown): DecodedPromptText {
  if (typeof raw !== 'string') return { text: '', encoded: false };
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') || trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === 'string') return { text: parsed, encoded: true };
      if (Array.isArray(parsed)) {
        const joined = parsed
          .map((part: unknown) => {
            if (typeof part === 'string') return part;
            if (part && typeof part === 'object') {
              const record = part as { text?: unknown; content?: unknown };
              return typeof record.text === 'string'
                ? record.text
                : typeof record.content === 'string'
                  ? record.content
                  : '';
            }
            return '';
          })
          .filter((s: string) => s.length > 0)
          .join('\n');
        return { text: joined, encoded: true };
      }
    } catch {
      /* 不是 JSON，按原文处理 */
    }
  }
  return { text: raw, encoded: false };
}

export function encodePromptText(text: string, encoded: boolean): string {
  return encoded ? JSON.stringify(text) : text;
}
