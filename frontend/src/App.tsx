import { useCallback, useEffect, useRef, useState } from "react";
import ConnectionDialog from "./components/ConnectionDialog";
import { Conversation, JourneyComposer } from "./components/JourneyComposer";
import JourneyProgress from "./components/JourneyProgress";
import JourneyReport, { ClarificationPanel } from "./components/JourneyReport";
import { EmptyJourney, Hero, Icon, IconSprite } from "./components/VoyageArt";
import { readStorage, useConnection, writeStorage } from "./hooks/useConnection";
import { useTravelPlanning } from "./hooks/useTravelPlanning";

function App() {
  const [query, setQuery] = useState(() => (new URLSearchParams(location.search).get("query") || "").slice(0, 5000));
  const [mode, setMode] = useState<"standard" | "smart">("standard");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    const value = new URLSearchParams(location.search).get("theme") || readStorage("voyage.theme.v1");
    return value === "night" ? "night" : "day";
  });
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number>();
  const notify = useCallback((text: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = window.setTimeout(() => setToast(""), 3200);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  const connection = useConnection();
  const plan = useTravelPlanning(connection.apiBase, mode, notify);
  const stage = useRef<HTMLElement>(null);
  const planning = plan.phase === "planning";

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "night" ? "#0d1815" : "#f7f3ea");
  }, [theme]);
  useEffect(() => {
    document.body.dataset.view = plan.phase === "done" ? "result" : plan.phase;
    return () => { delete document.body.dataset.view; };
  }, [plan.phase]);
  useEffect(() => {
    if (plan.phase === "done" && window.matchMedia("(max-width: 980px)").matches) stage.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (plan.phase === "clarify" && window.matchMedia("(min-width: 981px)").matches) document.getElementById("query")?.focus({ preventScroll: true });
  }, [plan.phase]);

  function newTrip() {
    plan.reset();
    setQuery("");
    notify("新的旅程，从哪里开始？");
    document.getElementById("query")?.focus({ preventScroll: true });
  }
  function submit() {
    if (planning) return;
    if (!query.trim()) { notify("先写下一点旅行想法吧"); document.getElementById("query")?.focus(); return; }
    void plan.run(query);
    setQuery("");
  }
  const loadingText = plan.activeStage === "weather" ? "正在查询目的地天气，为每一天准备出行建议…"
    : plan.activeStage === "planner" ? "正在安排逐日路线与景点，写下旅行的每个细节…" : "正在确认目的地、日期、天数与预算…";

  return <>
    <div className="ambient" aria-hidden="true"><span className="ambient__blob ambient__blob--one" /><span className="ambient__blob ambient__blob--two" /><span className="ambient__blob ambient__blob--three" /></div><div className="grain" aria-hidden="true" /><IconSprite />
    <header className="topbar"><a className="brand" href="./" aria-label="远行 · 首页"><span className="brand__mark"><Icon name="plane" /></span><span className="brand__text"><strong>远行</strong><small>VOYAGE ATELIER</small></span></a>
      <nav className="topnav" aria-label="页面导航"><a href="#studio">规划旅程</a><a href={connection.docsUrl} target="_blank" rel="noreferrer">接口文档</a></nav>
      <div className="topbar__tools"><button className="conn" type="button" data-state={connection.connection.status} title={connection.connection.title} onClick={() => void connection.check()}><span className="conn__dot" aria-hidden="true" /><span className="conn__text">{connection.connection.status === "ok" ? "后端在线" : connection.connection.status === "fail" ? "后端离线" : "检查服务中"}</span></button>
        <button className="icon-btn" type="button" aria-label="后端设置" title="后端设置" onClick={() => setSettingsOpen(true)}><Icon name="settings" /></button>
        <button className="icon-btn" type="button" aria-label={theme === "day" ? "切换夜间模式" : "切换日间模式"} title={theme === "day" ? "切换夜间模式" : "切换日间模式"} onClick={() => { const next = theme === "day" ? "night" : "day"; setTheme(next); writeStorage("voyage.theme.v1", next); }}><Icon name={theme === "day" ? "moon" : "sun"} /></button></div>
    </header>
    <main id="studio"><Hero /><div className="studio-grid"><aside className="rail" aria-label="输入与执行进度">
      <JourneyComposer query={query} onQuery={setQuery} mode={mode} onMode={setMode} planning={planning} hasResult={!!plan.result} clarification={plan.clarification} onSubmit={submit} onStop={plan.stop} />
      <Conversation thread={plan.thread} onNewTrip={newTrip} />
      <JourneyProgress records={plan.records} phase={plan.phase} activeStage={plan.activeStage} elapsed={plan.elapsed} showTimer={!!plan.startedAt && !plan.isDemo} />
    </aside>
      <section ref={stage} className="stage card" aria-live="polite" aria-busy={planning} aria-label="规划结果">
        {plan.phase === "idle" && <EmptyJourney onDemo={plan.showDemo} />}
        {planning && <div className="stage__loading"><div className="compass-loader" aria-hidden="true"><span className="compass-loader__ring" /><span className="compass-loader__ring compass-loader__ring--two" /><Icon className="compass-loader__icon" name="compass" /></div><p className="kicker">DRAWING THE ROUTE</p><h2>正在为你绘制旅程</h2><p className="stage__loading-text">{loadingText}</p><div className="loading-lines" aria-hidden="true"><span /><span /><span /></div></div>}
        {plan.phase === "done" && plan.result && <JourneyReport result={plan.result} demo={plan.isDemo} onNewTrip={newTrip} notify={notify} />}
        {plan.phase === "clarify" && plan.clarification && <ClarificationPanel clarification={plan.clarification} />}
        {(plan.phase === "error" || plan.phase === "stopped") && <div className="stage__error"><div className={`error-card ${plan.phase === "stopped" ? "error-card--stopped" : ""}`}><div className="error-card__icon">{plan.phase === "stopped" ? <Icon name="stop" /> : "!"}</div><p className="kicker">{plan.phase === "stopped" ? "JOURNEY PAUSED" : "SOMETHING WENT WRONG"}</p><h2>{plan.phase === "stopped" ? "已停止本次规划" : "这次没有走通"}</h2><p style={{ whiteSpace: "pre-wrap" }}>{plan.error?.message || "执行记录仍保留在左侧。你可以重新尝试，或继续补充需求后再开始。"}</p>{plan.error?.requestId && <p className="error-card__ref">Request ID · {plan.error.requestId}</p>}<div className="error-card__actions">{plan.canRetry && <button className="btn btn--primary" onClick={() => void plan.retry()}>重新尝试</button>}<button className="btn btn--ghost" onClick={() => setSettingsOpen(true)}>检查后端设置</button></div></div></div>}
      </section>
    </div></main>
    <footer className="footer"><p><span className="footer__mark"><Icon name="plane" /></span>远行 · VOYAGE ATELIER<span className="footer__sep">/</span>由 FastAPI 多智能体服务驱动</p><div className="footer__links"><span>{connection.version}</span><a href={connection.docsUrl} target="_blank" rel="noreferrer">OpenAPI 文档</a><span className="footer__note">AI 生成内容，出行前请核实开放时间与价格</span></div></footer>
    <ConnectionDialog apiBase={connection.apiBase} open={settingsOpen} onClose={() => setSettingsOpen(false)} onSave={(base) => { connection.save(base); notify("后端地址已保存"); }} />
    <div className={`toast ${toast ? "is-visible" : ""}`} role="status" aria-live="polite">{toast}</div>
  </>;
}
export default App;
