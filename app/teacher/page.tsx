// app/teacher/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import QRCode from "react-qr-code";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  limit,
  where,
} from "firebase/firestore";
import { Trophy, Users, LayoutList, RefreshCw, Clock } from "lucide-react";
import { LEVELS } from "@/data/levels";

// 为了防止类型报错，这里简单定义一下
type ScoreData = {
  id: string;
  nickname: string;
  score: number;
  timeTaken: number;
  correctCount: number;
};

export default function TeacherPage() {
  const [scores, setScores] = useState<ScoreData[]>([]);
  const [baseUrl, setBaseUrl] = useState("");

  // --- 新增状态 ---
  const [selectedLevel, setSelectedLevel] = useState("mckinsey");
  const [timeLimit, setTimeLimit] = useState(60); // 默认60秒
  const [sessionId, setSessionId] = useState(""); // 当前场次ID

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(window.location.origin);
      // 初始化一个 Session ID (用时间戳)
      setSessionId(Date.now().toString());
    }
  }, []);

  // --- 生成新的 Session (重置排行榜) ---
  const handleReset = () => {
    if (
      confirm("Start a new session? This will clear the current leaderboard.")
    ) {
      setSessionId(Date.now().toString());
    }
  };

  // 生成二维码链接：把 关卡、场次ID、时间限制 全部带过去
  const joinUrl = `${baseUrl}/?level=${selectedLevel}&session=${sessionId}&time=${timeLimit}`;

  useEffect(() => {
    if (!sessionId) return;

    // --- 关键修改：只查询当前 sessionId 的数据 ---
    // 这解决了“排行榜不刷新”和“重置排行榜”两个问题
    const q = query(
      collection(db, "scores"),
      where("sessionId", "==", sessionId), // 只看当前场次
      orderBy("score", "desc"),
      orderBy("timeTaken", "asc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const liveScores: ScoreData[] = [];
        snapshot.forEach((doc) => {
          liveScores.push({ id: doc.id, ...doc.data() } as ScoreData);
        });
        setScores(liveScores);
      },
      (error) => {
        console.error("Index needed:", error);
        // 如果控制台再次报错 Index needed，请再次点击链接创建索引
      }
    );

    return () => unsubscribe();
  }, [sessionId]); // 只要 sessionId 变了，就重新监听

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col h-screen overflow-hidden">
      {/* 顶部控制栏 */}
      <div className="flex justify-between items-center mb-6 bg-slate-800 p-4 rounded-2xl border border-slate-700">
        <div>
          <h1 className="text-2xl font-black text-indigo-400">
            ProcessMaster <span className="text-white">Admin</span>
          </h1>
        </div>

        <div className="flex items-center gap-6">
          {/* 1. 关卡选择 */}
          <div className="flex flex-col">
            <label className="text-xs text-slate-400 font-bold uppercase mb-1">
              Level
            </label>
            <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 rounded border border-slate-600">
              <LayoutList size={16} className="text-indigo-400" />
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                className="bg-transparent text-white font-bold outline-none cursor-pointer text-sm"
              >
                {Object.values(LEVELS).map((level) => (
                  <option
                    key={level.id}
                    value={level.id}
                    className="text-slate-900"
                  >
                    {level.title}
                  </option>
                ))}
                {/* 之后在这里显示自定义关卡 */}
              </select>
            </div>
          </div>

          {/* 2. 时间设置 (问题2) */}
          <div className="flex flex-col w-24">
            <label className="text-xs text-slate-400 font-bold uppercase mb-1">
              Timer (s)
            </label>
            <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 rounded border border-slate-600">
              <Clock size={16} className="text-indigo-400" />
              <input
                type="number"
                value={timeLimit}
                onChange={(e) => setTimeLimit(Number(e.target.value))}
                className="bg-transparent text-white font-bold outline-none w-full text-sm"
              />
            </div>
          </div>

          {/* 3. 重置按钮 (问题4) */}
          <button
            onClick={handleReset}
            className="flex flex-col items-center justify-center bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors h-full"
          >
            <RefreshCw size={20} className="mb-1" />
            <span className="text-xs font-bold uppercase">New Session</span>
          </button>

          <div className="h-10 w-px bg-slate-600 mx-2"></div>

          <div className="flex items-center gap-3">
            <Users className="text-green-400" size={28} />
            <div>
              <div className="text-3xl font-black leading-none">
                {scores.length}
              </div>
              <div className="text-[10px] text-slate-400 uppercase font-bold">
                Joined
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-6 flex-1 h-full overflow-hidden">
        {/* 左侧：二维码 */}
        <div className="w-1/3 bg-white rounded-3xl p-6 flex flex-col items-center justify-center shadow-2xl text-center">
          <h2 className="text-slate-800 text-lg font-bold mb-4 uppercase tracking-widest">
            Scan to Join
          </h2>
          <div className="bg-slate-900 p-4 rounded-xl mb-4">
            {baseUrl && (
              <QRCode
                value={joinUrl}
                size={220}
                bgColor="#0f172a"
                fgColor="#ffffff"
              />
            )}
          </div>
          <div className="bg-slate-100 px-4 py-2 rounded-lg w-full">
            <div className="text-indigo-600 font-bold text-xs break-all">
              {joinUrl}
            </div>
          </div>
          <p className="mt-4 text-slate-400 text-xs">
            Current Session:{" "}
            <span className="font-mono text-slate-600">{sessionId}</span>
          </p>
        </div>

        {/* 右侧：排行榜 */}
        <div className="w-2/3 bg-slate-800/50 rounded-3xl border border-slate-700 p-6 flex flex-col backdrop-blur-sm">
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="text-xs text-slate-500 uppercase tracking-wider sticky top-0 bg-slate-900/90 z-10 backdrop-blur">
                <tr>
                  <th className="py-3 px-4 rounded-l-lg">Rank</th>
                  <th className="py-3 px-4">Nickname</th>
                  <th className="py-3 px-4 text-center">Correct</th>
                  <th className="py-3 px-4 text-center">Time</th>
                  <th className="py-3 px-4 text-right rounded-r-lg">Score</th>
                </tr>
              </thead>
              <tbody className="space-y-2">
                {scores.map((s, index) => (
                  <tr
                    key={s.id}
                    className="group hover:bg-white/5 border-b border-white/5 transition-colors"
                  >
                    <td className="py-3 px-4 font-bold text-lg">
                      {index === 0
                        ? "🥇"
                        : index === 1
                        ? "🥈"
                        : index === 2
                        ? "🥉"
                        : `#${index + 1}`}
                    </td>
                    <td className="py-3 px-4 font-bold text-white">
                      {s.nickname}
                    </td>
                    <td className="py-3 px-4 text-center text-slate-300">
                      {s.correctCount}
                    </td>
                    <td className="py-3 px-4 text-center text-slate-400 font-mono text-sm">
                      {s.timeTaken}s
                    </td>
                    <td className="py-3 px-4 text-right font-black text-2xl text-green-400">
                      {s.score}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {scores.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50">
                <Trophy size={48} className="mb-2" />
                <p>Waiting for players...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
