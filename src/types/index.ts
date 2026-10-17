// 浏览器仅保留接口契约；Agent、提示词和外部 API 调用在 Python 后端。
export interface AnalysisResult {
  destination: string;
  duration: number;
  startDate: string;
  allDates: string[];
  budget: string;
  preferences: string[];
  extraRequirements: string;
  travelers: number;
}

export interface WeatherDay {
  date: string;
  weather: string;
  high: string;
  low: string;
  recommendations: string;
  source: "qweather" | "unavailable";
}

export interface DayPlan {
  date: string;
  plan: { time: string; activity: string; notes: string }[];
  generalTips: string;
}

export interface AgentResult<T> {
  text: string;
  json: T;
}

export interface AgentResults {
  analysis: AgentResult<AnalysisResult>;
  weather: AgentResult<WeatherDay[]>;
  planner: AgentResult<DayPlan[]>;
}
