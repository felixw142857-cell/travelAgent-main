import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}
const { buildHistory, planToText, shortDate, weekday, temperature } = await loadModule("../src/lib/journey.ts");
const { DEMO_RESULT } = await loadModule("../src/lib/demo.ts");

test("示例消息和错误提示不会污染真实规划上下文", () => {
  const thread = [
    { role: "assistant", content: "示例", send: false },
    { role: "user", content: "去成都" },
    { role: "assistant", content: "哪天出发？" },
    { role: "assistant", content: "连接失败", isError: true },
  ];
  assert.deepEqual(buildHistory(thread), [{ role: "user", content: "去成都" }, { role: "assistant", content: "哪天出发？" }]);
});
test("历史记录保留最近 20 轮，且总长度不超过后端限制", () => {
  const turns = Array.from({ length: 25 }, (_, index) => ({ role: "user", content: `${index}:` + "旅".repeat(5000) }));
  const history = buildHistory(turns);
  assert.equal(history.length, 4);
  assert.equal(history.reduce((sum, item) => sum + item.content.length, 0), 20000);
  assert.ok(history[0].content.startsWith("21:"));
  assert.equal(buildHistory(Array.from({ length: 25 }, () => ({ role: "user", content: "成都" }))).length, 20);
});
test("复制行程保留景点来源及待核实说明", () => {
  const text = planToText(DEMO_RESULT);
  assert.match(text, /成都/);
  assert.match(text, /第3天/);
  assert.match(text, /openstreetmap · ODbL-1.0/);
  assert.match(text, /model（未指定候选景点，待核实）/);
  assert.match(planToText(DEMO_RESULT, true), /示例行程 · 仅供界面展示/);
});
test("天气不可用时导出不会把占位温度当成真实预报", () => {
  const result = structuredClone(DEMO_RESULT);
  result.weather.json = [{ date: "2026-10-23", weather: "晴", high: "30", low: "20", recommendations: "测试", source: "unavailable" }];
  const text = planToText(result);
  assert.match(text, /暂无预报，出发前请再次查询/);
  assert.doesNotMatch(text, /晴 30°/);
});
test("日期按当地日历展示，温度支持负数和单位", () => {
  assert.equal(shortDate("2026-10-23"), "10月23日");
  assert.equal(weekday("2026-10-23"), "周五");
  assert.equal(temperature("-2.4℃"), "-2°");
  assert.equal(temperature("无天气信息"), "");
});
