import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// 测试实际前端传输代码，只有浏览器 fetch 被替换。
const source = await readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replaceAll("import.meta.env.VITE_API_BASE_URL", "undefined");
const { streamPlan } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const encoder = new TextEncoder();
const result = { analysis: { json: { destination: "成都" } }, weather: {}, planner: {} };
const record = { id: "record-1", name: "需求分析", content: "成都，两日游" };
const request = { query: "明天去成都两天", mode: "standard", onRecord() {} };

function responseFromChunks(chunks, onCancel) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      // 保持流打开，确认前端收到终结事件会取消 reader。
    },
    cancel() { onCancel?.(); },
  }), { headers: { "Content-Type": "application/x-ndjson" } });
}

test("解析跨字节中文、跨块事件、心跳以及没有末尾换行的结果", async (t) => {
  const wire = encoder.encode([
    JSON.stringify({ event: "record", data: record }),
    JSON.stringify({ event: "heartbeat", data: null }),
    JSON.stringify({ event: "result", data: result }),
  ].join("\n"));
  const chunks = Array.from(wire, (byte) => Uint8Array.of(byte));
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "/api/v1/travel/plan/stream");
    assert.deepEqual(JSON.parse(options.body), { query: request.query, mode: "standard", history: [] });
    // 最后一行没有换行时，使用已关闭的流验证 decoder 的 flush。
    return new Response(new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(chunk));
        controller.close();
      },
    }), { headers: { "Content-Type": "application/x-ndjson" } });
  });
  const records = [];
  assert.deepEqual(await streamPlan({ ...request, onRecord: (item) => records.push(item) }), { kind: "result", result });
  assert.deepEqual(records, [record]);
});

test("结果到达后释放连接", async (t) => {
  let cancelled = false;
  t.mock.method(globalThis, "fetch", async () => responseFromChunks([
    encoder.encode(JSON.stringify({ event: "result", data: result }) + "\n"),
  ], () => { cancelled = true; }));
  assert.deepEqual(await streamPlan(request), { kind: "result", result });
  assert.equal(cancelled, true);
});

test("流内错误包含后端请求 ID 并释放连接", async (t) => {
  let cancelled = false;
  t.mock.method(globalThis, "fetch", async () => responseFromChunks([
    encoder.encode(JSON.stringify({ event: "error", data: { message: "模型超时", request_id: "req-123" } }) + "\n"),
  ], () => { cancelled = true; }));
  await assert.rejects(streamPlan(request), /模型超时.*req-123/);
  assert.equal(cancelled, true);
});

test("HTTP 错误显示后端配置提示", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ msg: "请填写 DEEPSEEK_API_KEY" }, { status: 503 }));
  await assert.rejects(streamPlan(request), /请填写 DEEPSEEK_API_KEY/);
});

test("代理返回 HTML 时提示检查 Python 后端地址", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("<html></html>", { headers: { "Content-Type": "text/html" } }));
  await assert.rejects(streamPlan(request), /代理.*Python 后端/);
});

test("连接提前结束时拒绝不完整的计划", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("", { headers: { "Content-Type": "application/x-ndjson" } }));
  await assert.rejects(streamPlan(request), /没有收到完整旅行计划/);
});

for (const line of ["not-json", "null"]) {
  test(`无效进度数据 ${line} 返回明确错误`, async (t) => {
    t.mock.method(globalThis, "fetch", async () => responseFromChunks([encoder.encode(line + "\n")]));
    await assert.rejects(streamPlan(request), /无效的进度数据/);
  });
}

test("用户取消时传递 AbortSignal 并保留取消异常", async (t) => {
  const controller = new AbortController();
  const aborted = new DOMException("Aborted", "AbortError");
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(options.signal, controller.signal);
    controller.abort();
    throw aborted;
  });
  await assert.rejects(streamPlan({ ...request, signal: controller.signal }), (error) => error === aborted);
});

test("网络断开显示启动后端提示", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("fetch failed"); });
  await assert.rejects(streamPlan(request), /确认 FastAPI 已启动/);
});

test("信息不足时返回追问，并传递之前的对话", async (t) => {
  const history = [{ role: "user", content: "想去成都" }, { role: "assistant", content: "计划哪天出发，玩几天？" }];
  const clarification = { message: "总预算是多少？", missingFields: ["budget"], draft: { destination: "成都", duration: 2, startDate: "2026-10-18" } };
  let cancelled = false;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body).history, history);
    return responseFromChunks([encoder.encode(JSON.stringify({ event: "clarification", data: clarification }) + "\n")], () => { cancelled = true; });
  });
  assert.deepEqual(await streamPlan({ ...request, query: "明天出发，两天", history }), { kind: "clarification", clarification });
  assert.equal(cancelled, true);
});
