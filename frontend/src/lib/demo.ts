// 仅用于界面预览；不会作为真实对话上下文发送到后端。
import type { AgentResults, RecordItem } from "../types";
export const DEMO_RESULT: AgentResults = {
    analysis: {
      text:
        "成都 · 三天慢游\n两个人，预算 5000 元，喜欢美食、慢节奏与城市漫步。\n建议住在春熙路或人民公园地铁沿线，减少通勤，把更多时间留给街巷、茶馆和一顿不赶时间的饭。",
      json: {
        destination: "成都",
        duration: 3,
        startDate: "2026-10-23",
        allDates: ["2026-10-23", "2026-10-24", "2026-10-25"],
        budget: "5000 元",
        preferences: ["美食", "慢节奏", "城市漫步"],
        extraRequirements: "两个人出行，希望住宿靠近地铁，行程不要排得太满。",
        travelers: 2,
      },
    },
    weather: {
      text:
        "10月23日 多云 24/16，早晚微凉；10月24日 小雨 21/15，备好雨具；10月25日 晴 26/17，适合户外。",
      json: [
        {
          date: "2026-10-23",
          weather: "多云",
          high: "24°",
          low: "16°",
          recommendations: "早晚微凉，带一件薄外套；适合步行逛老城。",
          source: "qweather",
        },
        {
          date: "2026-10-24",
          weather: "小雨",
          high: "21°",
          low: "15°",
          recommendations: "有阵雨，备好折叠伞；把室内展馆和茶馆放在下午。",
          source: "qweather",
        },
        {
          date: "2026-10-25",
          weather: "晴",
          high: "26°",
          low: "17°",
          recommendations: "阳光正好，适合青城山轻徒步；注意防晒和补水。",
          source: "qweather",
        },
      ],
    },
    planner: {
      text:
        "第1天（2026-10-23）\n09:30：宽窄巷子\n注意：从窄巷子进入人少一些，周边停车位紧张。\n12:00：奎星楼街午餐\n注意：冒菜、蛋烘糕和冰粉都可以试试，11:30 前到可少排队。\n14:30：人民公园鹤鸣茶社\n注意：点一杯碧潭飘雪，体验成都人的下午。\n18:30：锦里古街\n注意：傍晚亮灯后再逛，侧巷比主街更安静。\n当日建议：第一天以步行和公共交通为主，穿舒适的鞋。\n\n第2天（2026-10-24）\n08:00：成都大熊猫繁育研究基地\n注意：开园即入园，先看月亮产房；提前在官方渠道预约。\n12:30：文殊院素斋\n注意：清淡的一餐，给下午留一点胃口。\n15:00：春熙路与太古里\n注意：城市漫步，逛累了就找一家咖啡馆坐下。\n19:30：九眼桥夜景\n注意：沿河散步即可，不必把行程排满。\n当日建议：熊猫基地早高峰打车约 40 分钟，建议 7 点前出发。\n\n第3天（2026-10-25）\n09:00：青城山前山\n注意：索道上、步行下，预留约 3 小时。\n13:30：都江堰景区\n注意：从青城山打车约 25 分钟，联票更划算。\n18:00：返回成都 · 玉林路晚餐\n注意：选一家本地小馆，给旅程留一个松弛的结尾。\n当日建议：行李可寄存在酒店，返程前留足 1.5 小时。\n\n资料来源：openstreetmap · ODbL-1.0；model（未指定候选景点，待核实）",
      json: [
        {
          date: "2026-10-23",
          generalTips: "第一天以步行和公共交通为主，穿舒适的鞋。",
          plan: [
            {
              time: "09:30",
              activity: "宽窄巷子",
              notes: "从窄巷子进入人少一些；青砖灰瓦的老街适合慢慢走。",
              attractionId: "chengdu-way941885688",
              source: "openstreetmap · ODbL-1.0",
            },
            {
              time: "12:00",
              activity: "奎星楼街午餐",
              notes: "冒菜、蛋烘糕和冰粉都可以试试，11:30 前到可少排队。",
              attractionId: "",
              source: "model（未指定候选景点，待核实）",
            },
            {
              time: "14:30",
              activity: "人民公园 · 鹤鸣茶社",
              notes: "点一杯碧潭飘雪，体验成都人的下午。",
              attractionId: "chengdu-node123456",
              source: "openstreetmap · ODbL-1.0",
            },
            {
              time: "18:30",
              activity: "锦里古街",
              notes: "傍晚亮灯后再逛，侧巷比主街更安静。",
              attractionId: "chengdu-way654321",
              source: "openstreetmap · ODbL-1.0",
            },
          ],
        },
        {
          date: "2026-10-24",
          generalTips: "熊猫基地早高峰打车约 40 分钟，建议 7 点前出发。",
          plan: [
            {
              time: "08:00",
              activity: "成都大熊猫繁育研究基地",
              notes: "开园即入园，先看月亮产房；提前在官方渠道预约。",
              attractionId: "chengdu-way941885688",
              source: "openstreetmap · ODbL-1.0",
            },
            {
              time: "12:30",
              activity: "文殊院素斋",
              notes: "清淡的一餐，给下午留一点胃口。",
              attractionId: "",
              source: "model（未指定候选景点，待核实）",
            },
            {
              time: "15:00",
              activity: "春熙路与太古里",
              notes: "城市漫步，逛累了就找一家咖啡馆坐下。",
              attractionId: "chengdu-node789012",
              source: "openstreetmap · ODbL-1.0",
            },
            {
              time: "19:30",
              activity: "九眼桥夜景",
              notes: "沿河散步即可，不必把行程排满。",
              attractionId: "",
              source: "model（未指定候选景点，待核实）",
            },
          ],
        },
        {
          date: "2026-10-25",
          generalTips: "行李可寄存在酒店，返程前留足 1.5 小时。",
          plan: [
            {
              time: "09:00",
              activity: "青城山前山",
              notes: "索道上、步行下，预留约 3 小时。",
              attractionId: "chengdu-way111222",
              source: "openstreetmap · ODbL-1.0",
            },
            {
              time: "13:30",
              activity: "都江堰景区",
              notes: "从青城山打车约 25 分钟，联票更划算。",
              attractionId: "chengdu-way333444",
              source: "openstreetmap · ODbL-1.0",
            },
            {
              time: "18:00",
              activity: "返回成都 · 玉林路晚餐",
              notes: "选一家本地小馆，给旅程留一个松弛的结尾。",
              attractionId: "",
              source: "model（未指定候选景点，待核实）",
            },
          ],
        },
      ],
    },
  };
export const DEMO_RECORDS: RecordItem[] = [
    {
      id: "demo-record-1",
      name: "AgentCoordinator",
      type: "supervisor",
      desc: "执行 AnalyzerAgent",
      content: "先确认目的地、日期、预算与同行人数",
      contentType: "text",
      createdAt: Date.now() - 52000,
    },
    {
      id: "demo-record-2",
      name: "AnalyzerAgent",
      type: "agent",
      desc: "已提取成都三天、两人、5000 元预算与美食偏好",
      content: JSON.stringify(DEMO_RESULT.analysis.json, null, 2),
      contentType: "json",
      createdAt: Date.now() - 46000,
    },
    {
      id: "demo-record-3",
      name: "search_attractions",
      type: "tool",
      desc: "从成都景点库检索候选景点，并按偏好排序",
      content: JSON.stringify(
        [
          { name: "宽窄巷子", category: "历史街区", district: "青羊区" },
          { name: "成都大熊猫繁育研究基地", category: "动物园", district: "成华区" },
          { name: "人民公园", category: "公园", district: "青羊区" },
        ],
        null,
        2,
      ),
      contentType: "json",
      createdAt: Date.now() - 38000,
    },
    {
      id: "demo-record-4",
      name: "WeatherAgent",
      type: "agent",
      desc: "查询 10 月 23 日至 25 日的天气，并写入出行建议",
      content: JSON.stringify(DEMO_RESULT.weather.json, null, 2),
      contentType: "json",
      createdAt: Date.now() - 28000,
    },
    {
      id: "demo-record-5",
      name: "PlannerAgent",
      type: "agent",
      desc: "生成逐日行程，校验日期完整性与每日活动数量",
      content: JSON.stringify(DEMO_RESULT.planner.json, null, 2),
      contentType: "json",
      createdAt: Date.now() - 14000,
    },
    {
      id: "demo-record-6",
      name: "旅行规划",
      type: "supervisor",
      desc: "全部任务完成",
      content: "成都三天慢游已经准备好",
      contentType: "text",
      createdAt: Date.now() - 4000,
    },
  ];
