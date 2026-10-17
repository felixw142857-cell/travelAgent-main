import { useEffect, useRef, useState } from "react";
import { Calendar, FileText, MapPin, Plane, Sparkles, Wallet } from "lucide-react";
import type { AgentResults, ChatMessage, Clarification, ConversationTurn } from "./types";
import { streamPlan } from "./lib/api";
import ChatPanel from "./components/ChatPanel";
import AgentStatus from "./components/AgentStatus";
import PlanResult from "./components/PlanResult";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";
import { useStore } from "./model";

const welcome: ChatMessage = {
  id: "welcome", role: "assistant",
  content: "你好！想去哪里走走？\n告诉我目的地、出发日期、旅行天数和总预算，我会帮你安排。信息还没想全也没关系，我们可以慢慢补充。",
};

function App() {
  const [isPlanning, setIsPlanning] = useState(false);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const [travelPlan, setTravelPlan] = useState<AgentResults | null>(null);
  const [clarification, setClarification] = useState<Clarification | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);
  const [showReport, setShowReport] = useState(false);
  const [smartMode, setSmartMode] = useState(false);
  const addRecord = useStore((state) => state.addRecord);
  const clearRecord = useStore((state) => state.clearRecord);
  const records = useStore((state) => state.records);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => () => activeRequest.current?.abort(), []);

  const handlePlanningSubmit = async (input: string) => {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    const history: ConversationTurn[] = messages
      .filter((message) => message.id !== "welcome" && !message.isError)
      .slice(-20).map(({ role, content }) => ({ role, content }));
    while (history.reduce((size, message) => size + message.content.length, 0) > 20000) history.shift();
    setMessages((previous) => [...previous, { id: crypto.randomUUID(), role: "user", content: input }]);
    setIsPlanning(true);
    setPlanningError(null);
    setTravelPlan(null);
    setClarification(null);
    setShowReport(false);
    clearRecord();

    try {
      const reply = await streamPlan({ query: input, history, mode: smartMode ? "smart" : "standard", onRecord: addRecord, signal: controller.signal });
      if (reply.kind === "clarification") {
        setClarification(reply.clarification);
        setMessages((previous) => [...previous, { id: crypto.randomUUID(), role: "assistant", content: reply.clarification.message, missingFields: reply.clarification.missingFields }]);
      } else {
        setTravelPlan(reply.result);
        const analysis = reply.result.analysis.json;
        setMessages((previous) => [...previous, {
          id: crypto.randomUUID(), role: "assistant",
          content: `行程已经准备好了！\n${analysis.destination} · ${analysis.duration}天\n${analysis.startDate}出发，预算：${analysis.budget}。\n可以在右侧查看完整报告，也可以继续告诉我想调整什么。`,
        }]);
      }
    } catch (error) {
      const cancelled = controller.signal.aborted;
      const message = cancelled ? "已取消本次规划。之前的对话还在，你可以继续补充或修改需求。" : error instanceof Error ? error.message : "规划失败，请稍后重试";
      if (!cancelled) setPlanningError(message);
      setMessages((previous) => [...previous, { id: crypto.randomUUID(), role: "assistant", content: message, isError: true }]);
      addRecord({ id: crypto.randomUUID(), name: "旅行规划", type: "supervisor", desc: cancelled ? "规划已取消" : "规划失败", content: message, contentType: "text", createdAt: Date.now() });
    } finally {
      activeRequest.current = null;
      setIsPlanning(false);
    }
  };

  const resetConversation = () => {
    if (activeRequest.current) return;
    setMessages([welcome]);
    setTravelPlan(null);
    setClarification(null);
    setPlanningError(null);
    setShowReport(false);
    clearRecord();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-5 lg:px-7">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white"><Plane className="h-4 w-4" /></span>
        <h1 className="text-base font-semibold tracking-tight">旅行规划助手</h1>
        <span className="hidden text-xs text-slate-400 sm:inline">从一个想法，到一段好旅程</span>
      </header>

      <main className="mx-auto grid max-w-[1680px] items-start gap-5 p-4 md:grid-cols-[320px_minmax(0,1fr)] md:p-6 xl:grid-cols-[360px_minmax(0,1fr)] xl:gap-7">
        <ChatPanel messages={messages} isPlanning={isPlanning} smartMode={smartMode} onSmartModeChange={setSmartMode} onSubmit={handlePlanningSubmit} onCancel={() => activeRequest.current?.abort()} onReset={resetConversation} />

        <section aria-label="规划工作台" className="min-w-0 space-y-5">
          <div className="px-1 py-1">
            <h2 className="text-lg font-semibold">规划工作台</h2>
            <p className="mt-1 text-xs leading-6 text-slate-500">{clarification ? "还有一些信息需要确认，在左侧回复旅行助手即可继续。" : travelPlan ? "行程已生成，查看报告或在左侧继续调整需求。" : "在左侧聊聊你的旅行想法，执行进度和报告会显示在这里。"}</p>
          </div>

          {travelPlan && (
            <Card className="border-indigo-100 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="mb-2 text-xs font-medium text-indigo-600">旅行计划已完成</p>
                  <h3 className="text-xl font-semibold">{travelPlan.analysis.json.destination} · {travelPlan.analysis.json.duration}日游</h3>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{travelPlan.analysis.json.startDate}</span>
                    <span className="flex items-center gap-1"><Wallet className="h-3.5 w-3.5" />{travelPlan.analysis.json.budget}</span>
                  </div>
                </div>
                <Button onClick={() => setShowReport(true)} className="gap-2 bg-indigo-600 hover:bg-indigo-700"><FileText className="h-4 w-4" />查看完整报告</Button>
              </div>
            </Card>
          )}

          {clarification && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">等待补充信息 · 尚未开始天气查询和行程生成</div>}
          {planningError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{planningError}</div>}

          <Card className="min-w-0 rounded-2xl border-slate-200 bg-white p-5 shadow-sm lg:p-6">
            {records.length > 0 || isPlanning ? <AgentStatus isPlanning={isPlanning} records={records} /> : (
              <div className="flex min-h-[460px] flex-col items-center justify-center px-4 text-center">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500"><MapPin className="h-7 w-7" /></div>
                <h3 className="text-lg font-semibold">下一站，想去哪里？</h3>
                <p className="mt-3 max-w-sm text-sm leading-7 text-slate-500">不必一次说完所有信息。先告诉我你的想法，旅行助手会和你一起确认细节。</p>
                <div className="mt-8 flex flex-wrap justify-center gap-2 text-xs text-slate-400">
                  {["确认需求", "查询天气", "安排行程"].map((label) => <span key={label} className="rounded-full border border-slate-100 px-3 py-1.5">{label}</span>)}
                </div>
                <span className="mt-8 flex items-center gap-1.5 text-[11px] text-slate-400"><Sparkles className="h-3 w-3" />信息齐全后，再开始规划</span>
              </div>
            )}
          </Card>
        </section>
      </main>

      {showReport && travelPlan && <PlanResult plan={travelPlan} open={showReport} onOpenChange={setShowReport} />}
    </div>
  );
}

export default App;
