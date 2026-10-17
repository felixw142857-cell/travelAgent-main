import { useEffect, useRef } from "react";
import { DEFAULT_PLACEHOLDER, FIELD_LABELS, clarifyPlaceholder } from "../lib/journey";
import type { ThreadMessage } from "../lib/journey";
import type { Clarification } from "../types";
import { Icon } from "./VoyageArt";

interface Props {
  query: string; onQuery: (query: string) => void; planning: boolean; hasResult: boolean;
  clarification: Clarification | null; mode: "standard" | "smart";
  onMode: (mode: "standard" | "smart") => void; onSubmit: () => void; onStop: () => void;
}
const examples = [
  ["成都 · 3天 · 美食", "下周五去成都玩三天，两个人，预算 5000 元，喜欢美食和慢节奏的旅行。"],
  ["西安 · 4天 · 历史", "下个月去西安四天，预算不限，想多看历史遗迹和博物馆。"],
  ["杭州 · 2天 · 西湖", "十月中旬去杭州两天，预算 2000 元，想住西湖边，行程轻松一点。"],
];
export function JourneyComposer({ query, onQuery, planning, hasResult, clarification, mode, onMode, onSubmit, onStop }: Props) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = textarea.current;
    if (element) { element.style.height = "auto"; element.style.height = `${Math.min(Math.max(element.scrollHeight, 142), 240)}px`; }
  }, [query]);
  return <section className="composer card" aria-labelledby="composerTitle">
    <div className="card-head"><div><p className="kicker">STEP 01 · TELL ME</p><h2 id="composerTitle">从哪里开始？</h2></div><span className="mode-badge">{mode === "smart" ? "智能编排" : "标准编排"}</span></div>
    <form noValidate onSubmit={(event) => { event.preventDefault(); onSubmit(); if (!query.trim()) textarea.current?.focus(); }}>
      <div className="field"><label className="sr-only" htmlFor="query">旅行需求</label>
        <textarea id="query" name="query" rows={5} maxLength={5000} spellCheck={false} ref={textarea} value={query} onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); onSubmit(); } }}
          placeholder={clarification ? clarifyPlaceholder(clarification.missingFields) : DEFAULT_PLACEHOLDER} />
        <div className="field__foot"><span className="field__hint">目的地 · 日期 · 天数 · 预算</span><span className={`field__count ${query.length > 4500 ? "is-near" : ""}`}>{query.length} / 5000</span></div></div>
      <div className="chips" aria-label="示例需求">{examples.map(([label, text]) => <button key={label} type="button" className="chip" disabled={planning} onClick={() => { onQuery(text); textarea.current?.focus(); }}><span className="chip__dot" />{label}</button>)}</div>
      <div className="composer__row"><div className="mode" role="group" aria-label="编排模式">{(["standard", "smart"] as const).map((value) => <button key={value} type="button" disabled={planning} className={`mode__opt ${mode === value ? "is-active" : ""}`} aria-pressed={mode === value} onClick={() => onMode(value)}>{value === "standard" ? "标准" : "智能"}</button>)}</div>
        <p className="mode__hint">{mode === "smart" ? "主管代理按需选择步骤，适合复杂或需要动态调整的需求" : "固定顺序：需求分析 → 天气查询 → 行程编排"}</p></div>
      <div className="composer__actions"><button type="submit" className="btn btn--primary" disabled={planning}><span className="btn__label">{planning ? "规划中…" : clarification ? "补充并继续" : hasResult ? "继续调整" : "开始规划"}</span><span className="btn__arrow"><Icon name="arrow" /></span></button>
        {planning && <button type="button" className="btn btn--stop" onClick={onStop}><Icon name="stop" />停止</button>}</div>
      <p className="form-hint"><kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Enter</kbd> 快速开始 · 信息不全也可以先聊</p>
    </form>
  </section>;
}
export function Conversation({ thread, onNewTrip }: { thread: ThreadMessage[]; onNewTrip: () => void }) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [thread]);
  if (!thread.length) return null;
  return <section className="thread card" aria-labelledby="threadTitle"><div className="card-head card-head--compact"><div><p className="kicker">CONVERSATION</p><h2 id="threadTitle">本次对话</h2></div><button className="text-btn" type="button" onClick={onNewTrip}>新建旅程</button></div>
    <div className="thread__list" ref={list} aria-live="polite">{thread.slice(-16).map((item) => <div key={item.id} className={`bubble bubble--${item.role}${item.isError ? " bubble--error" : ""}`}>
      {item.role === "assistant" && <span className="bubble__avatar"><Icon name={item.isError ? "alert" : "spark"} /></span>}
      <div className="bubble__body" style={{ whiteSpace: "pre-wrap" }}>{item.content}{!!item.missingFields?.length && <div className="bubble__missing">{item.missingFields.map((field) => <span className="mini-tag" key={field}>{FIELD_LABELS[field]}</span>)}</div>}</div>
    </div>)}</div>
  </section>;
}
