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
  Plus,
  Trash2,
  Check,
  CheckCircle,
  ArrowRight,
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
  const [status, setStatus] = useState<SessionStatus>("setup");
  const [sessionId, setSessionId] = useState("");

  // Playlist
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [currentLevelIndex, setCurrentLevelIndex] = useState(0);

  // Inputs
  const [tempLevelId, setTempLevelId] = useState("mckinsey");
  const [tempTime, setTempTime] = useState(60);

  // Data
  const [rawScores, setRawScores] = useState<ScoreData[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [baseUrl, setBaseUrl] = useState("");

  // Timer
  const [timerDisplay, setTimerDisplay] = useState(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window !== "undefined") setBaseUrl(window.location.origin);
  }, []);

  const currentLevelConfig = playlist[currentLevelIndex];
  const currentLevelData = currentLevelConfig
    ? LEVELS[currentLevelConfig.levelId]
    : null;

  // --- 提交统计 ---
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
      }
    });
    return Object.values(totals).sort((a, b) => b.totalScore - a.totalScore);
  }, [rawScores, players]);

  // --- ACTIONS ---

  const handleCreateLobby = async () => {
    if (playlist.length === 0) return alert("Please add levels!");
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
    if (confirm("Terminate?")) {
      setStatus("setup");
      setSessionId("");
      setPlaylist([]);
      setCurrentLevelIndex(0);
    }
  };

  // Auto Advance
  useEffect(() => {
    if (
      status === "playing" &&
      players.length > 0 &&
      submittedCount >= players.length
    ) {
      const timeout = setTimeout(() => {
        handleEndLevel();
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [status, submittedCount, players.length]);

  // Timer UI
  useEffect(() => {
    let interval: NodeJS.Timeout;
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

  // Firebase
  useEffect(() => {
    if (status === "setup" || !sessionId) return;
    const unsub1 = onSnapshot(
      query(collection(db, "scores"), where("sessionId", "==", sessionId)),
      (s) => {
        const list: ScoreData[] = [];
        s.forEach((d) => list.push({ id: d.id, ...d.data() } as ScoreData));
        setRawScores(list);
      }
    );
    const unsub2 = onSnapshot(
      query(collection(db, "players"), where("sessionId", "==", sessionId)),
      (s) => {
        const list: any[] = [];
        s.forEach((d) => list.push(d.data()));
        setPlayers(list);
      }
    );
    return () => {
      unsub1();
      unsub2();
    };
  }, [status, sessionId]);

  const joinUrl = `${baseUrl}/?session=${sessionId}`;

  // ================= VIEWS =================

  if (status === "setup") {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center">
        <h1 className="text-4xl font-black text-indigo-400 mb-8">Game Setup</h1>
        <div className="flex gap-8 w-full max-w-5xl h-[600px]">
          <div className="w-1/2 bg-slate-800 p-6 rounded-3xl border border-slate-700 flex flex-col gap-6">
            <h2 className="text-xl font-bold uppercase tracking-wider text-slate-400">
              Add to Playlist
            </h2>
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
                className="w-20 bg-slate-700 border border-slate-600 rounded p-2 font-mono font-bold text-center outline-none"
              />
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

  if (status === "waiting")
    return (
      <div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center">
        <h1 className="text-5xl font-black mb-4">Join Session</h1>
        <div className="bg-white p-6 rounded-3xl shadow-2xl mb-8">
          <QRCode value={joinUrl} size={280} />
        </div>
        <div className="text-2xl font-bold text-indigo-400 mb-6">
          {players.length} Players Ready
        </div>
        <button
          onClick={handleStartFirstRound}
          className="px-16 py-6 bg-green-500 hover:bg-green-600 text-white font-black text-3xl rounded-full shadow-lg"
        >
          START ROUND 1
        </button>
      </div>
    );

  if (status === "playing")
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
        <h1 className="text-6xl font-black mb-16">{currentLevelData?.title}</h1>
        <div
          className={`font-mono text-[12rem] font-black mb-16 ${
            timerDisplay < 10 ? "text-red-500 animate-pulse" : "text-white"
          }`}
        >
          {timerDisplay}
        </div>
        <button
          onClick={handleEndLevel}
          className="bg-red-600 hover:bg-red-700 px-12 py-6 rounded-2xl font-black text-2xl shadow-lg"
        >
          STOP & SHOW ANSWER
        </button>
      </div>
    );

  if (status === "review")
    return (
      <div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center">
        <h1 className="text-4xl font-black text-green-400 mb-8">
          Correct Order
        </h1>
        <div className="flex flex-col gap-3 w-full max-w-lg mb-10">
          {currentLevelData?.correctOrder.map((step, idx) => (
            <div
              key={step.id}
              className="bg-slate-800 border-l-4 border-green-500 p-5 rounded-r-xl flex items-center gap-4"
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
          className="bg-indigo-600 hover:bg-indigo-700 px-12 py-6 rounded-2xl font-black text-2xl shadow-lg"
        >
          SHOW SCORES
        </button>
      </div>
    );

  // 修复点：Next Round 按钮现在调用 handleStartNextRound，它包含逻辑判断
  if (status === "leaderboard")
    return (
      <div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center">
        <h1 className="text-4xl font-black text-yellow-400 mb-2">Standings</h1>
        <div className="w-full max-w-3xl bg-slate-800 rounded-3xl p-8 mb-8 flex-1 overflow-y-auto">
          <table className="w-full text-left text-xl">
            <tbody>
              {leaderboardData.map((d, i) => (
                <tr key={i}>
                  <td className="py-4 font-bold text-slate-500">#{i + 1}</td>
                  <td className="py-4 font-bold">{d.nickname}</td>
                  <td className="py-4 font-black text-right text-green-400">
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
            className="bg-green-500 hover:bg-green-600 px-12 py-6 rounded-2xl font-black text-2xl"
          >
            START ROUND {currentLevelIndex + 2}
          </button>
        ) : (
          <button
            onClick={handleStartNextRound}
            className="bg-yellow-500 hover:bg-yellow-600 text-black px-12 py-6 rounded-2xl font-black text-2xl"
          >
            FINAL PODIUM
          </button>
        )}
      </div>
    );

  if (status === "final_podium")
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center text-white p-6">
        <h1 className="text-6xl font-black text-yellow-400 mb-12">CHAMPIONS</h1>
        <div className="text-4xl">{leaderboardData[0]?.nickname} Wins!</div>
        <button
          onClick={handleTerminate}
          className="bg-slate-800 px-8 py-3 rounded-xl font-bold text-slate-400 hover:text-white mt-12"
        >
          Start New Session
        </button>
      </div>
    );

  return <div>Loading...</div>;
}
