import React, { useState, useEffect, useRef } from "react";
import {
  Button,
  Card,
  Elevation,
  FormGroup,
  InputGroup,
  H3,
  Intent,
  Callout,
} from "@blueprintjs/core";
import { useTranslation } from "react-i18next";
import {
  ShieldCheck,
  Lock,
  Globe,
  Filter,
  BarChart3,
  Edit3,
  Zap,
  Cpu,
} from "lucide-react";
import { LanguageSwitcher } from "./LanguageSwitcher";
import LogoIcon from "../assets/obex_cat_eye_logo-256.webp";

// 扩展 Window 接口以支持 Turnstile
declare global {
  interface Window {
    onloadTurnstileCallback: () => void;
    turnstile: any;
  }
}

interface AuthViewProps {
  onSuccess: () => void;
}

const INTRO_ITEMS = [
  { icon: ShieldCheck, colorClass: "text-blue-500", titleKey: "intro.item1Title", descKey: "intro.item1Desc" },
  { icon: Lock, colorClass: "text-purple-500", titleKey: "intro.item2Title", descKey: "intro.item2Desc" },
  { icon: Globe, colorClass: "text-green-500", titleKey: "intro.item3Title", descKey: "intro.item3Desc" },
  { icon: Filter, colorClass: "text-orange-500", titleKey: "intro.item4Title", descKey: "intro.item4Desc" },
  { icon: BarChart3, colorClass: "text-red-500", titleKey: "intro.item5Title", descKey: "intro.item5Desc" },
  { icon: Zap, colorClass: "text-yellow-500", titleKey: "intro.item6Title", descKey: "intro.item6Desc" },
  { icon: Cpu, colorClass: "text-cyan-500", titleKey: "intro.item7Title", descKey: "intro.item7Desc" },
  { icon: Edit3, colorClass: "text-pink-500", titleKey: "intro.item8Title", descKey: "intro.item8Desc" },
];

const ScrollingIntro = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [isPaused, setIsPaused] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let requestId: number;
    const scrollSpeed = 0.6;
    const scroll = () => {
      if (!isPaused) {
        container.scrollTop += scrollSpeed;
        if (container.scrollTop >= container.scrollHeight / 2) container.scrollTop = 0;
      }
      const rect = container.getBoundingClientRect();
      const hotZone = rect.top + rect.height / 3;
      const bubbles = Array.from(container.children);
      let foundIdx = -1;
      for (let i = 0; i < bubbles.length; i++) {
        const bubbleRect = bubbles[i].getBoundingClientRect();
        if (bubbleRect.top <= hotZone && bubbleRect.bottom >= hotZone) {
          foundIdx = i % INTRO_ITEMS.length;
          break;
        }
      }
      setActiveIdx(foundIdx);
      requestId = requestAnimationFrame(scroll);
    };
    requestId = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(requestId);
  }, [isPaused]);

  const displayItems = [...INTRO_ITEMS, ...INTRO_ITEMS, ...INTRO_ITEMS, ...INTRO_ITEMS, ...INTRO_ITEMS, ...INTRO_ITEMS];

  return (
    <div 
      className="flex flex-col h-full overflow-y-auto no-scrollbar py-[50vh] px-8 lg:px-16 relative select-none cursor-grab active:cursor-grabbing bg-transparent"
      ref={containerRef}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onMouseDown={() => setIsPaused(true)}
      onMouseUp={() => setIsPaused(false)}
      style={{ scrollbarWidth: "none" }}
    >
      {displayItems.map((item, idx) => {
        const isActive = idx % INTRO_ITEMS.length === activeIdx;
        const IconComponent = item.icon;
        const displayIdx = ((idx % INTRO_ITEMS.length) + 1).toString().padStart(2, "0");
        return (
          <div key={idx} className={`transition-all duration-700 ease-in-out shrink-0 border-l-4 mb-8 ${isActive ? "border-blue-600 pl-8 scale-105 opacity-100" : "border-gray-200 dark:border-gray-800 pl-6 opacity-30 grayscale"}`}>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className={`font-mono text-xs font-bold tracking-widest ${isActive ? "text-blue-600" : "text-gray-400"}`}>/{displayIdx}</span>
                <div className={`transition-transform duration-700 ${isActive ? "rotate-0 scale-110" : "rotate-12 opacity-50"}`}><IconComponent size={24} className={item.colorClass} /></div>
              </div>
              <div className="space-y-2">
                <h2 className={`text-4xl font-black leading-none tracking-tighter uppercase transition-colors duration-500 ${isActive ? "text-gray-900 dark:text-white" : "text-gray-300 dark:text-gray-700"}`}>{t(item.titleKey)}</h2>
                <p className={`max-w-md text-lg font-medium leading-snug transition-colors duration-500 ${isActive ? "text-gray-600 dark:text-gray-400" : "text-transparent"}`}>{t(item.descKey)}</p>
              </div>
              {isActive && <div className="flex gap-1 mt-2 transition-all duration-500"><div className="h-1 w-2 bg-gray-200 dark:bg-gray-800" /></div>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const AuthView: React.FC<AuthViewProps> = ({ onSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isPanelVisible, setIsPanelVisible] = useState(true);
  const { t } = useTranslation();

  // 动态配置状态
  const [authConfig, setAuthConfig] = useState<{
    turnstile_site_key: string;
    turnstile_enabled_signup: boolean;
    turnstile_enabled_login: boolean;
  } | null>(null);

  // Turnstile 相关
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch("/api/auth/config");
        if (res.ok) setAuthConfig(await res.json());
      } catch (e) { console.error("Failed to load auth config", e); }
    };
    fetchConfig();
  }, []);

  const isTurnstileEnabled = isLogin 
    ? authConfig?.turnstile_enabled_login 
    : authConfig?.turnstile_enabled_signup;

  useEffect(() => {
    if (isTurnstileEnabled && authConfig?.turnstile_site_key && !window.turnstile) {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }, [isTurnstileEnabled, authConfig]);

  useEffect(() => {
    if (isTurnstileEnabled && authConfig?.turnstile_site_key && window.turnstile && turnstileRef.current) {
      turnstileRef.current.innerHTML = "";
      window.turnstile.render(turnstileRef.current, {
        sitekey: authConfig.turnstile_site_key,
        callback: (token: string) => setTurnstileToken(token),
        "expired-callback": () => setTurnstileToken(null),
        "error-callback": () => setTurnstileToken(null),
      });
    }
  }, [isTurnstileEnabled, authConfig, isLogin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLogin && !/^[a-zA-Z0-9]{5,15}$/.test(username)) { setError(t("auth.formatErrorUsername")); return; }
    if (!isLogin && (password.length < 8 || password.length > 100 || !/(?=.*[a-zA-Z])(?=.*[0-9])/.test(password))) { setError(t("auth.formatErrorPassword")); return; }
    if (isTurnstileEnabled && authConfig?.turnstile_site_key && !turnstileToken) { setError(t("auth.turnstileRequired", "Please complete the human verification.")); return; }

    setLoading(true);
    setError("");
    const endpoint = isLogin ? "/api/auth/login" : "/api/auth/signup";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, turnstileToken }),
      });
      if (res.ok) { onSuccess(); } else {
        const msg = await res.text();
        setError(msg || t("auth.authFailed"));
        if (window.turnstile) window.turnstile.reset();
        setTurnstileToken(null);
      }
    } catch (err) { setError(t("auth.networkError")); } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-row min-h-screen bg-white dark:bg-gray-950 overflow-hidden relative">
      <div className="hidden lg:block w-1/2 h-screen overflow-hidden border-r border-gray-100 dark:border-gray-900"><ScrollingIntro /></div>
      <div className={`lg:hidden absolute inset-0 z-0 transition-opacity duration-500 cursor-pointer ${isPanelVisible ? "opacity-25" : "opacity-70"}`} onClick={() => setIsPanelVisible(true)}><ScrollingIntro /></div>
      {!isPanelVisible && (
        <div className="lg:hidden fixed bottom-12 left-1/2 -translate-x-1/2 z-50 animate-bounce">
          <Button large intent={Intent.PRIMARY} icon="log-in" text={t("auth.loginBtn")} onClick={() => setIsPanelVisible(true)} className="shadow-2xl px-8 py-4 rounded-full" />
        </div>
      )}
      <div 
        className={`flex-1 flex items-center justify-center p-4 relative z-10 bg-gray-50/50 dark:bg-gray-900/30 lg:bg-gray-50 lg:dark:bg-gray-900/50 transition-all duration-500 ease-in-out ${!isPanelVisible ? "max-lg:translate-x-full max-lg:opacity-0 max-lg:pointer-events-none" : "translate-x-0 opacity-100"}`}
        onClick={(e) => { if (window.innerWidth < 1024 && e.target === e.currentTarget) setIsPanelVisible(false); }}
      >
        <div className="absolute top-4 right-4 z-50"><LanguageSwitcher /></div>
        <Card elevation={Elevation.FOUR} className="w-full max-w-md p-8 rounded-2xl shadow-none! z-10 dark:bg-gray-900 border border-gray-100 dark:border-gray-800" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-col items-center mb-8">
            <img src={LogoIcon} alt="Obex DNS Logo" className="w-20 h-20 object-contain" />
            <H3 className="font-bold tracking-tight text-2xl mt-4">{isLogin ? t("auth.login") : t("auth.signup")}</H3>
            <p className="text-gray-500 mt-2 text-center text-sm leading-relaxed">{isLogin ? t("auth.welcomeBack") : t("auth.protectInternet")}</p>
          </div>
          {error && <Callout intent={Intent.DANGER} className="mb-6 rounded-xl" title={t("auth.error")}>{error}</Callout>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormGroup label={t("auth.username")} labelFor="username"><InputGroup id="username" leftIcon="user" placeholder={t("auth.usernamePlaceholder")} size="large" className="rounded-xl" value={username} onChange={(e) => setUsername(e.target.value)} required /></FormGroup>
            <FormGroup label={t("auth.password")} labelFor="password"><InputGroup id="password" leftIcon="lock" placeholder={t("auth.passwordPlaceholder")} type="password" size="large" className="rounded-xl" value={password} onChange={(e) => setPassword(e.target.value)} required /></FormGroup>
            {isTurnstileEnabled && authConfig?.turnstile_site_key && (
              <div className="py-2 flex justify-center min-h-[65px]"><div ref={turnstileRef} /></div>
            )}
            <Button fill size="large" intent={Intent.PRIMARY} type="submit" loading={loading} className="mt-6 font-bold py-6 rounded-xl shadow-lg shadow-blue-500/20">{isLogin ? t("auth.loginBtn") : t("auth.signupBtn")}</Button>
          </form>
          <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800 text-center">
            <button onClick={() => { setIsLogin(!isLogin); setError(""); setTurnstileToken(null); }} className="text-blue-600 dark:text-blue-400 font-semibold hover:underline bg-transparent border-none cursor-pointer text-sm">{isLogin ? t("auth.noAccount") : t("auth.haveAccount")}</button>
          </div>
        </Card>
      </div>
    </div>
  );
};
