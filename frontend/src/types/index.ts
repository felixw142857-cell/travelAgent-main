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

export interface PlanActivity {
  time: string;
  activity: string;
  notes: string;
  /** 候选景点库中的 id；为空表示该时段不对应景点（用餐/交通/休息） */
  attractionId?: string;
  /** 服务端按 attractionId 回填的来源；以 model 开头表示未经景点库校验 */
  source?: string;
}

export interface DayPlan {
  date: string;
  plan: PlanActivity[];
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

export type RequiredField = "destination" | "startDate" | "duration" | "budget";

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatMessage extends ConversationTurn {
  id: string;
  missingFields?: RequiredField[];
  isError?: boolean;
}

export interface Clarification {
  message: string;
  missingFields: RequiredField[];
  draft: {
    destination: string | null;
    startDate: string | null;
    duration: number | null;
    budget: string | null;
    preferences: string[];
    extraRequirements: string;
    travelers: number;
  };
}

export type PlanReply =
  | { kind: "result"; result: AgentResults }
  | { kind: "clarification"; clarification: Clarification };
