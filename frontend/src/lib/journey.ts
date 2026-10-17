import type { AgentResults, ChatMessage, ConversationTurn, RequiredField } from "../types";

export const DEFAULT_PLACEHOLDER = "例如：下周五去成都玩三天，两个人，预算 5000 元，喜欢美食和慢节奏的旅行。";
export const FIELD_LABELS: Record<RequiredField, string> = {
  destination: "目的地", startDate: "出发日期", duration: "旅行天数", budget: "预算",
};
export interface ThreadMessage extends ChatMessage { send?: boolean }
export type Phase = "idle" | "planning" | "done" | "clarify" | "error" | "stopped";
export type Stage = "analysis" | "weather" | "planner";
export const STAGES: Stage[] = ["analysis", "weather", "planner"];

export function buildHistory(thread: ThreadMessage[]): ConversationTurn[] {
  const turns = thread.filter((message) => message.send !== false && !message.isError)
    .map(({ role, content }) => ({ role, content: content.slice(0, 5000) })).slice(-20);
  let total = turns.reduce((sum, item) => sum + item.content.length, 0);
  while (total > 20000) total -= turns.shift()!.content.length;
  return turns;
}

function parseDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? new Date(+match[1], +match[2] - 1, +match[3]) : null;
}
export function shortDate(iso: string) {
  const date = parseDate(iso);
  return date ? `${date.getMonth() + 1}月${date.getDate()}日` : iso || "日期待定";
}
export function longDate(iso: string) {
  const date = parseDate(iso);
  return date ? `${date.getFullYear()}年${shortDate(iso)}` : iso || "日期待定";
}
export function weekday(iso: string) {
  const date = parseDate(iso);
  return date ? ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()] : "";
}
export function dateRange(start: string, end: string) {
  return start ? `${start.slice(0, 4)}年 ${shortDate(start)}${end && end !== start ? ` — ${shortDate(end)}` : ""}` : "日期待定";
}
export function formatBudget(value: string) {
  const text = String(value || "").trim();
  return text.replace(/^(?:总)?预算\s*/, "").replace(/，.*$/, "")
    .replace(/,\s*(?=[^\d]|$).*$/, "").replace(/\s+/g, " ").replace(/(\d)(元)/g, "$1 $2").trim() || text || "未指定";
}
export function temperature(value: string) {
  const text = String(value ?? "").trim();
  if (!text || text === "无天气信息") return "";
  const match = /^(-?\d+(?:\.\d+)?)\s*(?:°\s*C|℃|°)?$/i.exec(text);
  return match ? `${Math.round(+match[1])}°` : text;
}
export function weatherKind(value: string) {
  if (/雪/.test(value)) return "snow";
  if (/雨|雷/.test(value)) return "rain";
  if (/雾|霾|沙|尘/.test(value)) return "fog";
  if (/风/.test(value)) return "wind";
  return /晴|阳/.test(value) ? "sun" : "cloud";
}
export function clarifyPlaceholder(missing: RequiredField[]) {
  return missing.length ? `补充${missing.slice(0, 2).map((field) => FIELD_LABELS[field]).join("和")}，继续这次旅行规划…` : "补充一些信息，继续这次旅行规划…";
}
export function resultSummary(result: AgentResults) {
  const a = result.analysis.json;
  return `行程已经准备好了。\n${a.destination} · ${a.duration} 天\n${longDate(a.startDate)} 出发 · 预算 ${formatBudget(a.budget)}。\n可以在工作台查看完整报告，也可以继续告诉我想调整什么。`;
}
export function planToText(result: AgentResults, demo = false) {
  const a = result.analysis.json;
  const end = a.allDates[a.allDates.length - 1] || a.startDate;
  const lines = [demo ? "【示例行程 · 仅供界面展示】" : "【远行 · 旅行计划】", `【${a.destination} · ${a.duration} 天】`,
    `日期：${longDate(a.startDate)}${end !== a.startDate ? ` — ${longDate(end)}` : ""}`,
    `预算：${formatBudget(a.budget)}`, `同行：${a.travelers} 人`, `偏好：${a.preferences.join("、")}`, "", "【天气】"];
  result.weather.json.forEach((day) => {
    lines.push(`${shortDate(day.date)}  ${day.source === "unavailable" ? "暂无预报，出发前请再次查询" : `${day.weather} ${temperature(day.high)}/${temperature(day.low)}  ${day.recommendations}`}`);
  });
  lines.push("", "【行程】");
  result.planner.json.forEach((day, index) => {
    lines.push(`第${index + 1}天 · ${longDate(day.date)} ${weekday(day.date)}`);
    day.plan.forEach((activity) => {
      lines.push(`  ${activity.time}  ${activity.activity}`);
      if (activity.notes) lines.push(`    · ${activity.notes}`);
      if (activity.source) lines.push(`    来源：${activity.source}`);
    });
    if (day.generalTips) lines.push(`  当日建议：${day.generalTips}`);
    lines.push("");
  });
  if (a.extraRequirements) lines.push(`补充要求：${a.extraRequirements}`);
  lines.push("由远行 AI 生成，出行前请核实开放时间与价格。");
  return lines.join("\n");
}
