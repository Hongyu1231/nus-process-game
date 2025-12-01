// app/page.tsx
"use client";

import React, { useState, Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, User, GraduationCap, RefreshCw } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

const AVATARS = [
  "🐶",
  "🐱",
  "🐭",
  "🐹",
  "🐰",
  "🦊",
  "🐻",
  "🐼",
  "🐨",
  "🐯",
  "🦁",
  "🐮",
  "🐷",
  "🐸",
  "🐵",
  "🦄",
  "🐙",
  "👾",
  "🤖",
  "👻",
];

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const levelId = searchParams.get("level") || "mckinsey";
  const sessionId = searchParams.get("session") || "";
  const timeLimit = searchParams.get("time") || "60";

  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [isChecking, setIsChecking] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // 初始化随机头像
  useEffect(() => {
    setAvatar(AVATARS[Math.floor(Math.random() * AVATARS.length)]);
  }, []);

  const changeAvatar = () => {
    const random = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    setAvatar(random);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) return;
    setIsChecking(true);
    setErrorMsg("");

    try {
      // --- 名字查重逻辑 ---
      if (sessionId) {
        const q = query(
          collection(db, "players"),
          where("sessionId", "==", sessionId),
          where("nickname", "==", nickname.trim())
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          setErrorMsg("Name already taken! Please choose another.");
          setIsChecking(false);
          return;
        }
      }

      // 验证通过，跳转 (带上 Avatar 参数)
      const targetUrl = `/game?nickname=${encodeURIComponent(
        nickname.trim()
      )}&avatar=${encodeURIComponent(
        avatar
      )}&level=${levelId}&session=${sessionId}&time=${timeLimit}`;
      router.push(targetUrl);
    } catch (err) {
      console.error("Check failed", err);
      // 如果查重出错（比如网络问题），暂且放行或提示重试
      setErrorMsg("Network error. Try again.");
      setIsChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-700 to-fuchsia-800 flex flex-col items-center justify-center p-6">
      <div className="text-center mb-8 animate-in fade-in zoom-in duration-700">
        <div className="bg-white/10 p-4 rounded-full inline-block mb-4 backdrop-blur-md">
          <GraduationCap size={50} className="text-white" />
        </div>
        <h1 className="text-4xl font-black text-white drop-shadow-xl tracking-tighter">
          PROCESS<span className="text-green-400">MASTER</span>
        </h1>
      </div>

      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 transform transition-transform duration-300">
        <form onSubmit={handleJoin} className="flex flex-col gap-6">
          {/* Avatar Selector */}
          <div className="flex flex-col items-center gap-2">
            <div
              onClick={changeAvatar}
              className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center text-5xl cursor-pointer hover:bg-indigo-100 hover:scale-110 transition-all border-4 border-indigo-100 select-none relative group"
            >
              {avatar}
              <div className="absolute bottom-0 right-0 bg-indigo-600 rounded-full p-1.5 text-white">
                <RefreshCw size={14} />
              </div>
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              Tap to change avatar
            </span>
          </div>

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
                onChange={(e) => {
                  setNickname(e.target.value);
                  setErrorMsg("");
                }}
                className={`w-full pl-12 pr-4 py-4 bg-slate-100 border-2 rounded-xl text-xl font-bold text-slate-800 focus:outline-none focus:bg-white transition-all ${
                  errorMsg
                    ? "border-red-500 focus:border-red-500"
                    : "border-slate-200 focus:border-indigo-600"
                }`}
                autoFocus
                maxLength={12}
              />
            </div>
            {errorMsg && (
              <p className="text-red-500 text-sm font-bold pl-1 animate-pulse">
                {errorMsg}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!nickname.trim() || isChecking}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-black py-4 rounded-xl text-xl shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            {isChecking ? "CHECKING..." : "JOIN GAME"}{" "}
            <ArrowRight strokeWidth={3} />
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
