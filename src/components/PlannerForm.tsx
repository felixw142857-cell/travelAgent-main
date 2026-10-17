import { useState } from "react";
import { CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface PlannerFormProps {
  onSubmit: (input: string) => void;
  isLoading: boolean;
  onShowReport: () => void;
  hasReport: boolean;
  onCancel: () => void;
}

export default function PlannerForm({
  onSubmit,
  isLoading,
  onShowReport,
  hasReport,
  onCancel,
}: PlannerFormProps) {
  const [input, setInput] = useState<string>("我想明天去成都玩三天, 请帮我制定一个旅行计划, 预算3000元左右");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    onSubmit(input);
  };

  return (
    <div className="w-full">
      <CardHeader className="text-center p-2 pb-6">
        <CardTitle className="text-2xl font-bold text-gray-900">
          🤖 AI 旅行规划助手
        </CardTitle>
      </CardHeader>

      <form onSubmit={handleSubmit} className="space-y-2">
        {/* 目的地输入 */}
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <Input
              placeholder="您想去哪里旅行？"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="min-h-10 text-sm"
              disabled={isLoading}
              type="textarea"
            />
          </div>

          {/* 开始规划按钮 */}
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="h-10 px-8 text-sm font-medium"
            size="sm"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                AI正在规划中...
              </>
            ) : (
              "🚀 开始AI规划"
            )}
          </Button>
          {isLoading && (
            <Button type="button" variant="outline" onClick={onCancel} size="sm">
              取消规划
            </Button>
          )}
          {/* 查看报告按钮 */}
          <Button
            type="button"
            variant="outline"
            onClick={onShowReport}
            className="h-10 px-8 text-sm font-medium"
            size="sm"
            disabled={!hasReport}
          >
            📋 查看报告
          </Button>
        </div>
      </form>
    </div>
  );
}
