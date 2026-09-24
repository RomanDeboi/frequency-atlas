"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import { createCloudAdapter, type CloudAdapter } from "../../lib/cloudAdapter";
import "./cloud.css";

type AtlasFrame = Window & { AtlasCloud?: CloudAdapter };
// Hiding registration is only a UI choice. After creating the owner's account,
// also disable new sign-ups in Supabase Auth; that is the actual access control.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/frequency-atlas";
const allowRegistration = process.env.NEXT_PUBLIC_ATLAS_ALLOW_SIGNUP !== "false";

export default function CloudPage() {
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const frameRef = useRef<HTMLIFrameElement>(null);
  const adapterRef = useRef<CloudAdapter | null>(null);

  useEffect(() => {
    if (!supabase) { setChecking(false); return; }
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "SIGNED_OUT") setUser(null);
      else if (session?.user) setUser(session.user);
    });
    supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage(error.message);
      setUser(data.user);
      setChecking(false);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    adapterRef.current = supabase && user ? createCloudAdapter(supabase, user.id) : null;
    const frame = frameRef.current;
    if (adapterRef.current && frame?.contentDocument?.readyState === "complete") {
      const child = frame.contentWindow as AtlasFrame | null;
      if (child) {
        child.AtlasCloud = adapterRef.current;
        child.dispatchEvent(new Event("atlas-cloud-ready"));
      }
    }
  }, [user?.id]);

  const onFrameLoad = useCallback(() => {
    const frame = frameRef.current?.contentWindow as AtlasFrame | null;
    if (!frame || !adapterRef.current) return;
    frame.AtlasCloud = adapterRef.current;
    frame.dispatchEvent(new Event("atlas-cloud-ready"));
  }, []);

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        frameRef.current?.contentWindow?.dispatchEvent(new Event("atlas-cloud-refocus"));
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    try {
      if (mode === "register" && allowRegistration) {
        const { data, error } = await supabase.auth.signUp({ email, password, options: {
          emailRedirectTo: `${window.location.origin}${basePath}/cloud/`,
        } });
        if (error) throw error;
        setMessage(data.session ? "Акаунт створено. Хмарний атлас відкривається." :
          "Перевір пошту й підтвердь адресу, після чого увійди до атласу.");
        if (!data.session) setMode("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setPassword("");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Помилка авторизації.");
    } finally { setBusy(false); }
  }

  async function logout() {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    if (error) setMessage(error.message);
    else { setUser(null); adapterRef.current = null; setPassword(""); }
    setBusy(false);
  }

  if (!supabase) return (
    <main className="cloudLanding">
      <div className="cloudAuthCard">
        <div className="cloudEyebrow">FREQUENCY ATLAS / CLOUD</div>
        <h1>Підключення хмари</h1>
        <p>Хмарну базу ще не налаштовано. Укажи URL та publishable key свого Supabase-проєкту в <code>.env.local</code>, виконай <code>supabase/cloud_v0_3.sql</code> у SQL Editor і перезапусти Next.js.</p>
        <a href={`${basePath}/prototype.html`} className="cloudButton">Відкрити автономну версію</a>
      </div>
    </main>
  );
  if (checking) return <main className="cloudLanding"><p>Перевірка авторизації…</p></main>;
  if (!user) return (
    <main className="cloudLanding">
      <div className="cloudAuthCard">
        <div className="cloudEyebrow">PRIVATE RF KNOWLEDGE BASE</div>
        <h1>Frequency Atlas</h1>
        <p>Особиста хмарна база частот і скриншотів. Доступ до твоїх записів обмежений твоїм акаунтом.</p>
        <div className="cloudAuthSwitch">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setMessage(""); }}>Увійти</button>
          {allowRegistration && <button type="button" className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setMessage(""); }}>Створити акаунт</button>}
        </div>
        <form onSubmit={submitAuth} className="cloudAuthForm">
          <label>Email<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label>Пароль<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required value={password} onChange={e => setPassword(e.target.value)} /></label>
          <button className="cloudButton" disabled={busy} type="submit">{busy ? "Обробка…" : mode === "login" ? "Увійти" : "Зареєструватися"}</button>
        </form>
        {message && <p className="cloudMessage" role="status">{message}</p>}
        <a className="cloudOfflineLink" href={`${basePath}/prototype.html`}>Відкрити автономну версію без входу →</a>
        <p className="cloudPrivacy">Не завантажуй службову або конфіденційну інформацію в хмару, якщо не маєш належного дозволу та погоджених умов зберігання.</p>
      </div>
    </main>
  );

  return (
    <div className="cloudApp">
      <header className="cloudBar">
        <span><span className="cloudOn" /> Хмарна база · {user.email}</span>
        <div>
          <button type="button" onClick={() => {
            if (window.confirm("Оновити дані з хмари? Незбережені зміни у відкритій формі може бути втрачено.")) {
              frameRef.current?.contentWindow?.dispatchEvent(new Event("atlas-cloud-reload"));
            }
          }}>↻ Оновити з хмари</button>
          <a href={`${basePath}/prototype.html`}>Автономна версія</a>
          <button type="button" disabled={busy} onClick={logout}>Вийти</button>
        </div>
      </header>
      {message && <p className="cloudBarMessage" role="alert">{message}</p>}
      <iframe
        key={user.id}
        ref={frameRef}
        src={`${basePath}/prototype.html?cloud=1`}
        title="Frequency Atlas — приватна хмарна база"
        className="cloudFrame"
        onLoad={onFrameLoad}
      />
    </div>
  );
}
