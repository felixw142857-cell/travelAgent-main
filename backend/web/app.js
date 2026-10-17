/*
 * 远行 · VOYAGE ATELIER
 * 与 FastAPI 旅行后端对话的独立前端。
 * API: POST /api/v1/travel/plan/stream (NDJSON)
 */
(() => {
  "use strict";

  const STORAGE = {
    api: "voyage.apiBase.v1",
    theme: "voyage.theme.v1",
  };

  const DEFAULT_PLACEHOLDER = "例如：下周五去成都玩三天，两个人，预算 5000 元，喜欢美食和慢节奏的旅行。";

  const FIELD_LABELS = {
    destination: "目的地",
    startDate: "出发日期",
    duration: "旅行天数",
    budget: "预算",
  };

  const TYPE_META = {
    supervisor: { icon: "i-compass" },
    agent: { icon: "i-bot" },
    tool: { icon: "i-tool" },
  };

  const RECORD_LABELS = {
    AgentCoordinator: "协调器",
    SmartSupervisor: "智能调度",
    AnalyzerAgent: "需求分析",
    WeatherAgent: "天气助手",
    PlannerAgent: "行程规划师",
    GateKeeper: "输入整理",
    search_attractions: "景点检索",
    get_location_id: "地点解析",
    get_weather_by_location_id: "天气查询",
  };

  const RECORD_DESCRIPTIONS = {
    "执行 AnalyzerAgent": "开始需求分析",
    "执行 WeatherAgent": "开始查询天气",
    "执行 PlannerAgent": "开始编排行程",
  };

  const WEATHER_ICONS = {
    sun: "i-sun",
    cloud: "i-cloud",
    rain: "i-rain",
    snow: "i-snow",
    fog: "i-fog",
    wind: "i-wind",
  };

  const STAGE_ORDER = ["analysis", "weather", "planner"];

  const STAGE_LOADING_TEXT = {
    analysis: "正在确认目的地、日期、天数与预算…",
    weather: "正在查询沿途天气，并把建议写进每日安排…",
    planner: "正在编排每天的路线、用餐与休息节奏…",
  };

  const byId = (id) => document.getElementById(id);

  const els = {
    connBtn: byId("connBtn"),
    connText: byId("connText"),
    settingsBtn: byId("settingsBtn"),
    themeBtn: byId("themeBtn"),
    themeIcon: byId("themeIcon"),
    docsLink: byId("docsLink"),
    footerDocs: byId("footerDocs"),
    versionText: byId("versionText"),
    modeBadge: byId("modeBadge"),
    planForm: byId("planForm"),
    field: byId("field"),
    query: byId("query"),
    charCount: byId("charCount"),
    examples: byId("examples"),
    modeHint: byId("modeHint"),
    submitBtn: byId("submitBtn"),
    submitLabel: byId("submitLabel"),
    cancelBtn: byId("cancelBtn"),
    threadCard: byId("threadCard"),
    threadList: byId("threadList"),
    newTripBtn: byId("newTripBtn"),
    timer: byId("timer"),
    stageSteps: byId("stageSteps"),
    timeline: byId("timeline"),
    stage: byId("stage"),
    stageEmpty: byId("stageEmpty"),
    stageLoading: byId("stageLoading"),
    loadingText: byId("loadingText"),
    report: byId("report"),
    clarify: byId("clarify"),
    clarifyMessage: byId("clarifyMessage"),
    clarifyMissing: byId("clarifyMissing"),
    clarifyDraft: byId("clarifyDraft"),
    stageError: byId("stageError"),
    demoBtn: byId("demoBtn"),
    settingsDialog: byId("settingsDialog"),
    apiInput: byId("apiInput"),
    settingsStatus: byId("settingsStatus"),
    saveApiBtn: byId("saveApiBtn"),
    testBtn: byId("testBtn"),
    closeSettings: byId("closeSettings"),
    cancelSettings: byId("cancelSettings"),
    toast: byId("toast"),
  };

  const state = {
    apiBase: "http://127.0.0.1:8001",
    phase: "idle",
    mode: "standard",
    controller: null,
    runId: 0,
    startedAt: 0,
    timerId: null,
    records: [],
    thread: [],
    result: null,
    clarification: null,
    lastQuery: "",
    activeStage: null,
    isDemo: false,
    connected: false,
    versionLoaded: false,
    apiBaseExplicit: false,
  };

  let toastTimer = null;
  let stepEls = [];
  let modeButtons = [];

  /* ------------------------------------------------------------------ */
  /* small utilities                                                     */
  /* ------------------------------------------------------------------ */

  const HTML_ESCAPES = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
  }

  function nl2br(value) {
    return escapeHtml(value).replace(/\n/g, "<br />");
  }

  function icon(name, extraClass = "") {
    return `<svg class="icon${extraClass ? ` ${extraClass}` : ""}" aria-hidden="true"><use href="#${name}"></use></svg>`;
  }

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* Storage may be unavailable in private contexts. */
    }
  }

  function normalizeApiBase(value) {
    const text = String(value || "").trim();
    if (!text) return null;
    try {
      const url = new URL(text);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
    } catch {
      return null;
    }
  }

  function defaultApiBase() {
    if (location.protocol === "http:" || location.protocol === "https:") {
      if (location.port === "8001") return location.origin;
      return "http://127.0.0.1:8001";
    }
    return "http://127.0.0.1:8001";
  }

  function resolveApiBase() {
    const params = new URLSearchParams(location.search);
    const fromQuery = normalizeApiBase(params.get("api"));
    if (fromQuery) {
      // 仅对本次访问生效；需要长期保存请使用右上角的“后端设置”。
      return { base: fromQuery, explicit: true };
    }
    const stored = normalizeApiBase(readStorage(STORAGE.api));
    if (stored) return { base: stored, explicit: true };
    return { base: defaultApiBase(), explicit: false };
  }

  async function bootstrapConnection() {
    // 若页面由 web/serve.py 或 Vite 开发代理提供，同源 /api 可用，
    // 此时使用同源地址，浏览器不会触发 CORS。直接静态打开时回退到 8001。
    if (!state.apiBaseExplicit && (location.protocol === "http:" || location.protocol === "https:")) {
      const sameOrigin = location.origin;
      if (sameOrigin !== state.apiBase) {
        try {
          const response = await fetchWithTimeout(
            `${sameOrigin}/api/v1/base/health`,
            { headers: { Accept: "application/json" }, cache: "no-store" },
            1800,
          );
          const body = await response.json().catch(() => null);
          if (response.ok && body?.code === 200) {
            state.apiBase = sameOrigin;
            syncApiLinks();
          }
        } catch {
          /* 同源没有代理时，继续使用默认的 8001。 */
        }
      }
    }
    checkHealth({ quiet: true });
  }

  function syncApiLinks() {
    const docs = `${state.apiBase}/docs`;
    if (els.docsLink) els.docsLink.href = docs;
    if (els.footerDocs) els.footerDocs.href = docs;
  }

  function parseDate(iso) {
    if (!iso) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatShortDate(iso) {
    const date = parseDate(iso);
    if (!date) return iso ? String(iso) : "日期待定";
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function formatLongDate(iso) {
    const date = parseDate(iso);
    if (!date) return iso ? String(iso) : "日期待定";
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function weekdayOf(iso) {
    const date = parseDate(iso);
    if (!date) return "";
    return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
  }

  function formatDateRange(start, end) {
    if (!start) return "日期待定";
    const year = String(start).slice(0, 4);
    const startText = formatShortDate(start);
    const endText = end && end !== start ? formatShortDate(end) : "";
    return endText ? `${year}年 ${startText} — ${endText}` : `${year}年 ${startText}`;
  }

  function recordLabel(name) {
    return RECORD_LABELS[name] || name || "Agent";
  }

  function recordDescription(description) {
    return RECORD_DESCRIPTIONS[description] || description || "";
  }

  function formatTime(timestamp) {
    const date = new Date(Number(timestamp));
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("zh-CN", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function formatUptime(seconds) {
    if (!Number.isFinite(Number(seconds))) return "";
    const value = Number(seconds);
    if (value < 60) return `${Math.max(0, Math.round(value))} 秒`;
    if (value < 3600) return `${Math.floor(value / 60)} 分钟`;
    return `${Math.floor(value / 3600)} 小时`;
  }

  function prettyJson(raw) {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return String(raw);
    }
  }

  function formatBudget(value) {
    const text = String(value || "").trim();
    if (!text) return "未指定";
    // 后端的预算可能写成“总预算4000元，未说明费用范围”，封面只保留关键金额。
    const simplified = text
      .replace(/^(?:总)?预算\s*/, "")
      .replace(/，.*$/, "")
      .replace(/,\s*(?=[^\d]|$).*$/, "")
      .replace(/\s+/g, " ")
      .replace(/(\d)(元)/g, "$1 $2")
      .trim();
    return simplified || text;
  }

  function formatTemperature(value) {
    const text = String(value ?? "").trim();
    if (!text || text === "无天气信息") return "";
    const match = /^(-?\d+(?:\.\d+)?)\s*(?:°\s*C|℃|°)?$/i.exec(text);
    if (match) return `${Math.round(Number(match[1]))}°`;
    return text;
  }

  function weatherKind(text) {
    const value = String(text || "");
    if (/雪/.test(value)) return "snow";
    if (/雨|雷|阵雨/.test(value)) return "rain";
    if (/雾|霾|沙|尘/.test(value)) return "fog";
    if (/风|台风/.test(value)) return "wind";
    if (/云|阴/.test(value)) return "cloud";
    if (/晴|阳/.test(value)) return "sun";
    return "cloud";
  }

  function toast(message, duration = 2800) {
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => {
      els.toast.classList.remove("is-visible");
    }, duration);
  }

  function fetchWithTimeout(url, options = {}, timeout = 6000) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => {
      window.clearTimeout(timer);
    });
  }

  /* ------------------------------------------------------------------ */
  /* theme                                                               */
  /* ------------------------------------------------------------------ */

  function applyTheme(theme) {
    const dark = theme === "night";
    document.documentElement.dataset.theme = dark ? "night" : "day";
    els.themeIcon.setAttribute("href", dark ? "#i-sun" : "#i-moon");
    const label = dark ? "切换日间模式" : "切换夜间模式";
    els.themeBtn.setAttribute("aria-label", label);
    els.themeBtn.title = label;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#0d1815" : "#f4efe4");
  }

  function initTheme() {
    const params = new URLSearchParams(location.search);
    const themeParam = params.get("theme");
    const stored = readStorage(STORAGE.theme);
    let theme = "day";
    if (themeParam === "night" || themeParam === "day") theme = themeParam;
    else if (stored === "night") theme = "night";
    applyTheme(theme);
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "night" ? "day" : "night";
    applyTheme(next);
    writeStorage(STORAGE.theme, next);
  }

  /* ------------------------------------------------------------------ */
  /* connection                                                          */
  /* ------------------------------------------------------------------ */

  function setConnection(status, text) {
    els.connBtn.dataset.state = status;
    els.connText.textContent = text;
  }

  async function checkHealth({ quiet = false } = {}) {
    setConnection("checking", "检查服务中");
    try {
      const response = await fetchWithTimeout(
        `${state.apiBase}/api/v1/base/health`,
        { headers: { Accept: "application/json" }, cache: "no-store" },
        5500,
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.msg || `HTTP ${response.status}`);
      }
      const data = body?.data || {};
      state.connected = true;
      setConnection("ok", "后端在线");
      const uptime = formatUptime(data.uptime_seconds);
      els.connBtn.title = [data.service || "旅行后端", uptime ? `已运行 ${uptime}` : "", "点击重新检查"]
        .filter(Boolean)
        .join(" · ");
      if (!state.versionLoaded) loadVersion();
      if (!quiet) toast("后端连接正常");
      return true;
    } catch (error) {
      state.connected = false;
      setConnection("fail", "后端离线");
      els.connBtn.title = `${describeNetworkError(error)} · 点击重新检查`;
      if (!quiet) toast("无法连接后端，请检查服务是否启动");
      return false;
    }
  }

  async function loadVersion() {
    try {
      const response = await fetchWithTimeout(
        `${state.apiBase}/api/v1/base/version`,
        { headers: { Accept: "application/json" }, cache: "no-store" },
        5000,
      );
      if (!response.ok) return;
      const body = await response.json();
      const data = body?.data;
      if (!data) return;
      state.versionLoaded = true;
      els.versionText.textContent = `v${data.version || "0.1.0"} · ${data.app_title || "Travel Agent API"}`;
    } catch {
      /* The footer version is decorative; ignore failures. */
    }
  }

  function describeNetworkError(error) {
    if (!error) return "未知错误";
    if (error.name === "AbortError") return "连接超时";
    if (error instanceof TypeError) return "无法建立连接，请确认后端地址与 CORS 设置";
    return error.message || "连接失败";
  }

  /* ------------------------------------------------------------------ */
  /* mode + composer                                                     */
  /* ------------------------------------------------------------------ */

  function setMode(mode) {
    state.mode = mode === "smart" ? "smart" : "standard";
    const smart = state.mode === "smart";
    modeButtons.forEach((button) => {
      const active = button.dataset.mode === state.mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    els.modeBadge.textContent = smart ? "智能编排" : "标准编排";
    els.modeHint.textContent = smart
      ? "主管代理按需选择步骤，适合复杂或需要动态调整的需求"
      : "固定顺序：需求分析 → 天气查询 → 行程编排";
  }

  function autoGrow() {
    els.query.style.height = "auto";
    const height = Math.min(Math.max(els.query.scrollHeight, 142), 240);
    els.query.style.height = `${height}px`;
  }

  function updateCounter() {
    const length = els.query.value.length;
    els.charCount.textContent = `${length} / 5000`;
    els.charCount.classList.toggle("is-near", length > 4500);
    autoGrow();
  }

  function shakeField() {
    els.field.classList.remove("is-shaking");
    void els.field.offsetWidth;
    els.field.classList.add("is-shaking");
    window.setTimeout(() => els.field.classList.remove("is-shaking"), 450);
  }

  function setView(view) {
    document.body.dataset.view = view;
  }

  function setSubmitLabel() {
    if (state.phase === "planning") {
      els.submitLabel.textContent = "规划中…";
      return;
    }
    if (state.clarification) {
      els.submitLabel.textContent = "补充并继续";
      return;
    }
    if (state.result) {
      els.submitLabel.textContent = "继续调整";
      return;
    }
    els.submitLabel.textContent = "开始规划";
  }

  function focusComposer() {
    els.query.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------------ */
  /* conversation                                                        */
  /* ------------------------------------------------------------------ */

  function pushThread(role, content, options = {}) {
    state.thread.push({
      id: uid(),
      role,
      content: String(content ?? ""),
      send: options.send !== false,
      missing: Array.isArray(options.missing) ? options.missing : [],
      error: Boolean(options.error),
    });
  }

  function buildHistory(currentQuery, { dropLastUser = false } = {}) {
    let items = state.thread
      .filter((message) => message.send && !message.error && (message.role === "user" || message.role === "assistant"))
      .map((message) => ({ role: message.role, content: message.content }));

    if (dropLastUser && items.length) {
      const last = items[items.length - 1];
      if (last.role === "user" && last.content.trim() === String(currentQuery).trim()) {
        items.pop();
      }
    }

    items = items.slice(-20);
    let total = items.reduce((sum, message) => sum + message.content.length, 0);
    while (items.length && total > 20000) {
      total -= items[0].content.length;
      items.shift();
    }
    return items;
  }

  function renderThread() {
    if (!state.thread.length) {
      els.threadCard.hidden = true;
      els.threadList.innerHTML = "";
      return;
    }

    els.threadCard.hidden = false;
    els.threadList.innerHTML = state.thread
      .slice(-16)
      .map((message) => {
        if (message.role === "user") {
          return `<div class="bubble bubble--user">${nl2br(message.content)}</div>`;
        }
        const missing = message.missing.length
          ? `<div class="bubble__missing">${message.missing
              .map((field) => `<span class="mini-tag">${escapeHtml(FIELD_LABELS[field] || field)}</span>`)
              .join("")}</div>`
          : "";
        return `<div class="bubble bubble--assistant${message.error ? " bubble--error" : ""}">
          <span class="bubble__avatar">${icon(message.error ? "i-alert" : "i-spark")}</span>
          <div class="bubble__body">${nl2br(message.content)}${missing}</div>
        </div>`;
      })
      .join("");

    window.requestAnimationFrame(() => {
      els.threadList.scrollTop = els.threadList.scrollHeight;
    });
  }

  /* ------------------------------------------------------------------ */
  /* stages + timeline                                                   */
  /* ------------------------------------------------------------------ */

  function resetStages() {
    stepEls.forEach((element) => {
      element.classList.remove("is-active", "is-done", "is-skipped", "is-error");
    });
  }

  function markAllStagesDone() {
    stepEls.forEach((element) => {
      element.classList.remove("is-active", "is-skipped", "is-error");
      element.classList.add("is-done");
    });
  }

  function markStage(stage, mode) {
    const index = Math.max(0, STAGE_ORDER.indexOf(stage));
    stepEls.forEach((element, itemIndex) => {
      element.classList.remove("is-active", "is-done", "is-skipped", "is-error");
      if (mode === "done") {
        element.classList.add("is-done");
        return;
      }
      if (mode === "clarify") {
        element.classList.add(itemIndex === 0 ? "is-done" : "is-skipped");
        return;
      }
      if (mode === "error") {
        if (itemIndex < index) element.classList.add("is-done");
        else if (itemIndex === index) element.classList.add("is-error");
        else element.classList.add("is-skipped");
        return;
      }
      if (mode === "stopped") {
        element.classList.add("is-skipped");
        return;
      }
      if (itemIndex < index) element.classList.add("is-done");
      else if (itemIndex === index) element.classList.add("is-active");
    });
  }

  function clearTimeline(message = "", live = false) {
    els.timeline.innerHTML = "";
    if (!message) return;
    const node = document.createElement("div");
    node.className = "timeline__empty";
    node.innerHTML = `<span class="timeline__empty-icon">${
      live ? '<span class="live-dot"></span>' : icon("i-spark")
    }</span><p>${escapeHtml(message)}</p>`;
    els.timeline.append(node);
  }

  function appendRecord(record) {
    const empty = els.timeline.querySelector(".timeline__empty");
    if (empty) empty.remove();

    const type = TYPE_META[record.type] ? record.type : "agent";
    const meta = TYPE_META[type];
    const rawContent =
      typeof record.content === "string"
        ? record.content
        : record.content == null
          ? ""
          : JSON.stringify(record.content, null, 2);
    let content = rawContent.trim();
    if (record.contentType === "json" && content) content = prettyJson(content);
    if (content.length > 20000) content = `${content.slice(0, 20000)}\n…（内容过长，已截断）`;

    const details = content
      ? `<details class="event__details"><summary>查看${record.contentType === "json" ? " JSON 输出" : "输出"}</summary><pre class="event__pre">${escapeHtml(content)}</pre></details>`
      : "";

    const article = document.createElement("article");
    article.className = `event event--${type}`;
    article.innerHTML = `<div class="event__rail"><span class="event__dot">${icon(meta.icon)}</span></div>
      <div class="event__body">
        <div class="event__top">
          <span class="event__name" title="${escapeHtml(record.name || "Agent")}">${escapeHtml(recordLabel(record.name))}</span>
          <time class="event__time">${escapeHtml(formatTime(record.createdAt) || "刚刚")}</time>
        </div>
        <p class="event__desc">${escapeHtml(recordDescription(record.desc))}</p>
        ${details}
      </div>`;
    els.timeline.append(article);
    els.timeline.scrollTop = els.timeline.scrollHeight;
  }

  function handleRecord(record) {
    if (!record || typeof record !== "object") return;
    state.records.push(record);
    appendRecord(record);

    const text = `${record.name || ""} ${record.desc || ""}`.toLowerCase();
    let stage = null;
    if (/weather|天气|qweather/.test(text)) stage = "weather";
    else if (/planner|行程|规划/.test(text)) stage = "planner";
    else if (/analyzer|需求|分析/.test(text)) stage = "analysis";

    if (stage) {
      state.activeStage = stage;
      markStage(stage, "running");
      if (STAGE_LOADING_TEXT[stage]) els.loadingText.textContent = STAGE_LOADING_TEXT[stage];
    }

    if (record.name === "旅行规划" && /完成/.test(String(record.desc || ""))) {
      markAllStagesDone();
      els.loadingText.textContent = "正在整理完整行程与天气建议…";
    }
  }

  /* ------------------------------------------------------------------ */
  /* timer                                                               */
  /* ------------------------------------------------------------------ */

  function tickTimer() {
    const seconds = Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
    const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
    const rest = String(seconds % 60).padStart(2, "0");
    els.timer.textContent = `${minutes}:${rest}`;
  }

  function startTimer() {
    stopTimer();
    state.startedAt = Date.now();
    els.timer.hidden = false;
    tickTimer();
    state.timerId = window.setInterval(tickTimer, 1000);
  }

  function stopTimer() {
    if (state.timerId) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* NDJSON streaming                                                    */
  /* ------------------------------------------------------------------ */

  class PlanError extends Error {
    constructor(message, { code = 0, requestId = "" } = {}) {
      super(message);
      this.name = "PlanError";
      this.code = code;
      this.requestId = requestId;
    }
  }

  async function streamPlan({ query, mode, history, signal, onRecord }) {
    let response;
    try {
      response = await fetch(`${state.apiBase}/api/v1/travel/plan/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson",
        },
        body: JSON.stringify({ query, mode, history }),
        signal,
        cache: "no-store",
      });
    } catch (error) {
      if (error && error.name === "AbortError") throw error;
      throw new PlanError(
        "无法连接 Python 后端。请确认 FastAPI 已启动（默认 127.0.0.1:8001），并在右上角设置中检查后端地址。",
      );
    }

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new PlanError(body?.msg || `后端请求失败（HTTP ${response.status}）`, {
        code: Number(body?.code) || response.status,
        requestId: body?.request_id || "",
      });
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("ndjson")) {
      throw new PlanError("后端没有返回执行进度流，请检查 /api/v1/travel/plan/stream 是否指向 Python 后端。");
    }

    if (!response.body) {
      throw new PlanError("当前浏览器无法读取执行进度流。");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    const consumeLine = (line) => {
      let text = line.replace(/\r$/, "").replace(/^\uFEFF/, "");
      if (!text.trim()) return null;

      let event;
      try {
        event = JSON.parse(text);
      } catch {
        throw new PlanError("后端返回了无效的进度数据，请重试。");
      }

      if (!event || typeof event !== "object" || !("event" in event)) {
        throw new PlanError("后端返回了无效的进度数据，请重试。");
      }

      if (event.event === "record") {
        if (event.data && typeof event.data === "object") onRecord(event.data);
        return null;
      }
      if (event.event === "result") {
        return { kind: "result", result: event.data };
      }
      if (event.event === "clarification") {
        return { kind: "clarification", clarification: event.data };
      }
      if (event.event === "error") {
        const data = event.data || {};
        throw new PlanError(data.message || "旅行规划失败，请稍后重试。", {
          code: Number(data.code) || 500,
          requestId: data.request_id || "",
        });
      }
      if (event.event === "heartbeat") return null;
      return null;
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });

        let newline = buffer.indexOf("\n");
        while (newline !== -1) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          const reply = consumeLine(line);
          if (reply) return reply;
          newline = buffer.indexOf("\n");
        }

        if (done) {
          const reply = consumeLine(buffer);
          if (reply) return reply;
          throw new PlanError("与后端的连接已结束，但没有收到完整旅行计划，请重试。");
        }
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        /* The stream may already be closed. */
      }
      reader.releaseLock();
    }
  }

  /* ------------------------------------------------------------------ */
  /* run lifecycle                                                       */
  /* ------------------------------------------------------------------ */

  function startPlanning() {
    const query = els.query.value.trim();
    if (!query) {
      shakeField();
      toast("先写下一点旅行想法吧");
      focusComposer();
      return;
    }
    if (query.length > 5000) {
      toast("旅行需求最多 5000 字");
      return;
    }
    if (state.phase === "planning") return;
    runPlan(query);
  }

  async function runPlan(query, { appendUser = true } = {}) {
    if (state.phase === "planning") return;

    if (state.isDemo) clearDemo();
    const history = buildHistory(query, { dropLastUser: !appendUser });
    const runId = ++state.runId;

    if (appendUser) pushThread("user", query, { send: true });
    else renderThread();

    state.phase = "planning";
    state.result = null;
    state.clarification = null;
    state.records = [];
    state.activeStage = null;
    state.lastQuery = query;
    state.controller = new AbortController();
    setView("planning");

    els.report.hidden = true;
    els.report.innerHTML = "";
    els.clarify.hidden = true;
    els.stageError.hidden = true;
    els.stageError.innerHTML = "";
    els.stageEmpty.hidden = true;
    els.stageLoading.hidden = false;
    els.stage.setAttribute("aria-busy", "true");
    els.loadingText.textContent = "正在确认目的地、日期、天数与预算…";
    els.submitBtn.disabled = true;
    els.submitLabel.textContent = "规划中…";
    els.cancelBtn.hidden = false;
    els.cancelBtn.disabled = false;
    els.timer.hidden = false;
    els.query.value = "";
    els.query.placeholder = DEFAULT_PLACEHOLDER;
    updateCounter();
    resetStages();
    clearTimeline("正在唤醒智能体…", true);
    startTimer();
    renderThread();
    setSubmitLabel();

    try {
      const reply = await streamPlan({
        query,
        mode: state.mode,
        history,
        signal: state.controller.signal,
        onRecord: handleRecord,
      });

      if (state.runId !== runId) return;

      if (reply.kind === "result") handleResult(reply.result);
      else handleClarification(reply.clarification);
    } catch (error) {
      if (state.runId !== runId) return;
      if (error && error.name === "AbortError") handleStopped();
      else handleFailure(error);
    } finally {
      if (state.runId === runId) {
        state.controller = null;
        stopTimer();
        els.stage.setAttribute("aria-busy", "false");
        els.submitBtn.disabled = false;
        els.cancelBtn.hidden = true;
        els.cancelBtn.disabled = false;
        setSubmitLabel();
      }
    }
  }

  function handleResult(result) {
    if (!result || typeof result !== "object") {
      throw new PlanError("后端返回的旅行计划为空，请重试。");
    }

    state.result = result;
    state.clarification = null;
    state.isDemo = false;
    state.phase = "done";
    state.activeStage = "planner";
    setView("result");

    stopTimer();
    markAllStagesDone();
    if (!state.records.length) clearTimeline("规划完成");
    els.stageLoading.hidden = true;
    els.stageEmpty.hidden = true;
    els.clarify.hidden = true;
    els.stageError.hidden = true;
    els.stageError.innerHTML = "";

    renderReport(result, { demo: false });
    els.report.hidden = false;
    els.query.placeholder = DEFAULT_PLACEHOLDER;

    pushThread("assistant", resultSummary(result), { send: true });
    renderThread();
    setSubmitLabel();
    toast("行程已经生成，可以继续调整细节");

    if (window.matchMedia("(max-width: 980px)").matches) {
      window.setTimeout(() => {
        els.stage.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
    }
  }

  function handleClarification(clarification) {
    if (!clarification || typeof clarification !== "object") {
      throw new PlanError("后端返回的补充信息为空，请重试。");
    }

    state.clarification = clarification;
    state.result = null;
    state.isDemo = false;
    state.phase = "clarify";
    state.activeStage = "analysis";
    setView("clarify");

    stopTimer();
    markStage("analysis", "clarify");
    if (!state.records.length) clearTimeline("等待补充信息");
    els.stageLoading.hidden = true;
    els.stageEmpty.hidden = true;
    els.report.hidden = true;
    els.stageError.hidden = true;
    els.stageError.innerHTML = "";

    renderClarification(clarification);
    els.clarify.hidden = false;

    const message = clarification.message || "还需要补充一些信息才能继续规划。";
    pushThread("assistant", message, {
      send: true,
      missing: Array.isArray(clarification.missingFields) ? clarification.missingFields : [],
    });
    renderThread();

    const missing = Array.isArray(clarification.missingFields) ? clarification.missingFields : [];
    els.query.placeholder = clarifyPlaceholder(missing);
    setSubmitLabel();
    toast("还差一点信息，补充后就能继续");

    window.setTimeout(() => {
      if (window.matchMedia("(min-width: 981px)").matches) focusComposer();
    }, 80);
  }

  function handleFailure(error) {
    state.phase = "error";
    state.isDemo = false;
    setView("error");
    stopTimer();
    markStage(state.activeStage || "analysis", "error");
    els.stageLoading.hidden = true;
    els.stageEmpty.hidden = true;
    els.report.hidden = true;
    els.clarify.hidden = true;
    if (!state.records.length) clearTimeline("未能开始执行");
    renderStageError({
      title: "这次没有走通",
      message: error?.message || "旅行规划失败，请稍后重试。",
      requestId: error?.requestId || "",
      variant: "error",
    });
    els.stageError.hidden = false;

    const bubble = error?.requestId
      ? `${error.message || "旅行规划失败，请稍后重试。"}\n请求 ID：${error.requestId}`
      : error?.message || "旅行规划失败，请稍后重试。";
    pushThread("assistant", bubble, { send: false, error: true });
    renderThread();
    setSubmitLabel();
    toast("规划失败，可以重试或检查后端设置", 3600);
  }

  function handleStopped() {
    state.phase = "idle";
    state.isDemo = false;
    setView("idle");
    stopTimer();
    markStage(state.activeStage || "analysis", "stopped");
    els.stageLoading.hidden = true;
    els.report.hidden = true;
    els.clarify.hidden = true;
    els.stageError.hidden = true;

    if (!state.records.length) {
      els.stageEmpty.hidden = false;
      clearTimeline();
    } else {
      renderStageError({
        title: "已停止本次规划",
        message: "执行记录仍保留在左侧。你可以重新尝试，或继续补充需求后再开始。",
        requestId: "",
        variant: "stopped",
      });
      els.stageError.hidden = false;
    }

    setSubmitLabel();
    toast("已停止本次规划");
  }

  function retryLast() {
    if (state.phase === "planning" || !state.lastQuery) {
      focusComposer();
      return;
    }
    runPlan(state.lastQuery, { appendUser: false });
  }

  function newTrip() {
    state.runId += 1;
    if (state.controller) {
      state.controller.abort();
      state.controller = null;
    }

    state.phase = "idle";
    state.isDemo = false;
    state.result = null;
    state.clarification = null;
    state.records = [];
    state.thread = [];
    state.lastQuery = "";
    state.activeStage = null;
    setView("idle");

    stopTimer();
    els.timer.hidden = true;
    els.report.hidden = true;
    els.report.innerHTML = "";
    els.clarify.hidden = true;
    els.stageError.hidden = true;
    els.stageError.innerHTML = "";
    els.stageLoading.hidden = true;
    els.stageEmpty.hidden = false;
    els.threadCard.hidden = true;
    els.threadList.innerHTML = "";
    els.query.value = "";
    els.query.placeholder = DEFAULT_PLACEHOLDER;
    els.submitBtn.disabled = false;
    els.cancelBtn.hidden = true;
    els.stage.setAttribute("aria-busy", "false");
    updateCounter();
    resetStages();
    clearTimeline();
    setSubmitLabel();
    toast("新的旅程，从哪里开始？");
    focusComposer();
  }

  /* ------------------------------------------------------------------ */
  /* clarification                                                       */
  /* ------------------------------------------------------------------ */

  function clarifyPlaceholder(missing) {
    const labels = (Array.isArray(missing) ? missing : [])
      .map((field) => FIELD_LABELS[field] || field)
      .filter(Boolean);
    if (!labels.length) return "补充一些信息，继续这次旅行规划…";
    if (labels.length >= 2) return `补充${labels.slice(0, 2).join("和")}，例如：成都，下周五出发，玩三天，预算 5000 元`;
    return `补充${labels[0]}，继续这次旅行规划…`;
  }

  function renderClarification(clarification) {
    const missing = Array.isArray(clarification.missingFields) ? clarification.missingFields : [];
    const draft = clarification.draft && typeof clarification.draft === "object" ? clarification.draft : {};

    els.clarifyMessage.innerHTML = nl2br(
      clarification.message || "还需要补充一些信息才能继续规划。",
    );

    els.clarifyMissing.innerHTML = missing.length
      ? `<span class="label">还需要</span>${missing
          .map(
            (field) =>
              `<span class="missing-field">${escapeHtml(FIELD_LABELS[field] || field)}</span>`,
          )
          .join("")}`
      : "";

    const preferences = Array.isArray(draft.preferences) && draft.preferences.length
      ? draft.preferences.join("、")
      : "";
    const items = [
      ["目的地", draft.destination],
      ["出发日期", draft.startDate],
      ["旅行天数", draft.duration ? `${draft.duration} 天` : ""],
      ["预算", draft.budget],
      ["同行人数", draft.travelers ? `${draft.travelers} 人` : ""],
      ["偏好", preferences],
    ];

    els.clarifyDraft.innerHTML = items
      .map(([label, value]) => {
        const text = value ? String(value) : "待补充";
        return `<div class="draft-item${value ? "" : " is-empty"}">
          <span>${escapeHtml(label)}</span>
          <b title="${escapeHtml(text)}">${escapeHtml(text)}</b>
        </div>`;
      })
      .join("");
  }

  /* ------------------------------------------------------------------ */
  /* report rendering                                                    */
  /* ------------------------------------------------------------------ */

  function resultSummary(result) {
    const analysis = result?.analysis?.json || {};
    const destination = analysis.destination || "目的地";
    const duration = analysis.duration ? `${analysis.duration} 天` : "";
    const budget = formatBudget(analysis.budget);
    return `行程已经准备好了。\n${destination}${duration ? ` · ${duration}` : ""}\n${
      analysis.startDate ? `${formatLongDate(analysis.startDate)} 出发 · ` : ""
    }预算 ${budget}。\n可以在工作台查看完整报告，也可以继续告诉我想调整什么。`;
  }

  function tagForSource(source) {
    const value = String(source || "");
    if (!value) return "";
    if (value.startsWith("model")) {
      return `<span class="tag tag--warn" title="${escapeHtml(value)}">待核实</span>`;
    }
    return `<span class="tag tag--source" title="${escapeHtml(value)}">景点库已校验</span>`;
  }

  function renderReport(result, { demo = false } = {}) {
    const analysis = result?.analysis?.json && typeof result.analysis.json === "object"
      ? result.analysis.json
      : {};
    const weather = Array.isArray(result?.weather?.json) ? result.weather.json : [];
    const days = Array.isArray(result?.planner?.json) ? result.planner.json : [];
    const allDates = Array.isArray(analysis.allDates) && analysis.allDates.length
      ? analysis.allDates
      : analysis.startDate
        ? [analysis.startDate]
        : [];
    const startDate = analysis.startDate || allDates[0] || "";
    const endDate = allDates[allDates.length - 1] || startDate;
    const destination = analysis.destination || "未命名目的地";
    const duration = Number(analysis.duration) || days.length || 1;
    const rawBudget = analysis.budget || "未指定";
    const budget = formatBudget(rawBudget);
    const travelers = Number(analysis.travelers) || 1;
    const preferences = Array.isArray(analysis.preferences)
      ? analysis.preferences.filter(Boolean)
      : [];
    const year = startDate ? String(startDate).slice(0, 4) : "";
    const totalStops = days.reduce(
      (total, day) => total + (Array.isArray(day.plan) ? day.plan.length : 0),
      0,
    );

    const chips = [
      `<span class="meta-chip" title="${escapeHtml(rawBudget)}">${icon("i-wallet")}预算 · ${escapeHtml(budget)}</span>`,
      `<span class="meta-chip">${icon("i-users")}${escapeHtml(`${travelers} 人`)}</span>`,
      preferences.length
        ? `<span class="meta-chip">${icon("i-spark")}${escapeHtml(preferences.join(" · "))}</span>`
        : "",
    ].join("");

    const stamp = demo
      ? '<span class="cover__stamp cover__stamp--demo">SAMPLE<br />示例</span>'
      : '<span class="cover__stamp">AI<br />PLANNED</span>';

    const routeSvg = `<svg class="cover__route" viewBox="0 0 300 170" fill="none" aria-hidden="true">
      <path d="M6 150C58 132 54 76 114 72s58 36 96 10 46-42 84-54" stroke="rgba(248,243,232,.28)" stroke-width="1.2" stroke-dasharray="4 7" />
      <circle cx="114" cy="72" r="3" fill="rgba(248,243,232,.6)" />
      <circle cx="210" cy="82" r="3" fill="rgba(231,196,129,.9)" />
    </svg>`;

    const cover = `<section class="report__cover">
      ${routeSvg}
      <div class="cover__top">
        <p class="cover__kicker">TRAVEL DOSSIER · ${escapeHtml(year || "JOURNEY")}</p>
        ${stamp}
      </div>
      <div class="cover__main">
        <p class="cover__place">DESTINATION / 目的地</p>
        <h2 class="cover__title">${escapeHtml(destination)}<span>${escapeHtml(`${duration} 日`)}</span></h2>
        <p class="cover__dates">${escapeHtml(formatDateRange(startDate, endDate))}${
          weekdayOf(startDate) ? ` · ${escapeHtml(weekdayOf(startDate))}出发` : ""
        }</p>
      </div>
      <div class="cover__meta">${chips}</div>
      <div class="cover__actions">
        <button type="button" class="cover-btn cover-btn--primary" data-action="copy">${icon("i-copy")}复制行程</button>
        <button type="button" class="cover-btn" data-action="download">${icon("i-download")}导出 JSON</button>
        <button type="button" class="cover-btn" data-action="new-trip">${icon("i-refresh")}新建旅程</button>
      </div>
      <span class="cover__ghost" aria-hidden="true">${escapeHtml(destination)}</span>
    </section>`;

    const sourceCount = weather.filter((day) => day && day.source === "qweather").length;
    const sourceNote = !weather.length
      ? "暂无天气数据"
      : sourceCount === weather.length
        ? "和风天气 · 实时预报"
        : sourceCount > 0
          ? "部分日期天气缺失"
          : "天气数据暂不可用";

    const weatherCards = weather.length
      ? weather
          .map((day, index) => {
            const kind = weatherKind(day?.weather);
            const unavailable =
              !day ||
              day.source === "unavailable" ||
              !day.weather ||
              day.weather === "无天气信息";
            const high = unavailable ? "—" : formatTemperature(day.high) || "—";
            const low = unavailable ? "" : formatTemperature(day.low);
            return `<article class="weather-card weather-card--${kind}${
              unavailable ? " weather-card--muted" : ""
            }" style="animation-delay:${Math.min(index * 45, 240)}ms">
              <div class="weather-card__top">
                <span class="weather-card__icon">${icon(WEATHER_ICONS[kind] || "i-cloud")}</span>
                <time class="weather-card__date">${escapeHtml(formatShortDate(day?.date))}</time>
              </div>
              <div class="weather-card__temp"><b>${escapeHtml(high)}</b><span>${escapeHtml(low)}</span></div>
              <p class="weather-card__cond">${escapeHtml(unavailable ? "暂无预报" : day.weather)}</p>
              <p class="weather-card__tip" title="${escapeHtml(
                unavailable
                  ? "暂无天气预报，请在出发前查询实际天气。"
                  : day.recommendations || "暂无出行建议。",
              )}">${escapeHtml(
                unavailable
                  ? "暂无天气预报，请在出发前查询实际天气。"
                  : day.recommendations || "暂无出行建议。",
              )}</p>
            </article>`;
          })
          .join("")
      : '<div class="empty-report">暂时没有可用的天气数据，出发前请再次查询。</div>';

    const weatherSection = `<section class="report__section" aria-labelledby="weatherTitle">
      <div class="section-head">
        <div><p class="kicker">ALONG THE WAY</p><h3 id="weatherTitle">沿途天气</h3></div>
        <p class="section-note">${escapeHtml(sourceNote)}</p>
      </div>
      <div class="weather-grid">${weatherCards}</div>
    </section>`;

    const dayCards = days.length
      ? days
          .map((day, index) => {
            const plan = Array.isArray(day?.plan) ? day.plan : [];
            const tips = day?.generalTips
              ? `<p class="day-tip">${icon("i-leaf")}<span>${nl2br(day.generalTips)}</span></p>`
              : "";
            const stops = plan.length
              ? plan
                  .map(
                    (activity) => `<li class="stop">
                      <time class="stop__time">${escapeHtml(activity?.time || "时间待定")}</time>
                      <span class="stop__dot" aria-hidden="true"></span>
                      <div class="stop__body">
                        <div class="stop__head">
                          <h5 class="stop__title">${escapeHtml(activity?.activity || "未命名安排")}</h5>
                          ${tagForSource(activity?.source)}
                        </div>
                        ${
                          activity?.notes
                            ? `<p class="stop__notes">${nl2br(activity.notes)}</p>`
                            : ""
                        }
                      </div>
                    </li>`,
                  )
                  .join("")
              : '<li class="stop"><span></span><span class="stop__dot"></span><div class="stop__body"><p class="stop__notes">暂无具体安排，可根据当天状态自由探索。</p></div></li>';

            return `<article class="day-card" style="animation-delay:${Math.min(index * 55, 280)}ms">
              <div class="day-card__marker">
                <span>DAY</span>
                <b>${String(index + 1).padStart(2, "0")}</b>
                <small>${escapeHtml(formatShortDate(day?.date))}<br />${escapeHtml(weekdayOf(day?.date))}</small>
              </div>
              <div class="day-card__body">
                <div class="day-card__head">
                  <div>
                    <h4>${escapeHtml(formatShortDate(day?.date))} · ${escapeHtml(weekdayOf(day?.date))}</h4>
                    <p>第 ${index + 1} 天 · ${plan.length} 个安排</p>
                  </div>
                  <span class="day-card__count">${plan.length} 站</span>
                </div>
                <ol class="stops">${stops}</ol>
                ${tips}
              </div>
            </article>`;
          })
          .join("")
      : '<div class="empty-report">行程数据为空，请重新规划。</div>';

    const itinerarySection = `<section class="report__section" aria-labelledby="itineraryTitle">
      <div class="section-head">
        <div><p class="kicker">DAY BY DAY</p><h3 id="itineraryTitle">逐日行程</h3></div>
        <p class="section-note">${days.length} 天 · ${totalStops} 个安排</p>
      </div>
      <div class="itinerary">${dayCards}</div>
    </section>`;

    const extra = String(analysis.extraRequirements || "").trim();
    const plannerText = String(result?.planner?.text || "").trim();
    const analysisText = String(result?.analysis?.text || "").trim();
    const notes = [];
    if (extra) {
      notes.push(`<div class="note-grid"><div class="note-item"><span>你的补充要求</span><p>${nl2br(extra)}</p></div></div>`);
    }
    if (plannerText || analysisText) {
      notes.push(`<details class="notes-fold">
        <summary><span class="summary-left">${icon("i-book")}阅读规划师的完整手记</span></summary>
        <div class="notes-fold__body">
          ${plannerText ? `<div class="prewrap prewrap--serif">${nl2br(plannerText)}</div>` : ""}
          ${analysisText ? `<div class="prewrap">${nl2br(analysisText)}</div>` : ""}
        </div>
      </details>`);
    }
    const notesSection = notes.length
      ? `<section class="report__notes">${notes.join("")}</section>`
      : "";

    const disclaimer = `<p class="disclaimer">${icon("i-alert")}<span>${
      demo
        ? "以上为示例数据，仅用于展示界面。开始你的规划后，将使用真实的后端结果。"
        : "行程由 AI 生成，景点开放时间、门票与交通请以官方信息为准。天气数据来自和风天气，未覆盖日期已明确标注。"
    }</span></p>`;

    els.report.innerHTML = `${cover}${weatherSection}${itinerarySection}${notesSection}${disclaimer}`;
  }

  function renderStageError({ title, message, requestId, variant }) {
    const stopped = variant === "stopped";
    els.stageError.innerHTML = `<div class="error-card${stopped ? " error-card--stopped" : ""}">
      <div class="error-card__icon">${stopped ? icon("i-stop") : "!"}</div>
      <p class="kicker">${stopped ? "JOURNEY PAUSED" : "SOMETHING WENT WRONG"}</p>
      <h2>${escapeHtml(title)}</h2>
      <p>${nl2br(message)}</p>
      ${requestId ? `<p class="error-card__ref">Request ID · ${escapeHtml(requestId)}</p>` : ""}
      <div class="error-card__actions">
        ${state.lastQuery ? `<button type="button" class="btn btn--primary" data-action="retry">重新尝试</button>` : ""}
        <button type="button" class="btn btn--ghost" data-action="open-settings">检查后端设置</button>
      </div>
    </div>`;
  }

  /* ------------------------------------------------------------------ */
  /* copy + download                                                     */
  /* ------------------------------------------------------------------ */

  function planToText(result) {
    const analysis = result?.analysis?.json || {};
    const weather = Array.isArray(result?.weather?.json) ? result.weather.json : [];
    const days = Array.isArray(result?.planner?.json) ? result.planner.json : [];
    const allDates = Array.isArray(analysis.allDates) && analysis.allDates.length
      ? analysis.allDates
      : analysis.startDate
        ? [analysis.startDate]
        : [];
    const start = analysis.startDate || allDates[0] || "";
    const end = allDates[allDates.length - 1] || start;
    const lines = [];

    lines.push(`【${analysis.destination || "旅行计划"} · ${analysis.duration || days.length || 1} 天】`);
    lines.push(`日期：${formatLongDate(start)}${end && end !== start ? ` — ${formatLongDate(end)}` : ""}`);
    lines.push(`预算：${formatBudget(analysis.budget)}`);
    lines.push(`同行：${analysis.travelers || 1} 人`);
    if (Array.isArray(analysis.preferences) && analysis.preferences.length) {
      lines.push(`偏好：${analysis.preferences.join("、")}`);
    }
    lines.push("");

    if (weather.length) {
      lines.push("【天气】");
      weather.forEach((day) => {
        const unavailable = !day || day.source === "unavailable" || day.weather === "无天气信息";
        const high = formatTemperature(day?.high) || "—";
        const low = formatTemperature(day?.low);
        lines.push(
          `${formatShortDate(day?.date)}  ${
            unavailable ? "暂无预报" : `${day.weather} ${high}${low ? `/${low}` : ""}`
          }  ${unavailable ? "出发前请再次查询" : day.recommendations || ""}`,
        );
      });
      lines.push("");
    }

    lines.push("【行程】");
    days.forEach((day, index) => {
      lines.push(`第${index + 1}天 · ${formatLongDate(day?.date)} ${weekdayOf(day?.date)}`);
      const plan = Array.isArray(day?.plan) ? day.plan : [];
      plan.forEach((activity) => {
        lines.push(`  ${activity?.time || "时间待定"}  ${activity?.activity || "未命名安排"}`);
        if (activity?.notes) lines.push(`    · ${activity.notes}`);
      });
      if (day?.generalTips) lines.push(`  当日建议：${day.generalTips}`);
      lines.push("");
    });

    if (analysis.extraRequirements) lines.push(`补充要求：${analysis.extraRequirements}`);
    lines.push("由远行 AI 生成，出行前请核实开放时间与价格。");
    return lines.join("\n");
  }

  async function copyPlan() {
    if (!state.result) return;
    const text = planToText(state.result);
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopy(text);
      }
      toast("行程已复制到剪贴板");
    } catch {
      fallbackCopy(text);
      toast("行程已复制");
    }
  }

  function fallbackCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
    document.body.append(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
    } finally {
      textarea.remove();
    }
  }

  function downloadPlan() {
    if (!state.result) return;
    const analysis = state.result?.analysis?.json || {};
    const safeName = `travel-plan-${analysis.destination || "trip"}-${analysis.startDate || "draft"}`
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, "-");
    const blob = new Blob([JSON.stringify(state.result, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeName}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast("JSON 已导出");
  }

  /* ------------------------------------------------------------------ */
  /* demo                                                                */
  /* ------------------------------------------------------------------ */

  function showDemo({ silent = false } = {}) {
    if (state.phase === "planning") {
      toast("请先停止当前规划，再看示例");
      return;
    }

    state.runId += 1;
    if (state.controller) {
      state.controller.abort();
      state.controller = null;
    }
    state.isDemo = true;
    state.phase = "done";
    state.result = DEMO_RESULT;
    state.clarification = null;
    state.records = DEMO_RECORDS.map((record) => ({ ...record }));
    state.activeStage = "planner";
    setView("result");
    state.thread = [
      {
        id: uid(),
        role: "assistant",
        content:
          "这是一份示例行程：成都三天，两个人，预算 5000 元。它展示了报告、天气和逐日安排的样子。准备好后，直接在左侧写下你的旅行想法即可。",
        send: false,
        missing: [],
        error: false,
      },
    ];

    stopTimer();
    els.timer.hidden = true;
    els.stageEmpty.hidden = true;
    els.stageLoading.hidden = true;
    els.clarify.hidden = true;
    els.stageError.hidden = true;
    els.stageError.innerHTML = "";
    els.report.hidden = false;
    els.threadCard.hidden = false;
    els.query.value = "";
    els.query.placeholder = DEFAULT_PLACEHOLDER;
    updateCounter();
    renderReport(DEMO_RESULT, { demo: true });
    renderThread();
    clearTimeline();
    DEMO_RECORDS.forEach(appendRecord);
    markAllStagesDone();
    setSubmitLabel();

    if (!silent) toast("已载入示例行程，可随时开始你自己的规划");
    if (window.matchMedia("(max-width: 980px)").matches) {
      window.setTimeout(() => {
        els.stage.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
    }
  }

  function clearDemo() {
    state.isDemo = false;
    state.result = null;
    state.records = [];
    state.thread = [];
    state.activeStage = null;
    els.report.hidden = true;
    els.report.innerHTML = "";
    els.threadCard.hidden = true;
    els.threadList.innerHTML = "";
    clearTimeline();
    resetStages();
  }

  /* ------------------------------------------------------------------ */
  /* settings dialog                                                     */
  /* ------------------------------------------------------------------ */

  function showSettingsStatus(kind, message) {
    els.settingsStatus.hidden = false;
    els.settingsStatus.className = "dialog__status";
    if (kind === "ok") els.settingsStatus.classList.add("is-ok");
    if (kind === "fail") els.settingsStatus.classList.add("is-fail");
    els.settingsStatus.textContent = message;
  }

  function openSettings() {
    els.apiInput.value = state.apiBase;
    els.settingsStatus.hidden = true;
    els.settingsStatus.className = "dialog__status";
    els.testBtn.disabled = false;
    if (typeof els.settingsDialog.showModal === "function") {
      if (!els.settingsDialog.open) els.settingsDialog.showModal();
    } else {
      els.settingsDialog.setAttribute("open", "");
    }
    window.setTimeout(() => {
      els.apiInput.focus();
      els.apiInput.select();
    }, 40);
  }

  function closeSettings() {
    if (typeof els.settingsDialog.close === "function") els.settingsDialog.close();
    else els.settingsDialog.removeAttribute("open");
  }

  async function testApiBase(value) {
    const base = normalizeApiBase(value);
    if (!base) {
      showSettingsStatus("fail", "请输入完整的 http(s) 地址，例如 http://127.0.0.1:8001");
      return false;
    }
    showSettingsStatus("neutral", "正在连接…");
    els.testBtn.disabled = true;
    try {
      const response = await fetchWithTimeout(
        `${base}/api/v1/base/health`,
        { headers: { Accept: "application/json" }, cache: "no-store" },
        5500,
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.msg || `HTTP ${response.status}`);
      const data = body?.data || {};
      showSettingsStatus(
        "ok",
        `连接成功 · ${data.service || "旅行后端"}${data.environment ? ` · ${data.environment}` : ""}`,
      );
      return true;
    } catch (error) {
      showSettingsStatus("fail", `连接失败：${describeNetworkError(error)}`);
      return false;
    } finally {
      els.testBtn.disabled = false;
    }
  }

  function saveApiBase(value) {
    const base = normalizeApiBase(value);
    if (!base) {
      showSettingsStatus("fail", "请输入完整的 http(s) 地址，例如 http://127.0.0.1:8001");
      return;
    }
    state.apiBase = base;
    state.apiBaseExplicit = true;
    state.versionLoaded = false;
    writeStorage(STORAGE.api, base);
    syncApiLinks();
    closeSettings();
    toast("后端地址已保存");
    checkHealth({ quiet: false });
  }

  /* ------------------------------------------------------------------ */
  /* events                                                              */
  /* ------------------------------------------------------------------ */

  function bindEvents() {
    els.planForm.addEventListener("submit", (event) => {
      event.preventDefault();
      startPlanning();
    });

    els.query.addEventListener("input", updateCounter);

    els.query.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        els.planForm.requestSubmit();
      }
    });

    els.examples.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-fill]");
      if (!chip || state.phase === "planning") return;
      els.query.value = chip.dataset.fill || "";
      updateCounter();
      focusComposer();
    });

    modeButtons.forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.mode));
    });

    els.cancelBtn.addEventListener("click", () => {
      if (!state.controller) return;
      els.cancelBtn.disabled = true;
      state.controller.abort();
    });

    els.newTripBtn.addEventListener("click", newTrip);
    els.demoBtn.addEventListener("click", () => showDemo());
    els.connBtn.addEventListener("click", () => checkHealth({ quiet: false }));

    els.themeBtn.addEventListener("click", toggleTheme);

    els.settingsBtn.addEventListener("click", openSettings);
    els.closeSettings.addEventListener("click", closeSettings);
    els.cancelSettings.addEventListener("click", closeSettings);

    els.saveApiBtn.addEventListener("click", () => saveApiBase(els.apiInput.value));
    els.testBtn.addEventListener("click", () => testApiBase(els.apiInput.value));

    els.apiInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveApiBase(els.apiInput.value);
      }
    });

    els.settingsDialog.addEventListener("click", (event) => {
      if (event.target === els.settingsDialog) closeSettings();
    });

    els.report.addEventListener("click", (event) => {
      const action = event.target.closest("[data-action]");
      if (!action) return;
      if (action.dataset.action === "copy") copyPlan();
      else if (action.dataset.action === "download") downloadPlan();
      else if (action.dataset.action === "new-trip") newTrip();
    });

    els.stageError.addEventListener("click", (event) => {
      const action = event.target.closest("[data-action]");
      if (!action) return;
      if (action.dataset.action === "retry") retryLast();
      else if (action.dataset.action === "open-settings") openSettings();
    });

    window.addEventListener("online", () => checkHealth({ quiet: true }));
  }

  /* ------------------------------------------------------------------ */
  /* demo data                                                           */
  /* ------------------------------------------------------------------ */

  const DEMO_RESULT = {
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

  const DEMO_RECORDS = [
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

  /* ------------------------------------------------------------------ */
  /* init                                                                */
  /* ------------------------------------------------------------------ */

  function init() {
    stepEls = Array.from(document.querySelectorAll(".stage-step"));
    modeButtons = Array.from(document.querySelectorAll(".mode__opt"));

    initTheme();
    const resolvedApi = resolveApiBase();
    state.apiBase = resolvedApi.base;
    state.apiBaseExplicit = resolvedApi.explicit;
    syncApiLinks();
    bindEvents();
    setMode("standard");
    setView("idle");
    updateCounter();
    setSubmitLabel();

    const params = new URLSearchParams(location.search);
    const fill = params.get("fill");
    if (fill) {
      els.query.value = fill.slice(0, 5000);
      updateCounter();
    }

    bootstrapConnection();

    if (params.get("demo") === "1") showDemo({ silent: true });
  }

  init();
})();
