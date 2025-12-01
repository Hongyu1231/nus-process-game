// src/app/page.tsx
"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, User, GraduationCap } from "lucide-react";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // --- 获取 URL 参数 (来自老师的二维码) ---
  // 如果学生是直接输网址进来的，默认给 demo 值
  const levelId = searchParams.get("level") || "mckinsey";
  const sessionId = searchParams.get("session") || "";
  const timeLimit = searchParams.get("time") || "60";

  const [nickname, setNickname] = useState("");

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) return;

    // --- 跳转逻辑 ---
    // 将所有参数 (Nickname, Level, Session, Time) 传递给游戏页
    const targetUrl = `/game?nickname=${encodeURIComponent(
      nickname
    )}&level=${levelId}&session=${sessionId}&time=${timeLimit}`;
    router.push(targetUrl);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-700 to-fuchsia-800 flex flex-col items-center justify-center p-6">
      {/* Logo 区域 */}
      <div className="text-center mb-10 animate-in fade-in zoom-in duration-700">
        <div className="bg-white/10 p-4 rounded-full inline-block mb-4 backdrop-blur-md">
          <GraduationCap size={60} className="text-white" />
        </div>
        <h1 className="text-5xl font-black text-white drop-shadow-xl tracking-tighter mb-2">
          PROCESS<span className="text-green-400">MASTER</span>
        </h1>
        <p className="text-indigo-200 text-lg font-medium">
          NUS CDE Class Activity
        </p>
      </div>

      {/* 登录卡片 */}
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 transform hover:scale-[1.01] transition-transform duration-300">
        <form onSubmit={handleJoin} className="flex flex-col gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">
              Nickname
            </label>
            <div className="relative group">
              <User
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors"
                size={24}
              />
              <input
                type="text"
                placeholder="Enter your name..."
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-slate-100 border-2 border-slate-200 rounded-xl text-xl font-bold text-slate-800 focus:outline-none focus:border-indigo-600 focus:bg-white transition-all placeholder:text-slate-300"
                autoFocus
                maxLength={15}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!nickname.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-black py-4 rounded-xl text-xl shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            JOIN GAME <ArrowRight strokeWidth={3} />
          </button>
        </form>

        {/* 显示当前的 Session 信息 (可选，方便调试) */}
        {sessionId && (
          <div className="mt-6 pt-4 border-t border-slate-100 text-center text-xs text-slate-400">
            Joining Session:{" "}
            <span className="font-mono text-slate-600">
              {sessionId.slice(-4)}
            </span>
          </div>
        )}
      </div>

      {/* 底部版权 */}
      <div className="mt-12 text-white/30 text-xs font-medium">
        Developed for NUS Computer Engineering
      </div>
    </div>
  );
}

// 必须使用 Suspense 包裹，否则构建时会报错
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-indigo-600 flex items-center justify-center text-white">
          Loading...
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
