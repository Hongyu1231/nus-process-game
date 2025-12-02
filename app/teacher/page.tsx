// app/teacher/page.tsx
"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import QRCode from "react-qr-code";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  onSnapshot,
  where,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import {
  Trophy,
  Users,
  Play,
  ArrowRight,
  Medal,
  Plus,
  Trash2,
  Check,
  CheckCircle,
} from "lucide-react";
import { LEVELS } from "@/data/levels";

// --- 类型定义 ---
type SessionStatus =
  | "setup"
  | "waiting"
  | "playing"
  | "review"
  | "leaderboard"
  | "final_podium";

type PlaylistItem = {
  levelId: string;
  timeLimit: number;
};

type ScoreData = {
  id: string;
  nickname: string;
  avatar: string;
  score: number;
  levelId: string;
  roundIndex: number;
};

export default function TeacherPage() {
  // --- 状态管理 ---
  const [status, setStatus] = useState<SessionStatus>("setup");
  const [sessionId, setSessionId] = useState("");

  // 播放列表
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [currentLevelIndex, setCurrentLevelIndex] = useState(0);

  // 临时设置输入
  const [tempLevelId, setTempLevelId] = useState("mckinsey");
  const [tempTime, setTempTime] = useState(60);

  // 实时数据
  const [rawScores, setRawScores] = useState<ScoreData[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [baseUrl, setBaseUrl] = useState("");

  // UI 倒计时
  const [timerDisplay, setTimerDisplay] = useState(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window !== "undefined") setBaseUrl(window.location.origin);
  }, []);

  const currentLevelConfig = playlist[currentLevelIndex];
  // const currentLevelData = currentLevelConfig ? LEVELS[currentLevelConfig.levelId] : null; // 未使用变量，移除或注释

  // --- 统计当前轮次提交 (去重) ---
  const submittedCount = useMemo(() => {
    if (!currentLevelConfig) return 0;
    const currentRoundScores = rawScores.filter(
      (s) => s.roundIndex === currentLevelIndex
    );
    const uniqueNames = new Set(currentRoundScores.map((s) => s.nickname));
    return uniqueNames.size;
  }, [rawScores, currentLevelIndex, currentLevelConfig]);

  // --- 累计排名 ---
  const leaderboardData = useMemo(() => {
    const totals: Record<
      string,
      { nickname: string; avatar: string; totalScore: number }
    > = {};
    players.forEach((p) => {
      totals[p.nickname] = {
        nickname: p.nickname,
        avatar: p.avatar,
        totalScore: 0,
      };
    });
    rawScores.forEach((s) => {
      if (totals[s.nickname]) {
        totals[s.nickname].totalScore += s.score;
      } else {
        // 防止极端情况下玩家数据未同步但分数已到的情况
        totals[s.nickname] = {
          nickname: s.nickname,
          avatar: s.avatar,
          totalScore: s.score,
        };
      }
    });
    return Object.values(totals).sort((a, b) => b.totalScore - a.totalScore);
  }, [rawScores, players]);

  // --- Actions ---

  const handleCreateLobby = async () => {
    if (playlist.length === 0) return alert("Please add at least one level!");
    const newSessionId = Date.now().toString();
    setSessionId(newSessionId);
    setStatus("waiting");
    setRawScores([]);
    setPlayers([]);
    setCurrentLevelIndex(0);

    await setDoc(doc(db, "sessions", newSessionId), {
      playlist,
      currentLevelIndex: 0,
      status: "waiting",
      createdAt: serverTimestamp(),
    });
  };

  // 通用开始函数
  const startLevelAtIndex = async (index: number) => {
    const config = playlist[index];
    if (!config) return;

    setCurrentLevelIndex(index);
    setStatus("playing");
    startTimeRef.current = Date.now();
    setTimerDisplay(config.timeLimit);

    const now = new Date();
    const endTime = new Date(now.getTime() + config.timeLimit * 1000);

    await updateDoc(doc(db, "sessions", sessionId), {
      status: "playing",
      currentLevelIndex: index,
      startTime: serverTimestamp(),
      endTime: Timestamp.fromDate(endTime),
    });
  };

  const handleStartFirstRound = () => {
    startLevelAtIndex(0);
  };

  const handleStartNextRound = async () => {
    if (currentLevelIndex + 1 < playlist.length) {
      startLevelAtIndex(currentLevelIndex + 1);
    } else {
      setStatus("final_podium");
      await updateDoc(doc(db, "sessions", sessionId), {
        status: "final_podium",
      });
    }
  };

  const handleEndLevel = async () => {
    setStatus("review");
    await updateDoc(doc(db, "sessions", sessionId), { status: "review" });
  };

  const handleShowLeaderboard = async () => {
    setStatus("leaderboard");
    await updateDoc(doc(db, "sessions", sessionId), { status: "leaderboard" });
  };

  const handleTerminate = async () => {
    if (confirm("Terminate Session?")) {
      setStatus("setup");
      setSessionId("");
      setPlaylist([]);
      setCurrentLevelIndex(0);
    }
  };

  // --- Auto Advance ---
  useEffect(() => {
    if (
      status === "playing" &&
      players.length > 0 &&
      submittedCount >= players.length
    ) {
      // 使用 any 类型解决 NodeJS.Timeout 报错
      const timeout: any = setTimeout(() => {
        handleEndLevel();
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [status, submittedCount, players.length]);

  // --- Timer UI ---
  useEffect(() => {
    let interval: any;
    if (status === "playing") {
      const config = playlist[currentLevelIndex];
      if (config) {
        const duration = config.timeLimit;
        interval = setInterval(() => {
          const now = Date.now();
          const elapsed = Math.floor((now - startTimeRef.current) / 1000);
          const remaining = Math.max(0, duration - elapsed);
          setTimerDisplay(remaining);
          if (remaining === 0) {
            clearInterval(interval);
            handleEndLevel();
          }
        }, 200);
      }
    }
    return () => clearInterval(interval);
  }, [status, currentLevelIndex, playlist]);

  // --- Firebase ---
  useEffect(() => {
    if (status === "setup" || !sessionId) return;

    const qScores = query(
      collection(db, "scores"),
      where("sessionId", "==", sessionId)
    );
    const unsubScores = onSnapshot(qScores, (snap) => {
      const list: ScoreData[] = [];
      snap.forEach((doc) =>
        list.push({ id: doc.id, ...doc.data() } as ScoreData)
      );
      setRawScores(list);
    });

    const qPlayers = query(
      collection(db, "players"),
      where("sessionId", "==", sessionId)
    );
    const unsubPlayers = onSnapshot(qPlayers, (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => list.push(doc.data()));
      setPlayers(list);
    });

    return () => {
      unsubScores();
      unsubPlayers();
    };
  }, [status, sessionId]);

  const joinUrl = `${baseUrl}/?session=${sessionId}`;

  // ================= VIEW: SETUP =================
  if (status === "setup") {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center">
        <h1 className="text-4xl font-black text-indigo-400 mb-8">Game Setup</h1>
        <div className="flex gap-8 w-full max-w-5xl h-[600px]">
          {/* Left */}
          <div className="w-1/2 bg-slate-800 p-6 rounded-3xl border border-slate-700 flex flex-col gap-6">
            <h2 className="text-xl font-bold uppercase tracking-wider text-slate-400">
              Add to Playlist
            </h2>
            <div>
              <label className="block text-sm font-bold mb-2">
                Select Level
              </label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                {Object.values(LEVELS).map((l) => {
                  const isAdded = playlist.some((p) => p.levelId === l.id);
                  return (
                    <button
                      key={l.id}
                      onClick={() => !isAdded && setTempLevelId(l.id)}
                      disabled={isAdded}
                      className={`p-3 rounded-lg border text-left text-sm font-bold flex justify-between items-center ${
                        isAdded
                          ? "bg-slate-700 border-slate-600 text-slate-500 cursor-not-allowed"
                          : tempLevelId === l.id
                          ? "border-indigo-500 bg-indigo-500/20 text-white"
                          : "border-slate-600 text-slate-400"
                      }`}
                    >
                      <span>{l.title}</span>
                      {isAdded && <Check size={16} />}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold mb-2">
                Time Limit (Seconds)
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max="300"
                  step="1"
                  value={tempTime}
                  onChange={(e) => setTempTime(Number(e.target.value))}
                  className="flex-1 accent-indigo-500 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer"
                />
                <input
                  type="number"
                  value={tempTime}
                  onChange={(e) => setTempTime(Number(e.target.value))}
                  className="w-20 bg-slate-700 border border-slate-600 rounded p-2 font-mono font-bold text-center focus:border-indigo-500 outline-none"
                />
              </div>
            </div>
            <button
              onClick={() =>
                setPlaylist([
                  ...playlist,
                  { levelId: tempLevelId, timeLimit: tempTime },
                ])
              }
              className="mt-auto w-full bg-indigo-600 hover:bg-indigo-700 p-4 rounded-xl font-black flex items-center justify-center gap-2"
            >
              <Plus /> ADD TO QUEUE
            </button>
          </div>
          {/* Right */}
          <div className="w-1/2 bg-slate-800 p-6 rounded-3xl border border-slate-700 flex flex-col">
            <h2 className="text-xl font-bold uppercase tracking-wider text-slate-400 mb-4 flex justify-between">
              Queue <span>{playlist.length} rounds</span>
            </h2>
            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
              {playlist.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-slate-700 p-4 rounded-xl flex justify-between items-center animate-in slide-in-from-right duration-300"
                >
                  <div>
                    <span className="bg-slate-900 text-xs font-bold px-2 py-1 rounded text-slate-400 mr-2">
                      #{idx + 1}
                    </span>
                    <span className="font-bold">
                      {LEVELS[item.levelId].title}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-sm text-indigo-300">
                      {item.timeLimit}s
                    </span>
                    <button
                      onClick={() =>
                        setPlaylist(playlist.filter((_, i) => i !== idx))
                      }
                      className="text-red-400 hover:text-red-500"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
              {playlist.length === 0 && (
                <div className="text-center text-slate-600 mt-20">
                  List is empty
                </div>
              )}
            </div>
            <button
              onClick={handleCreateLobby}
              disabled={playlist.length === 0}
              className="mt-4 w-full bg-green-500 hover:bg-green-600 disabled:bg-slate-600 text-white font-black p-4 rounded-xl shadow-lg transition-all"
            >
              OPEN LOBBY
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ================= VIEW: WAITING ROOM =================
  if (status === "waiting") {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center">
        <h1 className="text-5xl font-black mb-4 tracking-tight">
          Join Session
        </h1>
        <div className="bg-white p-6 rounded-3xl shadow-2xl mb-8 flex flex-col items-center max-w-md w-full">
          <div className="mb-6 w-full flex justify-center">
            <QRCode
              value={joinUrl}
              size={280}
              style={{ height: "auto", maxWidth: "100%", width: "100%" }}
              viewBox={`0 0 256 256`}
            />
          </div>
          <div className="w-full bg-slate-100 p-4 rounded-xl border border-slate-200 text-center">
            <div className="text-slate-400 text-[10px] font-bold uppercase mb-1 tracking-widest">
              Join via URL
            </div>
            <div className="text-indigo-600 font-bold text-sm break-all select-all cursor-pointer hover:text-indigo-800">
              {joinUrl}
            </div>
          </div>
        </div>
        <div className="text-2xl font-bold text-indigo-400 mb-6 bg-slate-800 px-6 py-2 rounded-full border border-slate-700">
          <Users className="inline mr-2 mb-1" />
          {players.length} Players Ready
        </div>
        <div className="grid grid-cols-4 gap-4 w-full max-w-4xl max-h-60 overflow-y-auto mb-8 custom-scrollbar">
          {players.map((p, i) => (
            <div
              key={i}
              className="bg-slate-800 p-3 rounded-lg flex items-center gap-3 border border-slate-700 animate-in zoom-in"
            >
              <span className="text-2xl">{p.avatar}</span>
              <span className="font-bold truncate text-sm">{p.nickname}</span>
            </div>
          ))}
        </div>
        <button
          onClick={handleStartFirstRound}
          className="px-16 py-6 bg-green-500 hover:bg-green-600 text-white font-black text-3xl rounded-full shadow-lg flex items-center gap-4"
        >
          START ROUND 1 <ArrowRight size={40} strokeWidth={4} />
        </button>
      </div>
    );
  }

  // ================= VIEW: PLAYING =================
  if (status === "playing") {
    const currentLevelData = playlist[currentLevelIndex]
      ? LEVELS[playlist[currentLevelIndex].levelId]
      : null;
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 relative">
        <div className="absolute top-6 right-6 bg-slate-800 border border-slate-700 px-6 py-3 rounded-xl flex items-center gap-4 shadow-lg">
          <div className="text-right">
            <div className="text-xs font-bold text-slate-500 uppercase">
              Submitted
            </div>
            <div className="text-2xl font-black text-white leading-none">
              <span className="text-green-400">{submittedCount}</span> /{" "}
              {players.length}
            </div>
          </div>
          <Users className="text-slate-600" size={32} />
        </div>
        <div className="text-xl font-bold text-slate-400 uppercase tracking-widest mb-4 border border-slate-700 px-4 py-1 rounded-full">
          Round {currentLevelIndex + 1} / {playlist.length}
        </div>
        <h1 className="text-6xl font-black mb-16 text-center leading-tight bg-clip-text text-transparent bg-gradient-to-br from-white to-slate-400">
          {currentLevelData?.title}
        </h1>
        <div
          className={`font-mono text-[12rem] font-black mb-16 leading-none ${
            timerDisplay < 10 ? "text-red-500 animate-pulse" : "text-white"
          }`}
        >
          {timerDisplay}
        </div>
        <button
          onClick={handleEndLevel}
          className="bg-red-600 hover:bg-red-700 px-12 py-6 rounded-2xl font-black text-2xl shadow-lg border-b-4 border-red-800 active:border-b-0 active:translate-y-1 transition-all"
        >
          STOP & SHOW ANSWER
        </button>
      </div>
    );
  }

  // ================= VIEW: REVIEW =================
  if (status === "review") {
    const currentLevelData = playlist[currentLevelIndex]
      ? LEVELS[playlist[currentLevelIndex].levelId]
      : null;
    return (
      <div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center">
        <h1 className="text-4xl font-black text-green-400 mb-8 uppercase tracking-wider">
          Correct Order
        </h1>
        <div className="flex flex-col gap-3 w-full max-w-lg mb-10 flex-1 overflow-y-auto custom-scrollbar">
          {currentLevelData?.correctOrder.map((step, idx) => (
            <div
              key={step.id}
              className="bg-slate-800 border-l-4 border-green-500 p-5 rounded-r-xl flex items-center gap-4 shadow-lg animate-in slide-in-from-left"
              style={{ animationDelay: `${idx * 100}ms` }}
            >
              <span className="font-black text-2xl text-slate-500 w-8">
                {idx + 1}
              </span>
              <span className="font-bold text-xl">{step.content}</span>
              <CheckCircle className="ml-auto text-green-500" size={24} />
            </div>
          ))}
        </div>
        <button
          onClick={handleShowLeaderboard}
          className="bg-indigo-600 hover:bg-indigo-700 px-12 py-6 rounded-2xl font-black text-2xl flex items-center gap-4 shadow-lg active:scale-95 transition-all"
        >
          SHOW SCORES <ArrowRight size={32} />
        </button>
      </div>
    );
  }

  // ================= VIEW: LEADERBOARD =================
  if (status === "leaderboard") {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center">
        <h1 className="text-4xl font-black text-yellow-400 mb-2 uppercase tracking-widest">
          Standings
        </h1>
        <p className="text-slate-400 mb-8 font-bold bg-slate-800 px-4 py-1 rounded-full">
          After Round {currentLevelIndex + 1}
        </p>

        <div className="w-full max-w-3xl bg-slate-800 rounded-3xl p-8 mb-8 flex-1 overflow-y-auto custom-scrollbar border border-slate-700 shadow-2xl">
          <table className="w-full">
            <thead className="text-left text-slate-500 uppercase text-xs font-bold border-b border-slate-700">
              <tr>
                <th className="pb-4 pl-4">Rank</th>
                <th>Player</th>
                <th className="text-right pr-4">Total Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {leaderboardData.map((d, i) => (
                <tr
                  key={i}
                  className="text-2xl group hover:bg-white/5 transition-colors"
                >
                  <td className="py-4 pl-4 font-bold text-slate-500 w-20">
                    {i === 0
                      ? "🥇"
                      : i === 1
                      ? "🥈"
                      : i === 2
                      ? "🥉"
                      : `#${i + 1}`}
                  </td>
                  <td className="py-4 font-bold flex items-center gap-3 text-white">
                    <span className="text-3xl">{d.avatar}</span> {d.nickname}
                  </td>
                  <td className="py-4 pr-4 font-black text-right text-green-400">
                    {d.totalScore}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {currentLevelIndex + 1 < playlist.length ? (
          <button
            onClick={handleStartNextRound}
            className="bg-green-500 hover:bg-green-600 px-12 py-6 rounded-2xl font-black text-2xl shadow-[0_6px_0_rgb(21,128,61)] active:translate-y-1 flex items-center gap-4 transition-all"
          >
            START ROUND {currentLevelIndex + 2} <Play fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={handleStartNextRound}
            className="bg-yellow-500 hover:bg-yellow-600 text-black px-12 py-6 rounded-2xl font-black text-2xl shadow-[0_6px_0_rgb(202,138,4)] active:translate-y-1 transition-all"
          >
            FINAL PODIUM
          </button>
        )}
      </div>
    );
  }

  // ================= VIEW: FINAL PODIUM =================
  if (status === "final_podium") {
    const top3 = leaderboardData.slice(0, 3);
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-indigo-950 text-white flex flex-col items-center justify-center p-4">
        <h1 className="text-6xl font-black text-yellow-400 mb-12 drop-shadow-lg uppercase tracking-wider">
          CHAMPIONS
        </h1>
        <div className="flex items-end justify-center gap-4 mb-16 w-full max-w-4xl h-96">
          {/* 2nd Place */}
          {top3[1] && (
            <div className="w-1/3 flex flex-col items-center animate-in slide-in-from-bottom duration-1000 delay-300">
              <div className="mb-4 text-center">
                <div className="text-6xl mb-2">{top3[1].avatar}</div>
                <div className="text-2xl font-bold">{top3[1].nickname}</div>
                <div className="text-slate-400 font-mono font-bold">
                  {top3[1].totalScore} pts
                </div>
              </div>
              <div className="w-full h-48 bg-slate-400 rounded-t-xl flex items-start justify-center pt-4 relative shadow-2xl border-t-4 border-slate-300">
                <Medal size={60} className="text-slate-200" />
                <div className="absolute bottom-4 text-6xl font-black text-black/20">
                  2
                </div>
              </div>
            </div>
          )}
          {/* 1st Place */}
          {top3[0] && (
            <div className="w-1/3 flex flex-col items-center animate-in slide-in-from-bottom duration-1000 z-10">
              <div className="mb-4 text-center">
                <div className="text-8xl mb-2 animate-bounce">
                  {top3[0].avatar}
                </div>
                <div className="text-4xl font-black text-yellow-300">
                  {top3[0].nickname}
                </div>
                <div className="text-yellow-100 font-mono text-3xl font-bold">
                  {top3[0].totalScore} pts
                </div>
              </div>
              <div className="w-full h-80 bg-yellow-400 rounded-t-xl flex items-start justify-center pt-6 relative shadow-[0_0_60px_rgba(250,204,21,0.4)] border-t-4 border-yellow-300">
                <Trophy size={80} className="text-yellow-100" />
                <div className="absolute bottom-4 text-8xl font-black text-black/20">
                  1
                </div>
              </div>
            </div>
          )}
          {/* 3rd Place */}
          {top3[2] && (
            <div className="w-1/3 flex flex-col items-center animate-in slide-in-from-bottom duration-1000 delay-500">
              <div className="mb-4 text-center">
                <div className="text-6xl mb-2">{top3[2].avatar}</div>
                <div className="text-2xl font-bold">{top3[2].nickname}</div>
                <div className="text-slate-400 font-mono font-bold">
                  {top3[2].totalScore} pts
                </div>
              </div>
              <div className="w-full h-32 bg-amber-700 rounded-t-xl flex items-start justify-center pt-4 relative shadow-2xl border-t-4 border-amber-600">
                <Medal size={60} className="text-amber-200" />
                <div className="absolute bottom-4 text-6xl font-black text-black/20">
                  3
                </div>
              </div>
            </div>
          )}
        </div>
        <button
          onClick={handleTerminate}
          className="bg-slate-800 px-8 py-3 rounded-xl font-bold text-slate-400 hover:text-white border border-slate-700 hover:bg-slate-700 transition-colors"
        >
          Start New Session
        </button>
      </div>
    );
  }

  return <div>Loading...</div>;
}
