import { useEffect, useRef } from "react";
import { STAGES } from "../lib/journey";
import type { Phase, Stage } from "../lib/journey";
import type { RecordItem } from "../types";
import { Icon } from "./VoyageArt";

const labels: Record<string, string> = { AgentCoordinator: "协调器", SmartSupervisor: "智能调度", AnalyzerAgent: "需求分析", WeatherAgent: "天气助手", PlannerAgent: "行程规划师", GateKeeper: "输入整理", search_attractions: "景点检索", get_location_id: "地点解析", get_weather_by_location_id: "天气查询" };
const descriptions: Record<string, string> = { "执行 AnalyzerAgent": "开始分析旅行需求", "执行 WeatherAgent": "开始查询天气", "执行 PlannerAgent": "开始编排行程" };
const stageMeta = { analysis: ["compass", "需求分析", "确认关键信息"], weather: ["cloud", "天气查询", "适配每日行程"], planner: ["route", "行程编排", "写下每一天"] };
function stageClass(stage: Stage, phase: Phase, active: Stage | null) {
  const index = STAGES.indexOf(stage), current = STAGES.indexOf(active || "analysis");
  if (phase === "done") return "is-done";
  if (phase === "clarify") return index === 0 ? "is-done" : "is-skipped";
  if (phase === "stopped") return "is-skipped";
  if (phase === "error") return index < current ? "is-done" : index === current ? "is-error" : "is-skipped";
  if (phase === "planning" && active) return index < current ? "is-done" : index === current ? "is-active" : "";
  return "";
}
function EventRecord({ record }: { record: RecordItem }) {
  let content = String(record.content || "").trim();
  if (content && record.contentType === "json") { try { content = JSON.stringify(JSON.parse(content), null, 2); } catch { /* 显示原文。 */ } }
  if (content.length > 20000) content = `${content.slice(0, 20000)}\n…（内容过长，已截断）`;
  const type = ["supervisor", "tool", "agent"].includes(record.type) ? record.type : "agent";
  const date = new Date(record.createdAt);
  return <article className={`event event--${type}`}><div className="event__rail"><span className="event__dot"><Icon name={type === "supervisor" ? "compass" : type === "tool" ? "tool" : "bot"} /></span></div>
    <div className="event__body"><div className="event__top"><span className="event__name" title={record.name}>{labels[record.name] || record.name}</span><time className="event__time">{Number.isNaN(date.getTime()) ? "刚刚" : date.toLocaleTimeString("zh-CN", { hour12: false })}</time></div>
      <p className="event__desc">{descriptions[record.desc] || record.desc}</p>
      {content && <details className="event__details"><summary>查看{record.contentType === "json" ? " JSON 输出" : "输出"}</summary><pre className="event__pre">{content}</pre></details>}</div>
  </article>;
}
export default function JourneyProgress({ records, phase, activeStage, elapsed, showTimer }: { records: RecordItem[]; phase: Phase; activeStage: Stage | null; elapsed: number; showTimer: boolean }) {
  const timeline = useRef<HTMLDivElement>(null);
  useEffect(() => { if (timeline.current) timeline.current.scrollTop = timeline.current.scrollHeight; }, [records]);
  return <section className="progress card" aria-labelledby="progressTitle"><div className="card-head card-head--compact"><div><p className="kicker">STEP 02 · AGENTS</p><h2 id="progressTitle">执行进度</h2></div>
    {showTimer && <span className="timer">{String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}</span>}</div>
    <div className="stage-steps" aria-label="规划步骤">{STAGES.map((stage) => <div key={stage} className={`stage-step ${stageClass(stage, phase, activeStage)}`}><span className="stage-step__dot"><Icon name={stageMeta[stage][0]} /></span><div><b>{stageMeta[stage][1]}</b><small>{stageMeta[stage][2]}</small></div></div>)}</div>
    <div className="timeline" ref={timeline} aria-label="智能体执行记录">{records.length ? records.map((record, index) => <EventRecord record={record} key={`${record.id}-${index}`} />)
      : <div className="timeline__empty"><span className="timeline__empty-icon">{phase === "planning" ? <span className="live-dot" /> : <Icon name="spark" />}</span><p>{phase === "planning" ? "正在唤醒智能体…" : phase === "clarify" ? "等待补充信息" : "智能体的每一步都会出现在这里"}</p></div>}</div>
  </section>;
}
