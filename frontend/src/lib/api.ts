import type { AgentResults, Clarification, ConversationTurn, PlanReply, RecordItem } from "../types";

interface PlanStreamOptions {
  query: string;
  mode: "standard" | "smart";
  onRecord: (record: RecordItem) => void;
  signal?: AbortSignal;
  history?: ConversationTurn[];
  apiBase?: string;
}

type PlanEvent =
  | { event: "record"; data: RecordItem }
  | { event: "result"; data: AgentResults }
  | { event: "clarification"; data: Clarification }
  | { event: "error"; data: { message: string; request_id?: string } }
  | { event: "heartbeat"; data: null };

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "";

export class PlanError extends Error {
  constructor(message: string, public requestId = "") {
    super(message);
    this.name = "PlanError";
  }
}

export async function streamPlan(options: PlanStreamOptions): Promise<PlanReply> {
  let response: Response;
  try {
    response = await fetch(`${(options.apiBase ?? apiBaseUrl).replace(/\/+$/, "")}/api/v1/travel/plan/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
      body: JSON.stringify({ query: options.query, mode: options.mode, history: options.history ?? [] }),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error("无法连接 Python 后端，请确认 FastAPI 已启动，并检查后端地址配置");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { msg?: string; request_id?: string } | null;
    throw new PlanError(body?.msg || `后端请求失败（HTTP ${response.status}）`, body?.request_id || response.headers.get("X-Request-ID") || "");
  }
  if (!response.headers.get("Content-Type")?.includes("application/x-ndjson")) {
    throw new Error("后端未返回执行进度流，请检查 /api 代理是否指向 Python 后端");
  }
  if (!response.body) throw new Error("当前浏览器无法读取执行进度流");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const consumeLine = (line: string): PlanReply | undefined => {
    if (!line.trim()) return;
    let event: PlanEvent;
    try {
      event = JSON.parse(line) as PlanEvent;
    } catch {
      throw new Error("后端返回了无效的进度数据，请重试");
    }
    if (!event || typeof event !== "object" || !("event" in event)) {
      throw new Error("后端返回了无效的进度数据，请重试");
    }
    if (event.event === "record") options.onRecord(event.data);
    else if (event.event === "result") return { kind: "result", result: event.data };
    else if (event.event === "clarification") return { kind: "clarification", clarification: event.data };
    else if (event.event === "error") {
      const reference = event.data.request_id ? `（请求 ID：${event.data.request_id}）` : "";
      throw new PlanError(event.data.message + reference, event.data.request_id);
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const result = consumeLine(line);
        if (result) return result;
        newline = buffer.indexOf("\n");
      }
      if (done) {
        const result = consumeLine(buffer);
        if (result) return result;
        throw new Error("与后端的连接已结束，但没有收到完整旅行计划，请重试");
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
