import { useEffect, useRef, useState } from "react";
import { AgentResults } from "./types";
import { streamPlan } from "./lib/api";
import PlannerForm from "./components/PlannerForm";
import AgentStatus from "./components/AgentStatus";
import PlanResult from "./components/PlanResult";
import { Card } from "./components/ui/card";
import { useStore } from "./model";

function App() {
  const [isPlanning, setIsPlanning] = useState(false);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const [travelPlan, setTravelPlan] = useState<AgentResults | null>(null);
  const [showReport, setShowReport] = useState(false);
  const addRecord = useStore((state) => state.addRecord);
  const clearRecord = useStore((state) => state.clearRecord);
  const records = useStore((state) => state.records);
  const [smartMode, setSmartMode] = useState(false);  
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => () => activeRequest.current?.abort(), []);

  const handlePlanningSubmit = async (input: string) => {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setIsPlanning(true);
    setPlanningError(null);
    setTravelPlan(null);
    setShowReport(false);
    clearRecord();

    try {
      const result = await streamPlan({
        query: input,
        mode: smartMode ? "smart" : "standard",
        onRecord: addRecord,
        signal: controller.signal,
      });
      setTravelPlan(result);
    } catch (error) {
      const cancelled = controller.signal.aborted;
      const message = cancelled ? "已取消规划" : error instanceof Error ? error.message : "规划失败，请稍后重试";
      if (!cancelled) setPlanningError(message);
      addRecord({
        id: `planning_error_${Date.now()}`,
        name: '旅行规划',
        type: 'supervisor',
        desc: cancelled ? '规划已取消' : '规划失败',
        content: message,
        contentType: 'text',
        createdAt: Date.now(),
      });
    } finally {
      activeRequest.current = null;
      setIsPlanning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* 绝对定位在右上角的Checkbox元素 */}
      <div className="absolute top-4 right-4">
        <input
          type="checkbox"
          checked={smartMode}
          disabled={isPlanning}
          onChange={(e) => setSmartMode(e.target.checked)}
        />
        <span className="text-sm text-gray-500 ml-2">智能编排</span>
      </div>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* 表单区域 - 上方 */}
        <div className="mb-8">
          <Card className="p-4 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
            <PlannerForm
              onSubmit={handlePlanningSubmit}
              isLoading={isPlanning}
              onShowReport={() => setShowReport(true)}
              hasReport={!!travelPlan}
              onCancel={() => activeRequest.current?.abort()}
            />
          </Card>
        </div>

        {/* AI状态区域 - 下方 */}
        {planningError && (
          <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {planningError}
          </div>
        )}
        <div>
          <Card className="p-6 shadow-lg border-0 bg-white/80 backdrop-blur-sm min-h-[500px]">
            <AgentStatus isPlanning={isPlanning} records={records} />
          </Card>
        </div>

        {/* 报告Modal */}
        {showReport && travelPlan && (
          <PlanResult
            plan={travelPlan}
            open={showReport}
            onOpenChange={setShowReport}
          />
        )}
      </div>
    </div>
  );
}

export default App;
