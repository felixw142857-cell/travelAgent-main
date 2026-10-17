import { useEffect, useRef, useState } from "react";
import { describeConnectionError, normalizeApiBase, testConnection } from "../hooks/useConnection";
import { Icon } from "./VoyageArt";

interface Props { apiBase: string; open: boolean; onClose: () => void; onSave: (base: string) => void }
export default function ConnectionDialog({ apiBase, open, onClose, onSave }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "fail" | "neutral"; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const testId = useRef(0);
  useEffect(() => {
    const tests = testId;
    testId.current++;
    if (open) {
      setInput(apiBase || location.origin);
      setStatus(null);
      setTesting(false);
      if (!dialog.current?.open) dialog.current?.showModal();
    } else dialog.current?.close();
    return () => { tests.current++; };
  }, [open, apiBase]);
  function normalized() {
    const value = normalizeApiBase(input);
    if (!value) setStatus({ kind: "fail", text: "请输入完整的 http(s) 地址，例如 http://127.0.0.1:8001" });
    return value;
  }
  async function test() {
    const value = normalized();
    if (!value) return;
    const id = ++testId.current;
    setTesting(true);
    setStatus({ kind: "neutral", text: "正在连接…" });
    try {
      const health = await testConnection(value);
      if (id === testId.current) setStatus({ kind: "ok", text: `连接成功 · ${health.service || "旅行后端"}${health.environment ? ` · ${health.environment}` : ""}` });
    } catch (error) {
      if (id === testId.current) setStatus({ kind: "fail", text: describeConnectionError(error) });
    } finally { if (id === testId.current) setTesting(false); }
  }
  return <dialog className="dialog" ref={dialog} aria-labelledby="settingsTitle" onCancel={onClose} onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dialog__card">
      <div className="dialog__head"><div><p className="kicker">CONNECTION</p><h2 id="settingsTitle">后端设置</h2></div>
        <button className="icon-btn" type="button" onClick={onClose} aria-label="关闭设置"><Icon name="close" /></button></div>
      <label className="field-label" htmlFor="apiInput">FastAPI 服务地址</label>
      <input autoFocus className="text-input" id="apiInput" type="url" value={input} onChange={(event) => { testId.current++; setTesting(false); setStatus(null); setInput(event.target.value); }} placeholder="http://127.0.0.1:8001" autoComplete="off" spellCheck={false} />
      <p className="dialog__hint">本地开发默认通过当前页面的代理连接 FastAPI。部署到其他地址时可在这里填写后端地址，跨域访问需配置后端 <code>CORS_ORIGINS</code>。模型与天气 Key 在服务端配置。</p>
      {status && <p role="status" className={`dialog__status ${status.kind === "neutral" ? "" : `is-${status.kind}`}`}>{status.text}</p>}
      <div className="dialog__actions"><button className="btn btn--ghost" onClick={onClose}>取消</button>
        <button className="btn btn--ghost" disabled={testing} onClick={() => void test()}><Icon name="refresh" />{testing ? "连接中…" : "测试连接"}</button>
        <button className="btn btn--primary" onClick={() => { const value = normalized(); if (value) { onSave(value); onClose(); } }}>保存地址</button></div>
    </div>
  </dialog>;
}
