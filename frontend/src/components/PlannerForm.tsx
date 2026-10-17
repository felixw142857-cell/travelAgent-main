import { useState } from "react";
import { Send, Square } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

interface PlannerFormProps {
  onSubmit: (input: string) => void;
  isLoading: boolean;
  onCancel: () => void;
}

export default function PlannerForm({ onSubmit, isLoading, onCancel }: PlannerFormProps) {
  const [input, setInput] = useState("");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isLoading || !input.trim()) return;
    onSubmit(input.trim());
    setInput("");
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-slate-100 bg-white p-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100">
        <Textarea
          aria-label="旅行需求或补充信息"
          placeholder="告诉我你的旅行想法，或补充刚才的信息…"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          disabled={isLoading}
          maxLength={5000}
          rows={3}
          className="min-h-[88px] resize-none border-0 bg-transparent text-sm leading-relaxed shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center justify-between gap-2 px-1 pb-1">
          <span className="text-[11px] text-slate-400">Enter 发送 · Shift+Enter 换行</span>
          {isLoading ? (
            <Button type="button" variant="outline" size="sm" onClick={onCancel} className="gap-1.5">
              <Square className="h-3 w-3" />取消
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={!input.trim()} className="gap-1.5 bg-indigo-600 hover:bg-indigo-700">
              <Send className="h-3.5 w-3.5" />发送
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
