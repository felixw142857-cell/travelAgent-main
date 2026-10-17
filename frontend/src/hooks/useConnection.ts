import { useCallback, useEffect, useRef, useState } from "react";

const API_STORAGE = "voyage.apiBase.v1";
export function readStorage(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function writeStorage(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* 私密浏览等场景仍可在本页使用。 */ }
}
export function normalizeApiBase(value: string) {
  try {
    const url = new URL(value.trim());
    return /^(https?):$/.test(url.protocol) && !url.username && !url.password
      ? `${url.origin}${url.pathname}`.replace(/\/+$/, "") : null;
  } catch { return null; }
}
interface Metadata<T> { data?: T; msg?: string }
interface Health { service: string; status: string; environment: string; uptime_seconds: number }
interface Version { version: string; app_title: string }
async function metadata<T>(base: string, path: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = window.setTimeout(abort, 5500);
  try {
    const response = await fetch(`${base}/api/v1/base/${path}`, { headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal });
    const body: Metadata<T> = await response.json();
    if (!response.ok || !body.data) throw new Error(body.msg || `服务响应异常（HTTP ${response.status}）`);
    return body.data;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
export function describeConnectionError(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") return "连接超时，请确认 FastAPI 已启动";
  return error instanceof TypeError ? "无法建立连接，请确认后端地址与 CORS 设置" : error instanceof Error ? error.message : "连接失败";
}
export async function testConnection(base: string) {
  return metadata<Health>(base, "health");
}
export function useConnection() {
  const [apiBase, setApiBase] = useState(() => {
    const query = new URLSearchParams(location.search).get("api");
    const stored = readStorage(API_STORAGE);
    return normalizeApiBase(query || stored || "") ?? import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") ?? "";
  });
  const [connection, setConnection] = useState<{ status: "checking" | "ok" | "fail"; title: string }>({ status: "checking", title: "正在检查后端连接" });
  const [version, setVersion] = useState("v0.1.0");
  const active = useRef<AbortController | null>(null);
  const check = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setConnection({ status: "checking", title: "正在检查后端连接" });
    try {
      const health = await metadata<Health>(apiBase, "health", controller.signal);
      if (controller.signal.aborted) return;
      setConnection({ status: "ok", title: `${health.service || "旅行后端"} · 点击重新检查` });
      try {
        const data = await metadata<Version>(apiBase, "version", controller.signal);
        if (!controller.signal.aborted) setVersion(`v${data.version} · ${data.app_title}`);
      } catch { /* 版本查询不影响主服务状态。 */ }
    } catch (error) {
      if (!controller.signal.aborted) setConnection({ status: "fail", title: `${describeConnectionError(error)} · 点击重新检查` });
    }
  }, [apiBase]);
  useEffect(() => { setVersion("v0.1.0"); void check(); return () => active.current?.abort(); }, [check]);
  function save(base: string) {
    const normalized = base === location.origin ? "" : base;
    writeStorage(API_STORAGE, base);
    setApiBase(normalized);
    if (normalized === apiBase) void check();
  }
  return { apiBase, connection, version, check, save, docsUrl: `${apiBase}/docs` };
}
