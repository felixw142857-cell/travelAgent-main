// 原始页面的 SVG 与文案，保留为静态 React 组件。
export function Icon({ name, className = "" }: { name: string; className?: string }) {
  return <svg className={`icon ${className}`} aria-hidden="true"><use href={`#i-${name}`} /></svg>;
}
export function IconSprite() { return (  <svg className="svg-defs" aria-hidden="true" focusable="false">
    <symbol id="i-compass" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9 4.9-2.1Z" /></symbol>
    <symbol id="i-plane" viewBox="0 0 24 24"><path d="M21 3 3 10.5l6.1 2.4L12 21l3-6 6-12Z" /><path d="m9.1 12.9 3.2-3.2" /></symbol>
    <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M4 12h15" /><path d="m13 6 6 6-6 6" /></symbol>
    <symbol id="i-spark" viewBox="0 0 24 24"><path d="M12 3.5c.6 3.7 2.8 5.9 6.5 6.5-3.7.6-5.9 2.8-6.5 6.5-.6-3.7-2.8-5.9-6.5-6.5 3.7-.6 5.9-2.8 6.5-6.5Z" /><path d="M18.5 15.5c.3 1.6 1.2 2.5 2.8 2.8-1.6.3-2.5 1.2-2.8 2.8-.3-1.6-1.2-2.5-2.8-2.8 1.6-.3 2.5-1.2 2.8-2.8Z" /><path d="M5 16.5c.2 1.1.8 1.8 2 2-1.2.2-1.8.9-2 2-.2-1.1-.8-1.8-2-2 1.2-.2 1.8-.9 2-2Z" /></symbol>
    <symbol id="i-pin" viewBox="0 0 24 24"><path d="M20 10c0 5.2-8 11-8 11s-8-5.8-8-11a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.6" /></symbol>
    <symbol id="i-calendar" viewBox="0 0 24 24"><rect x="3.5" y="5.5" width="17" height="15" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /><path d="M8 14h2M14 14h2M8 17.5h2" /></symbol>
    <symbol id="i-wallet" viewBox="0 0 24 24"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v12H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" /><path d="M4 8h16" /><path d="M16 12h4v4h-4a2 2 0 0 1 0-4Z" /></symbol>
    <symbol id="i-users" viewBox="0 0 24 24"><circle cx="9" cy="8.5" r="3.5" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.5a3.5 3.5 0 0 1 0 6.6" /><path d="M17.5 14.5A5.5 5.5 0 0 1 21 20" /></symbol>
    <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.2 2" /></symbol>
    <symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" /></symbol>
    <symbol id="i-cloud" viewBox="0 0 24 24"><path d="M6.5 18.5a4 4 0 0 1-.4-8 6 6 0 0 1 11.4 1.3 3.6 3.6 0 0 1-.5 6.7H6.5Z" /></symbol>
    <symbol id="i-rain" viewBox="0 0 24 24"><path d="M6.5 15.5a4 4 0 0 1-.4-8 6 6 0 0 1 11.4 1.3 3.6 3.6 0 0 1-.5 6.7H6.5Z" /><path d="m8.5 18.5-1 2M12.5 18.5l-1 2M16.5 18.5l-1 2" /></symbol>
    <symbol id="i-snow" viewBox="0 0 24 24"><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" /><path d="m9.5 4.8 2.5 2 2.5-2M9.5 19.2l2.5-2 2.5 2M4.8 10.5l3-1 .4-3.2M19.2 13.5l-3 1-.4 3.2M4.8 13.5l3 1 .4 3.2M19.2 10.5l-3-1-.4-3.2" /></symbol>
    <symbol id="i-wind" viewBox="0 0 24 24"><path d="M3 8.5h10a2.5 2.5 0 1 0-2.5-2.5" /><path d="M3 12.5h15a2.5 2.5 0 1 1-2.5 2.5" /><path d="M3 16.5h6" /></symbol>
    <symbol id="i-fog" viewBox="0 0 24 24"><path d="M4 8h12M7 12h13M4 16h12M9 20h9" /></symbol>
    <symbol id="i-settings" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></symbol>
    <symbol id="i-moon" viewBox="0 0 24 24"><path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5 8.6 8.6 0 1 0 20.5 14.2Z" /></symbol>
    <symbol id="i-check" viewBox="0 0 24 24"><path d="m4.5 12.5 5 5 10-11" /></symbol>
    <symbol id="i-alert" viewBox="0 0 24 24"><path d="M12 3.8 21 19H3L12 3.8Z" /><path d="M12 9v4.5M12 16.5v.2" /></symbol>
    <symbol id="i-copy" viewBox="0 0 24 24"><rect x="8.5" y="8.5" width="12" height="12" rx="2.5" /><path d="M15.5 5.5v-1a1 1 0 0 0-1-1h-10a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1" /></symbol>
    <symbol id="i-download" viewBox="0 0 24 24"><path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5" /><path d="M4 16v3.5h16V16" /></symbol>
    <symbol id="i-refresh" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.4 6.5" /><path d="M20 4.5V11h-6.5" /></symbol>
    <symbol id="i-chevron" viewBox="0 0 24 24"><path d="m8 10 4 4 4-4" /></symbol>
    <symbol id="i-close" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></symbol>
    <symbol id="i-bot" viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="12" rx="3" /><path d="M12 3v4M9 12v.2M15 12v.2M9.5 16h5" /><path d="M2.5 11v4M21.5 11v4" /></symbol>
    <symbol id="i-tool" viewBox="0 0 24 24"><path d="M14.5 5.2a4.8 4.8 0 0 0-6 6L3.8 16a2.2 2.2 0 1 0 3.1 3.1l4.9-4.7a4.8 4.8 0 0 0 6-6l-3 3-3-1-1-3 3.7-2.2Z" /></symbol>
    <symbol id="i-route" viewBox="0 0 24 24"><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="5.5" r="2.5" /><path d="M8 18.5h5a3.5 3.5 0 0 0 0-7h-2a3.5 3.5 0 0 1 0-7h5" /></symbol>
    <symbol id="i-leaf" viewBox="0 0 24 24"><path d="M20 4C12 4 5 8 5 15a5 5 0 0 0 5 5c7 0 10-7 10-16Z" /><path d="M4 21c2.5-5 6-8 11-10" /></symbol>
    <symbol id="i-book" viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21V5.5Z" /><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" /><path d="M8 7h7M8 10.5h5" /></symbol>
    <symbol id="i-send" viewBox="0 0 24 24"><path d="m3.5 12 17-8-6 17-3.5-7-7.5-2Z" /><path d="m11 14 5-5" /></symbol>
    <symbol id="i-stop" viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2" /></symbol>
  </svg>); }
export function Hero() { return (    <section className="hero" aria-labelledby="heroTitle">
      <div className="hero__copy">
        <p className="eyebrow"><span className="eyebrow__line"></span>多智能体旅行工作台</p>
        <h1 className="hero__title" id="heroTitle">把想去的地方，<br /><em>变成走得通的旅程。</em></h1>
        <p className="hero__lede">不必一次说清所有细节。远行会先确认目的地、日期、天数和预算，再让智能体接力查天气、排路线，写下属于你的每一天。</p>
        <div className="hero__meta" aria-label="工作流程">
          <span><b>01</b> 需求分析</span>
          <span><b>02</b> 天气适配</span>
          <span><b>03</b> 逐日编排</span>
        </div>
      </div>

      <div className="hero__art" aria-hidden="true">
        <svg className="route-map" viewBox="0 0 560 400" fill="none">
          <g className="route-map__contours">
            <path d="M-30 120C56 34 201 48 250 124s-18 138-108 148S-42 216-30 120Z" />
            <path d="M12 132C84 62 191 78 225 134s-22 104-96 112S22 204 12 132Z" />
            <path d="M300 54c76-44 178-4 196 58s-56 106-132 92-102-108-64-150Z" />
            <path d="M340 78c52-28 122 0 134 42s-42 68-90 58-68-72-44-100Z" />
            <path d="M250 260c74-34 172 8 170 74s-110 96-170 58-56-106 0-132Z" />
            <path d="M288 286c50-22 114 8 112 48s-72 62-112 38-38-70 0-86Z" />
            <path d="M64 292c44-20 98 8 96 44s-62 52-96 32-34-62 0-76Z" />
          </g>
          <path className="route-map__path" d="M88 318C156 292 148 218 236 208s110 44 166-32 64-78 94-92" />
          <circle className="route-map__halo" cx="88" cy="318" r="16" />
          <circle className="route-map__dot" cx="88" cy="318" r="5" />
          <circle className="route-map__halo route-map__halo--end" cx="496" cy="84" r="16" />
          <circle className="route-map__dot route-map__dot--end" cx="496" cy="84" r="5" />
          <g transform="translate(396 170) rotate(16)">
            <g className="route-map__plane">
              <path d="M18 1 2 8.5l5.4 2.1L9.5 18l2.7-5.3L18 1Z" />
            </g>
          </g>
          <text className="route-map__label" x="70" y="352">SHANGHAI</text>
          <text className="route-map__label route-map__label--end" x="452" y="118">CHENGDU</text>
          <g className="route-map__compass" transform="translate(486 306)">
            <circle r="30" />
            <path d="M0-17 4.6 4.8 0 8l-4.6-3.2Z" />
            <text y="20">N</text>
          </g>
        </svg>

        <div className="art-card art-card--place">
          <span className="art-card__icon"><svg className="icon"><use href="#i-pin"></use></svg></span>
          <div><small>下一站</small><strong>成都 · CTU</strong></div>
        </div>
        <div className="art-card art-card--weather">
          <span className="art-card__weather"><svg className="icon"><use href="#i-cloud"></use></svg></span>
          <div><small>10月23日</small><strong>24° 多云</strong></div>
        </div>
      </div>
    </section>); }
export function EmptyJourney({ onDemo }: { onDemo: () => void }) { return (<div className="stage__empty" id="stageEmpty">
          <div className="empty-art" aria-hidden="true">
            <svg viewBox="0 0 440 300" fill="none">
              <circle className="empty-art__ring" cx="220" cy="150" r="118" />
              <circle className="empty-art__ring empty-art__ring--inner" cx="220" cy="150" r="82" />
              <path className="empty-art__contour" d="M96 190c26-52 92-70 142-40s82 16 108-18" />
              <path className="empty-art__contour" d="M88 216c38-30 62-4 96 4s72-12 98-44 56-28 72-10" />
              <path className="empty-art__route" d="M122 212c36-4 54-40 92-44s50 30 86 6 40-56 62-68" />
              <circle className="empty-art__halo" cx="122" cy="212" r="15" />
              <circle className="empty-art__pin" cx="122" cy="212" r="5" />
              <circle className="empty-art__halo" cx="362" cy="106" r="15" />
              <circle className="empty-art__pin" cx="362" cy="106" r="5" />
              <g transform="translate(266 158) rotate(14)">
                <g className="empty-art__plane">
                  <path d="M18 1 2 8.5l5.4 2.1L9.5 18l2.7-5.3L18 1Z" />
                </g>
              </g>
              <g className="empty-art__compass" transform="translate(220 150)">
                <circle r="34" />
                <path d="M0-20 5.4 5.8 0 9.5l-5.4-3.7Z" />
              </g>
            </svg>
          </div>
          <p className="kicker">YOUR NEXT JOURNEY</p>
          <h2>下一站，从哪里开始？</h2>
          <p className="stage__empty-text">告诉远行一个念头——一座城市、几天假期，或只是一位朋友推荐的街角。信息齐了，智能体就开始接力。</p>
          <div className="empty-features">
            <span><svg className="icon"><use href="#i-compass"></use></svg>需求确认</span>
            <span><svg className="icon"><use href="#i-cloud"></use></svg>实时天气</span>
            <span><svg className="icon"><use href="#i-route"></use></svg>逐日路线</span>
          </div>
          <button type="button" className="btn btn--ghost" onClick={onDemo}>
            <svg className="icon"><use href="#i-book"></use></svg>先看一份示例行程
          </button>
        </div>); }
