import { AgentResults } from "../types";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "./ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";

interface PlanResultProps {
  plan: AgentResults;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PlanResult({
  plan,
  open,
  onOpenChange,
}: PlanResultProps) {
  const { analysis, weather, planner } = plan;
  const analysisJson = analysis.json;
  const weatherJson = weather.json;
  const plannerJson = planner.json;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[85vh] p-0 overflow-hidden">
        {/* 华丽的渐变背景头部 */}
        <div className="relative bg-gradient-to-br from-purple-600 via-blue-600 to-teal-500 p-4 text-white">
          <div className="absolute inset-0 bg-black/10"></div>
          <div className="relative z-10">
            <DialogTitle className="text-xl font-bold mb-1 flex items-center gap-2">
              <span className="text-2xl">✈️</span>
              您的{analysisJson.destination}旅行计划
            </DialogTitle>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <div className="bg-white/20 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-medium">
                📍 {analysisJson.destination}
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-medium">
                ⏱️ {analysisJson.duration} 天
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-medium">
                📅 {analysisJson.startDate || "日期灵活"}
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-medium">
                💰 {analysisJson.budget}
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-medium">
                🚀 {analysisJson.preferences.join("、") || "观光"}
              </div>
            </div>
          </div>
          {/* 装饰性几何图形 */}
          <div className="absolute top-2 right-2 w-16 h-16 bg-white/5 rounded-full blur-2xl"></div>
          <div className="absolute bottom-0 right-0 w-12 h-12 bg-yellow-300/20 rounded-full blur-xl"></div>
        </div>

        <ScrollArea className="flex-1 bg-gradient-to-b from-gray-50 to-white">
          <div className="p-3 space-y-3">
            {/* 精美的天气信息卡片 */}
            <Card className="bg-gradient-to-br from-sky-50 to-blue-100 border-0 shadow-lg shadow-sky-100/50 overflow-hidden">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-sky-400/10 to-blue-500/10"></div>
                <CardHeader className="relative pb-2">
                  <CardTitle className="text-base text-gray-500 flex items-center gap-2">
                    天气预报与建议
                  </CardTitle>
                  {weatherJson.some(day => day.source === "qweather") && (
                    <p className="text-xs text-gray-500">天气数据来源：和风天气</p>
                  )}
                </CardHeader>
                <CardContent className="relative pt-0">
                  <div className="space-y-2">
                    {weatherJson.map((dayWeather, index) => (
                      <div
                        key={index}
                        className="bg-white/70 backdrop-blur-sm rounded-lg p-3"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-gradient-to-r from-indigo-400 to-purple-500 rounded-lg flex items-center justify-center">
                              <span className="text-white text-xs">📅</span>
                            </div>
                            <span className="text-sm font-bold text-gray-800">
                              {dayWeather.date}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            {dayWeather.weather !== "无天气信息" && (
                              <span className="text-xs text-gray-800 font-bold">
                                {dayWeather.weather}
                              </span>
                            )}
                          </div>
                        </div>

                        {dayWeather.weather !== "无天气信息" && (
                          <div className="flex items-center gap-4 mb-2">
                            <div className="flex items-center gap-1">
                              <span className="text-red-500 text-sm">🌡️</span>
                              <span className="text-sm font-medium text-gray-700">
                                {dayWeather.high}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-blue-500 text-sm">❄️</span>
                              <span className="text-sm font-medium text-gray-700">
                                {dayWeather.low}
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-2 border border-amber-200">
                          <div className="flex items-start gap-1.5">
                            <span className="text-amber-500 text-sm">💡</span>
                            <p className="text-amber-800 text-xs font-medium leading-relaxed">
                              {dayWeather.recommendations}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </div>
              {/* 装饰性云朵 */}
              <div className="absolute top-2 right-2 w-8 h-4 bg-white/30 rounded-full blur-sm"></div>
              <div className="absolute top-4 right-4 w-6 h-3 bg-white/20 rounded-full blur-sm"></div>
            </Card>

            {/* 精美的每日行程 */}
            <Card className="bg-gradient-to-br from-white to-purple-50 border-0 shadow-lg shadow-purple-100/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-gray-400 flex items-center gap-2">
                  详细行程安排
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {plannerJson.map((day, dayIndex) => (
                  <div
                    key={dayIndex}
                    className="relative rounded-xl shadow-md shadow-gray-100/50 bg-gradient-to-r from-gray-50 to-blue-50 "
                  >
                    <div className="relative  p-2.5 border border-gray-100/50">
                      {/* 日期标题 */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-md">
                          {dayIndex + 1}
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-gray-800">
                            第{dayIndex + 1}天
                          </h4>
                          <p className="text-xs text-gray-500 font-medium">
                            {day.date || "日期待定"}
                          </p>
                        </div>
                        {day.generalTips && (
                          <div className="ml-auto max-w-xs">
                            <div className="bg-gradient-to-r from-amber-100 to-yellow-100 rounded-lg p-2 border border-amber-200">
                              <p className="text-xs font-medium text-amber-800">
                                💡 {day.generalTips}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 活动安排 */}
                      {day.plan?.length > 0 ? (
                        <div className="space-y-2">
                          {day.plan.map(
                            (activity, activityIndex) => (
                              <div key={activityIndex} className="group">
                                <div className="rounded-xl p-3">
                                  <div className="flex items-start gap-3">
                                    <div className="flex-1 min-w-0">
                                      {/* 时间标签 */}
                                      <div className="mb-2">
                                        <span className="inline-block bg-gradient-to-r from-blue-500 to-purple-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                                          {activity.time || "时间待定"}
                                        </span>
                                      </div>

                                      {/* 活动内容 */}
                                      <div className="mb-2">
                                        <p className="text-gray-800 text-sm font-medium leading-relaxed">
                                          {activity.activity || "活动详情"}
                                        </p>
                                      </div>

                                      {/* 注意事项 */}
                                      {activity.notes && (
                                        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-2 border border-amber-200">
                                          <div className="flex items-start gap-1.5">
                                            <span className="text-amber-500 text-sm">
                                              💡
                                            </span>
                                            <p className="text-amber-800 text-xs font-medium leading-relaxed">
                                              {activity.notes}
                                            </p>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-6">
                          <div className="w-10 h-10 bg-gradient-to-r from-gray-200 to-gray-300 rounded-full flex items-center justify-center mx-auto mb-2">
                            <span className="text-gray-500 text-lg">📝</span>
                          </div>
                          <p className="text-gray-500 text-sm font-medium">
                            暂无具体安排
                          </p>
                          <p className="text-gray-400 text-xs mt-1">
                            可根据实际情况自由安排
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* 精美的行程规划详情 */}
            {planner?.text && (
              <Collapsible>
                <Card className="bg-gradient-to-br from-orange-50 to-red-100 border-0 shadow-lg shadow-orange-100/50 overflow-hidden">
                  <CardHeader className="pb-2">
                    <CollapsibleTrigger className="flex items-center justify-between w-full group">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-gradient-to-r from-orange-500 to-red-500 rounded-lg flex items-center justify-center">
                          <span className="text-white text-xs">📝</span>
                        </div>
                        <CardTitle className="text-base font-bold text-gray-800">
                          原始规划详情
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-2 text-gray-500 group-hover:text-gray-700 transition-colors">
                        <span className="text-xs font-medium">
                          点击展开详情
                        </span>
                        <div className="w-5 h-5 bg-gray-200 group-hover:bg-gray-300 rounded-full flex items-center justify-center transition-colors">
                          <span className="text-xs">▼</span>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <div className="bg-white/70 backdrop-blur-sm rounded-xl p-3 shadow-md">
                        <div className="prose prose-sm max-w-none">
                          <div className="whitespace-pre-wrap text-gray-700 leading-relaxed text-sm">
                            {planner.text}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
