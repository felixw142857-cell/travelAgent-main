import type { AgentResults, Clarification } from "../types";
import { dateRange, FIELD_LABELS, formatBudget, planToText, shortDate, temperature, weatherKind, weekday } from "../lib/journey";
import { Icon } from "./VoyageArt";

function fallbackCopy(text: string) {
  const area = document.createElement("textarea");
  area.value = text;
  area.readOnly = true;
  area.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  document.body.append(area);
  area.select();
  try { if (!document.execCommand("copy")) throw new Error("复制失败"); }
  finally { area.remove(); }
}
export default function JourneyReport({ result, demo, onNewTrip, notify }: { result: AgentResults; demo: boolean; onNewTrip: () => void; notify: (text: string) => void }) {
  const a = result.analysis.json, weather = result.weather.json, days = result.planner.json;
  const start = a.startDate || a.allDates[0], end = a.allDates[a.allDates.length - 1] || start;
  const sourceCount = weather.filter((day) => day.source === "qweather").length;
  const sourceNote = !weather.length ? "暂无天气数据" : sourceCount === weather.length ? "和风天气 · 实时预报" : sourceCount ? "部分日期天气缺失" : "天气数据暂不可用";
  async function copy() {
    const text = planToText(result, demo);
    try {
      try { if (navigator.clipboard) await navigator.clipboard.writeText(text); else fallbackCopy(text); }
      catch { fallbackCopy(text); }
      notify("行程已复制到剪贴板");
    } catch { notify("复制失败，请检查浏览器的剪贴板权限，或导出 JSON"); }
  }
  function download() {
    const blob = new Blob([JSON.stringify(demo ? { ...result, demo: true } : result, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url;
    link.download = `travel-plan-${a.destination}-${a.startDate}${demo ? "-sample" : ""}`.replace(/[\\/:*?"<>|\s]/g, "-") + ".json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    notify("JSON 已导出");
  }
  return <div className="report">
    <section className="report__cover"><svg className="cover__route" viewBox="0 0 300 170" fill="none" aria-hidden="true"><path d="M6 150C58 132 54 76 114 72s58 36 96 10 46-42 84-54" stroke="rgba(248,243,232,.28)" strokeWidth="1.2" strokeDasharray="4 7" /><circle cx="114" cy="72" r="3" fill="rgba(248,243,232,.6)" /><circle cx="210" cy="82" r="3" fill="rgba(231,196,129,.9)" /></svg>
      <div className="cover__top"><p className="cover__kicker">TRAVEL DOSSIER · {start?.slice(0, 4) || "JOURNEY"}</p><span className={`cover__stamp ${demo ? "cover__stamp--demo" : ""}`}>{demo ? <>SAMPLE<br />示例</> : <>AI<br />PLANNED</>}</span></div>
      <div className="cover__main"><p className="cover__place">DESTINATION / 目的地</p><h2 className="cover__title">{a.destination}<span>{a.duration} 日</span></h2><p className="cover__dates">{dateRange(start, end)}{weekday(start) && ` · ${weekday(start)}出发`}</p></div>
      <div className="cover__meta"><span className="meta-chip" title={a.budget}><Icon name="wallet" />预算 · {formatBudget(a.budget)}</span><span className="meta-chip"><Icon name="users" />{a.travelers} 人</span>{!!a.preferences.length && <span className="meta-chip"><Icon name="spark" />{a.preferences.join(" · ")}</span>}</div>
      <div className="cover__actions"><button className="cover-btn cover-btn--primary" onClick={() => void copy()}><Icon name="copy" />复制行程</button><button className="cover-btn" onClick={download}><Icon name="download" />导出 JSON</button><button className="cover-btn" onClick={onNewTrip}><Icon name="refresh" />新建旅程</button></div><span className="cover__ghost" aria-hidden="true">{a.destination}</span>
    </section>
    <section className="report__section" aria-labelledby="weatherTitle"><div className="section-head"><div><p className="kicker">ALONG THE WAY</p><h3 id="weatherTitle">沿途天气</h3></div><p className="section-note">{sourceNote}</p></div>
      <div className="weather-grid">{weather.length ? weather.map((day, index) => {
        const kind = weatherKind(day.weather), unavailable = day.source === "unavailable" || !day.weather || day.weather === "无天气信息";
        const tip = unavailable ? "暂无天气预报，请在出发前查询实际天气。" : day.recommendations || "暂无出行建议。";
        return <article key={`${day.date}-${index}`} className={`weather-card weather-card--${kind}${unavailable ? " weather-card--muted" : ""}`} style={{ animationDelay: `${Math.min(index * 45, 240)}ms` }}><div className="weather-card__top"><span className="weather-card__icon"><Icon name={kind} /></span><time className="weather-card__date">{shortDate(day.date)}</time></div><div className="weather-card__temp"><b>{unavailable ? "—" : temperature(day.high) || "—"}</b><span>{unavailable ? "" : temperature(day.low)}</span></div><p className="weather-card__cond">{unavailable ? "暂无预报" : day.weather}</p><p className="weather-card__tip" title={tip}>{tip}</p></article>;
      }) : <div className="empty-report">暂时没有可用的天气数据，出发前请再次查询。</div>}</div>
    </section>
    <section className="report__section" aria-labelledby="itineraryTitle"><div className="section-head"><div><p className="kicker">DAY BY DAY</p><h3 id="itineraryTitle">逐日行程</h3></div><p className="section-note">{days.length} 天 · {days.reduce((sum, day) => sum + day.plan.length, 0)} 个安排</p></div>
      <div className="itinerary">{days.length ? days.map((day, index) => <article className="day-card" key={`${day.date}-${index}`} style={{ animationDelay: `${Math.min(index * 55, 280)}ms` }}><div className="day-card__marker"><span>DAY</span><b>{String(index + 1).padStart(2, "0")}</b><small>{shortDate(day.date)}<br />{weekday(day.date)}</small></div>
        <div className="day-card__body"><div className="day-card__head"><div><h4>{shortDate(day.date)} · {weekday(day.date)}</h4><p>第 {index + 1} 天 · {day.plan.length} 个安排</p></div><span className="day-card__count">{day.plan.length} 站</span></div>
          <ol className="stops">{day.plan.length ? day.plan.map((activity, stopIndex) => <li className="stop" key={stopIndex}><time className="stop__time">{activity.time || "时间待定"}</time><span className="stop__dot" aria-hidden="true" /><div className="stop__body"><div className="stop__head"><h5 className="stop__title">{activity.activity}</h5>{activity.source && <span className={`tag ${activity.source.startsWith("model") ? "tag--warn" : "tag--source"}`} title={activity.source}>{activity.source.startsWith("model") ? "待核实" : "景点库已校验"}</span>}</div>{activity.notes && <p className="stop__notes" style={{ whiteSpace: "pre-wrap" }}>{activity.notes}</p>}</div></li>) : <li className="stop"><span /><span className="stop__dot" /><div className="stop__body"><p className="stop__notes">暂无具体安排，可根据当天状态自由探索。</p></div></li>}</ol>
          {day.generalTips && <p className="day-tip"><Icon name="leaf" /><span style={{ whiteSpace: "pre-wrap" }}>{day.generalTips}</span></p>}</div>
      </article>) : <div className="empty-report">行程数据为空，请重新规划。</div>}</div>
    </section>
    {(a.extraRequirements || result.planner.text || result.analysis.text) && <section className="report__notes">{a.extraRequirements && <div className="note-grid"><div className="note-item"><span>你的补充要求</span><p style={{ whiteSpace: "pre-wrap" }}>{a.extraRequirements}</p></div></div>}
      {(result.planner.text || result.analysis.text) && <details className="notes-fold"><summary><span className="summary-left"><Icon name="book" />阅读规划师的完整手记</span></summary><div className="notes-fold__body">{result.planner.text && <div className="prewrap prewrap--serif" style={{ whiteSpace: "pre-wrap" }}>{result.planner.text}</div>}{result.analysis.text && <div className="prewrap" style={{ whiteSpace: "pre-wrap" }}>{result.analysis.text}</div>}</div></details>}</section>}
    <p className="disclaimer"><Icon name="alert" /><span>{demo ? "以上为示例数据，仅用于展示界面。开始你的规划后，将使用真实的后端结果。" : "行程由 AI 生成，景点开放时间、门票与交通请以官方信息为准。天气数据来自和风天气，未覆盖日期已明确标注。"}</span></p>
  </div>;
}
export function ClarificationPanel({ clarification }: { clarification: Clarification }) {
  const d = clarification.draft;
  const items = [["目的地", d.destination], ["出发日期", d.startDate], ["旅行天数", d.duration ? `${d.duration} 天` : ""], ["预算", d.budget], ["同行人数", d.travelers ? `${d.travelers} 人` : ""], ["偏好", d.preferences.join("、")]];
  return <div className="clarify"><div className="clarify__marks" aria-hidden="true"><span /><span /><span /></div><div className="clarify__icon"><Icon name="pin" /></div><div className="clarify__body"><p className="kicker">ONE MORE THING</p><h2>还差一点信息</h2><p className="clarify__message" style={{ whiteSpace: "pre-wrap" }}>{clarification.message}</p><div className="clarify__missing">{!!clarification.missingFields.length && <span className="label">还需要</span>}{clarification.missingFields.map((field) => <span className="missing-field" key={field}>{FIELD_LABELS[field]}</span>)}</div><div className="draft-grid">{items.map(([label, value]) => <div key={label} className={`draft-item ${value ? "" : "is-empty"}`}><span>{label}</span><b title={value || "待补充"}>{value || "待补充"}</b></div>)}</div><p className="clarify__hint"><Icon name="arrow" />在输入框补充后继续，已经填写的信息会保留。</p></div></div>;
}
