import { useEffect, useRef, useState } from "react";
import { PlanError, streamPlan } from "../lib/api";
import { DEMO_RECORDS, DEMO_RESULT } from "../lib/demo";
import { buildHistory, resultSummary } from "../lib/journey";
import type { Phase, Stage, ThreadMessage } from "../lib/journey";
import type { AgentResults, Clarification, ConversationTurn, RecordItem } from "../types";

interface PlanningState {
  phase: Phase; thread: ThreadMessage[]; records: RecordItem[];
  result: AgentResults | null; clarification: Clarification | null;
  activeStage: Stage | null; isDemo: boolean; startedAt: number;
  error: { message: string; requestId: string } | null;
}
const emptyState: PlanningState = {
  phase: "idle", thread: [], records: [], result: null, clarification: null,
  activeStage: null, isDemo: false, startedAt: 0, error: null,
};
const message = (role: "user" | "assistant", content: string): ThreadMessage => ({ id: crypto.randomUUID(), role, content });
function demoState(): PlanningState {
  return { ...emptyState, phase: "done", isDemo: true, result: DEMO_RESULT, records: DEMO_RECORDS,
    activeStage: "planner", thread: [{ ...message("assistant", "这是一份示例行程：成都三天，两个人，预算 5000 元。它展示了报告、天气和逐日安排的样子。准备好后，直接在左侧写下你的旅行想法即可。"), send: false }] };
}

export function useTravelPlanning(apiBase: string, mode: "standard" | "smart", notify: (text: string) => void) {
  const [state, setState] = useState<PlanningState>(() => new URLSearchParams(location.search).get("demo") === "1" ? demoState() : emptyState);
  const controller = useRef<AbortController | null>(null);
  const runId = useRef(0);
  const lastRequest = useRef<{ query: string; history: ConversationTurn[]; mode: "standard" | "smart"; apiBase: string } | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (state.phase !== "planning") return;
    const tick = () => setElapsed(Math.floor((Date.now() - state.startedAt) / 1000));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [state.phase, state.startedAt]);
  useEffect(() => () => { runId.current++; controller.current?.abort(); }, []);

  async function run(query: string, retry = false) {
    if (controller.current || !query.trim()) return;
    const previous = state.isDemo ? emptyState : state;
    // 重试复用当时的上下文，避免把同一条用户输入重复发送。
    const request = retry && lastRequest.current
      ? { ...lastRequest.current, apiBase }
      : { query: query.trim(), history: buildHistory(previous.thread), mode, apiBase };
    lastRequest.current = request;
    const id = ++runId.current;
    const abort = new AbortController();
    controller.current = abort;
    setElapsed(0);
    setState({ ...emptyState, phase: "planning", startedAt: Date.now(),
      thread: retry ? previous.thread : [...previous.thread, message("user", request.query)] });
    try {
      const reply = await streamPlan({ ...request, signal: abort.signal, onRecord(record) {
        if (id !== runId.current) return;
        const text = `${record.name} ${record.desc}`.toLowerCase();
        const activeStage = /weather|天气|qweather/.test(text) ? "weather"
          : /planner|行程|规划/.test(text) ? "planner" : /analyzer|需求|分析/.test(text) ? "analysis" : null;
        setState((current) => ({ ...current, records: [...current.records, record], activeStage: activeStage || current.activeStage }));
      } });
      if (id !== runId.current) return;
      if (reply.kind === "result") {
        setState((current) => ({ ...current, phase: "done", result: reply.result, activeStage: "planner",
          thread: [...current.thread, message("assistant", resultSummary(reply.result))] }));
        notify("行程已经生成，可以继续调整细节");
      } else {
        setState((current) => ({ ...current, phase: "clarify", clarification: reply.clarification, activeStage: "analysis",
          thread: [...current.thread, { ...message("assistant", reply.clarification.message), missingFields: reply.clarification.missingFields }] }));
        notify("还差一点信息，补充后就能继续");
      }
    } catch (error) {
      if (id !== runId.current || abort.signal.aborted) return;
      const text = error instanceof Error ? error.message : "旅行规划失败，请稍后重试。";
      const requestId = error instanceof PlanError ? error.requestId : "";
      setState((current) => ({ ...current, phase: "error", error: { message: text, requestId },
        thread: [...current.thread, { ...message("assistant", text), isError: true, send: false }] }));
      notify("规划失败，可以重试或检查后端设置");
    } finally {
      if (id === runId.current) controller.current = null;
    }
  }
  function stop() {
    runId.current++;
    controller.current?.abort();
    controller.current = null;
    setState((current) => ({ ...current, phase: "stopped" }));
    notify("已停止本次规划");
  }
  function reset() {
    runId.current++;
    controller.current?.abort();
    controller.current = null;
    lastRequest.current = null;
    setState(emptyState);
    setElapsed(0);
  }
  function showDemo() {
    if (controller.current) return;
    lastRequest.current = null;
    setState(demoState());
    notify("已载入示例行程，可随时开始你自己的规划");
  }
  return { ...state, elapsed, run, stop, reset, showDemo, canRetry: !!lastRequest.current,
    retry: () => lastRequest.current && run(lastRequest.current.query, true) };
}
