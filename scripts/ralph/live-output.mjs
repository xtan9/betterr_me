import { StringDecoder } from "node:string_decoder";
import { redactCredentialPatterns } from "./queue.mjs";

const MAX_LIVE_TEXT_LENGTH = 2000;

function contextPrefix(issueNumber, phase) {
  return `[ralph][issue #${issueNumber}][${phase}]`;
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, "")
    .replace(
      /[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g,
      "",
    )
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" | ");
}

function redact(value, sensitiveValues) {
  let safe = normalizeText(value);
  for (const sensitiveValue of sensitiveValues) {
    if (sensitiveValue) safe = safe.replaceAll(sensitiveValue, "[REDACTED]");
  }
  safe = redactCredentialPatterns(safe);
  if (safe.length <= MAX_LIVE_TEXT_LENGTH) return safe;
  let visible = safe.slice(0, MAX_LIVE_TEXT_LENGTH);
  const partialRedaction = visible.lastIndexOf("[");
  if (
    partialRedaction >= 0 &&
    safe.slice(partialRedaction).startsWith("[REDACTED]")
  ) {
    visible = `${visible.slice(0, partialRedaction)}[REDACTED]`;
  }
  return `${visible}... [truncated]`;
}

function errorMessage(event) {
  if (typeof event.message === "string") return event.message;
  if (typeof event.error === "string") return event.error;
  if (typeof event.error?.message === "string") return event.error.message;
  return "unknown Codex error";
}

function fileChangeLines(item) {
  const changes = Array.isArray(item.changes) ? item.changes : [];
  return changes
    .filter((change) => change && typeof change.path === "string")
    .map((change) => `file ${change.kind ?? "changed"}: ${change.path}`);
}

function formatEvent(event) {
  if (!event || typeof event !== "object") return [];
  if (event.type === "thread.started") return ["Codex session started"];
  if (event.type === "turn.started") return ["Codex turn started"];
  if (event.type === "turn.failed") {
    return [`turn failed: ${errorMessage(event)}`];
  }
  if (event.type === "error") return [`Codex error: ${errorMessage(event)}`];
  if (event.type === "turn.completed") {
    const usage = event.usage ?? {};
    if (
      Number.isFinite(usage.input_tokens) &&
      Number.isFinite(usage.cached_input_tokens) &&
      Number.isFinite(usage.output_tokens)
    ) {
      return [
        `turn completed: ${usage.input_tokens} input, ${usage.cached_input_tokens} cached, ${usage.output_tokens} output tokens`,
      ];
    }
    return ["turn completed"];
  }
  if (typeof event.type !== "string" || !event.type.startsWith("item.")) return [];

  const item = event.item ?? {};
  if (item.type === "reasoning") return [];
  if (item.type === "agent_message" && event.type === "item.completed") {
    return typeof item.text === "string" ? [item.text] : [];
  }
  if (item.type === "command_execution") {
    const command = item.command ?? "unknown command";
    if (event.type === "item.started") return [`command started: ${command}`];
    if (event.type === "item.completed") {
      const exitCode = item.exit_code ?? item.exitCode;
      const outcome = Number.isInteger(exitCode)
        ? `completed (exit ${exitCode})`
        : item.status ?? "completed";
      return [`command ${outcome}: ${command}`];
    }
  }
  if (
    (item.type === "file_change" || item.type === "file_changes") &&
    event.type === "item.completed"
  ) {
    return fileChangeLines(item);
  }
  if (item.type === "mcp_tool_call") {
    const name = [item.server, item.tool, item.name].filter(Boolean).join("/");
    return name
      ? [`MCP ${event.type === "item.started" ? "started" : "completed"}: ${name}`]
      : [];
  }
  if (item.type === "web_search" && event.type === "item.started") {
    return item.query ? [`web search: ${item.query}`] : ["web search started"];
  }
  return [];
}

/**
 * @param {unknown} message
 * @param {string[]} [sensitiveValues]
 */
export function formatControllerStatus(message, sensitiveValues = []) {
  return `[ralph] ${redact(message, sensitiveValues)}`;
}

/**
 * @param {{
 *   issueNumber: number,
 *   phase: string,
 *   sensitiveValues?: string[],
 *   writeLine: (line: string) => void,
 * }} options
 */
export function createCodexJsonlRenderer({
  issueNumber,
  phase,
  sensitiveValues = [],
  writeLine,
}) {
  const decoder = new StringDecoder("utf8");
  const prefix = contextPrefix(issueNumber, phase);
  let buffer = "";

  const emit = (message) => {
    const safe = redact(message, sensitiveValues);
    if (safe) writeLine(`${prefix} ${safe}`);
  };

  const consumeLine = (line) => {
    if (!line.trim()) return;
    try {
      for (const message of formatEvent(JSON.parse(line))) emit(message);
    } catch {
      emit("warning: malformed Codex JSON event");
    }
  };

  const consume = (text) => {
    buffer += text;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      consumeLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  };

  return {
    write(chunk) {
      consume(
        decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))),
      );
    },
    end() {
      consume(decoder.end());
      if (buffer) consumeLine(buffer);
      buffer = "";
    },
  };
}
