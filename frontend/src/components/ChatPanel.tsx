import { useEffect, useRef } from "react";
import { MessageCircle, Plus, Sparkles } from "lucide-react";
import type { ChatMessage, RequiredField } from "../types";
import PlannerForm from "./PlannerForm";

interface ChatPanelProps {
  messages: ChatMessage[];
  isPlanning: boolean;
  smartMode: boolean;
  onSmartModeChange: (value: boolean) => void;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  onReset: () => void;
}

const fieldLabels: Record<RequiredField, string> = {
  destination: "目的地", startDate: "出发日期", duration: "旅行天数", budget: "总预算",
};

export default function ChatPanel(props: ChatPanelProps) {
  const scrollArea = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const area = scrollArea.current;
    if (area) area.scrollTop = area.scrollHeight;
  }, [props.messages, props.isPlanning]);

  return (
    <aside aria-label="旅行对话" className="flex h-[650px] min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:sticky md:top-6 md:h-[calc(100vh-112px)] md:min-h-[520px]">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <MessageCircle className="h-4 w-4 text-indigo-500" />旅行对话
          </h2>
          <p className="mt-1 text-xs text-slate-400">聊聊想法，一起补全旅行计划</p>
        </div>
        <button type="button" onClick={props.onReset} disabled={props.isPlanning} aria-label="开始新对话" title="新对话" className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-40">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div ref={scrollArea} role="log" aria-label="聊天记录" aria-live="polite" className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5">
        {props.messages.map((message) => (
          <div key={message.id} className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}>
            <span className="mb-1.5 px-1 text-[11px] text-slate-400">{message.role === "user" ? "你" : "旅行助手"}</span>
            <div className={`max-w-[95%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-7 ${
              message.role === "user" ? "rounded-tr-sm bg-indigo-600 text-white" : message.isError ? "rounded-tl-sm border border-red-100 bg-red-50 text-red-700" : "rounded-tl-sm bg-slate-100 text-slate-700"
            }`}>
              {message.content}
              {message.missingFields && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {message.missingFields.map((field) => <span key={field} className="rounded-md border border-indigo-100 bg-white px-2 py-0.5 text-[11px] text-indigo-600">待补充 · {fieldLabels[field]}</span>)}
                </div>
              )}
            </div>
          </div>
        ))}
        {props.isPlanning && (
          <div role="status" className="flex items-center gap-2 px-1 text-xs text-slate-500">
            <Sparkles className="h-3.5 w-3.5 animate-pulse text-indigo-500" />正在处理你的需求…
          </div>
        )}
      </div>

      <label htmlFor="smart-mode" className="flex cursor-pointer items-center gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
        <input id="smart-mode" type="checkbox" checked={props.smartMode} disabled={props.isPlanning} onChange={(event) => props.onSmartModeChange(event.target.checked)} className="accent-indigo-600" />
        智能编排<span className="ml-auto text-[10px] text-slate-400">确认需求后启用</span>
      </label>
      <PlannerForm onSubmit={props.onSubmit} isLoading={props.isPlanning} onCancel={props.onCancel} />
    </aside>
  );
}
