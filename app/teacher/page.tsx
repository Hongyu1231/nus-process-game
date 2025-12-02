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
  addDoc,
  orderBy as firestoreOrderBy,
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
  PenTool,
  X,
  Save,
  LayoutList,
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

// 播放列表项现在包含完整的关卡数据 (Snapshot)
type PlaylistItem = {
  levelId: string;
  timeLimit: number;
  levelData: {
    title: string;
    correctOrder: { id: string; content: string }[];
  };
};

type ScoreData = {
  id: string;
  nickname: string;
  avatar: string;
  score: number;
  levelId: string;
  roundIndex: number;
};

// 自定义关卡结构
type CustomLevel = {
  id: string;
  title: string;
  correctOrder: { id: string; content: string }[];
};

export default function TeacherPage() {
  const [status, setStatus] = useState<SessionStatus>("setup");
  const [sessionId, setSessionId] = useState("");

  // --- Setup States ---
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [currentLevelIndex, setCurrentLevelIndex] = useState(0);

  // Selection
  const [selectedLevelId, setSelectedLevelId] = useState<string>(""); // 当前选中的关卡ID
  const [selectedLevelData, setSelectedLevelData] =
    useState<CustomLevel | null>(null); // 当前选中的关卡数据
  const [tempTime, setTempTime] = useState(60);

  // Custom Level Creator States
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [newLevelTitle, setNewLevelTitle] = useState("");
  const [newLevelSteps, setNewLevelSteps] = useState<string[]>(["", "", ""]); // 默认3行
  const [customLevels, setCustomLevels] = useState<CustomLevel[]>([]); // 从数据库加载的

  // --- Real-time Data ---
  const [rawScores, setRawScores] = useState<ScoreData[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [baseUrl, setBaseUrl] = useState("");

  const [timerDisplay, setTimerDisplay] = useState(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window !== "undefined") setBaseUrl(window.location.origin);
  }, []);

  // --- Load Custom Levels ---
  useEffect(() => {
    // 监听 custom_levels 集合
    const q = query(
      collection(db, "custom_levels"),
      firestoreOrderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const levels: CustomLevel[] = [];
      snap.forEach((doc) => {
        levels.push({ id: doc.id, ...doc.data() } as CustomLevel);
      });
      setCustomLevels(levels);
    });
    return () => unsub();
  }, []);

  // 合并默认关卡和自定义关卡
  const allLevels = useMemo(() => {
    const defaults = Object.values(LEVELS).map((l) => ({
      ...l,
      type: "default",
    }));
    const customs = customLevels.map((l) => ({ ...l, type: "custom" }));
    return [...defaults, ...customs];
  }, [customLevels]);

  const currentLevelConfig = playlist[currentLevelIndex];

  // --- Logic ---
  const submittedCount = useMemo(() => {
    if (!currentLevelConfig) return 0;
    return rawScores.filter((s) => s.roundIndex === currentLevelIndex).length;
  }, [rawScores, currentLevelIndex, currentLevelConfig]);

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
      if (totals[s.nickname]) totals[s.nickname].totalScore += s.score;
    });
    return Object.values(totals).sort((a, b) => b.totalScore - a.totalScore);
  }, [rawScores, players]);

  // --- Handlers: Creator ---
  const handleSaveNewLevel = async () => {
    if (!newLevelTitle.trim()) return alert("Title is required");
    const validSteps = newLevelSteps.filter((s) => s.trim() !== "");
    if (validSteps.length < 2) return alert("Need at least 2 steps");

    // 格式化数据
    const levelData = {
      title: newLevelTitle,
      correctOrder: validSteps.map((s, i) => ({
        id: `step-${Date.now()}-${i}`,
        content: s,
      })),
      createdAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, "custom_levels"), levelData);
      setIsCreatorOpen(false);
      setNewLevelTitle("");
      setNewLevelSteps(["", "", ""]);
    } catch (e) {
      console.error(e);
      alert("Error saving level");
    }
  };

  const handleAddStepRow = () => setNewLevelSteps([...newLevelSteps, ""]);
  const handleStepChange = (idx: number, val: string) => {
    const newSteps = [...newLevelSteps];
    newSteps[idx] = val;
    setNewLevelSteps(newSteps);
  };
  const handleRemoveStepRow = (idx: number) => {
    setNewLevelSteps(newLevelSteps.filter((_, i) => i !== idx));
  };

  // --- Handlers: Playlist ---
  const handleSelectLevel = (level: any) => {
    setSelectedLevelId(level.id);
    setSelectedLevelData({
      id: level.id,
      title: level.title,
      correctOrder: level.correctOrder,
    });
  };

  const handleAddToPlaylist = () => {
    if (!selectedLevelData) return;
    setPlaylist([
      ...playlist,
      {
        levelId: selectedLevelData.id,
        timeLimit: tempTime,
        levelData: selectedLevelData, // 关键：保存快照
      },
    ]);
  };

  // --- Handlers: Game Flow ---
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

  const handleStartFirstRound = () => startLevelAtIndex(0);
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

  // --- Effects ---
  useEffect(() => {
    if (
      status === "playing" &&
      players.length > 0 &&
      submittedCount >= players.length
    ) {
      const timeout: any = setTimeout(() => {
        handleEndLevel();
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [status, submittedCount, players.length]);

  useEffect(() => {
    let interval: any;
    if (status === "playing") {
      const duration = playlist[currentLevelIndex].timeLimit;
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
    return () => clearInterval(interval);
  }, [status, currentLevelIndex, playlist]);

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

  // ================= VIEW: SETUP (CREATOR MODE) =================
  if (status === "setup") {
    // 1. CREATOR UI
    if (isCreatorOpen) {
      return (
        <div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center justify-center">
          <div className="max-w-2xl w-full bg-slate-800 rounded-3xl p-8 border border-slate-700 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-white flex items-center gap-2">
                <PenTool /> Create Level
              </h2>
              <button
                onClick={() => setIsCreatorOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                  Level Title
                </label>
                <input
                  value={newLevelTitle}
                  onChange={(e) => setNewLevelTitle(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-xl p-4 text-lg font-bold text-white focus:border-indigo-500 outline-none"
                  placeholder="e.g. My Custom Process"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                  Steps (In Correct Order)
                </label>
                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                  {newLevelSteps.map((step, idx) => (
                    <div key={idx} className="flex gap-2">
                      <div className="bg-slate-700 w-8 h-12 flex items-center justify-center rounded font-bold text-slate-400">
                        {idx + 1}
                      </div>
                      <input
                        value={step}
                        onChange={(e) => handleStepChange(idx, e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 text-white focus:border-indigo-500 outline-none"
                        placeholder={`Step ${idx + 1}`}
                      />
                      <button
                        onClick={() => handleRemoveStepRow(idx)}
                        className="text-red-400 hover:bg-slate-700 p-2 rounded"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleAddStepRow}
                  className="mt-3 text-indigo-400 text-sm font-bold hover:text-indigo-300 flex items-center gap-1"
                >
                  <Plus size={16} /> Add Step
                </button>
              </div>

              <button
                onClick={handleSaveNewLevel}
                className="w-full bg-green-500 hover:bg-green-600 text-white font-black py-4 rounded-xl shadow-lg flex items-center justify-center gap-2"
              >
                <Save size={20} /> SAVE LEVEL
              </button>
            </div>
          </div>
        </div>
      );
    }

    // 2. PLAYLIST BUILDER UI
    return (
      <div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center">
        <h1 className="text-4xl font-black text-indigo-400 mb-8">Game Setup</h1>
        <div className="flex gap-8 w-full max-w-6xl h-[600px]">
          {/* Left: Library */}
          <div className="w-1/2 bg-slate-800 p-6 rounded-3xl border border-slate-700 flex flex-col gap-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold uppercase tracking-wider text-slate-400">
                Library
              </h2>
              <button
                onClick={() => setIsCreatorOpen(true)}
                className="bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1"
              >
                <Plus size={14} /> Create
              </button>
            </div>

            {/* Level Grid */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
              <div className="grid grid-cols-2 gap-2">
                {allLevels.map((l) => {
                  const isAdded = playlist.some((p) => p.levelId === l.id);
                  return (
                    <button
                      key={l.id}
                      onClick={() => !isAdded && handleSelectLevel(l)}
                      disabled={isAdded}
                      className={`p-3 rounded-lg border text-left text-sm font-bold flex flex-col justify-between transition-all min-h-[80px]
                                        ${
                                          isAdded
                                            ? "bg-slate-700 border-slate-600 text-slate-500 cursor-not-allowed"
                                            : selectedLevelId === l.id
                                            ? "border-indigo-500 bg-indigo-500/20 text-white shadow-lg"
                                            : "border-slate-600 text-slate-300 hover:bg-slate-700"
                                        }
                                    `}
                    >
                      <div className="flex justify-between w-full">
                        <span className="line-clamp-2">{l.title}</span>
                        {isAdded && <Check size={16} />}
                      </div>
                      <div className="text-[10px] mt-2 opacity-60 flex justify-between">
                        <span>{(l as any).correctOrder.length} steps</span>
                        {(l as any).type === "custom" && (
                          <span className="text-indigo-400">Custom</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time & Add */}
            <div className="pt-4 border-t border-slate-700">
              <div className="flex items-center gap-4 mb-4">
                <span className="text-sm font-bold text-slate-400">Time:</span>
                <input
                  type="range"
                  min="1"
                  max="300"
                  step="1"
                  value={tempTime}
                  onChange={(e) => setTempTime(Number(e.target.value))}
                  className="flex-1 accent-indigo-500 h-2 bg-slate-600 rounded-lg cursor-pointer"
                />
                <input
                  type="number"
                  value={tempTime}
                  onChange={(e) => setTempTime(Number(e.target.value))}
                  className="w-16 bg-slate-900 border border-slate-600 rounded p-1 text-center font-mono font-bold"
                />
              </div>
              <button
                onClick={handleAddToPlaylist}
                disabled={!selectedLevelId}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-black p-4 rounded-xl flex items-center justify-center gap-2"
              >
                <Plus /> ADD TO QUEUE
              </button>
            </div>
          </div>

          {/* Right: Queue */}
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
                    <span className="font-bold">{item.levelData.title}</span>
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
                <div className="text-center text-slate-600 mt-20 flex flex-col items-center">
                  <LayoutList size={48} className="mb-2 opacity-50" />
                  Select levels from library
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

  // --- 简化的后续视图 (逻辑与之前一致) ---
  if (status === "waiting")
    return (
      <div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center">
        <h1 className="text-5xl font-black mb-4">Join Session</h1>
        <div className="bg-white p-6 rounded-3xl shadow-2xl mb-8 flex flex-col items-center">
          <div className="mb-4">
            <QRCode value={joinUrl} size={280} />
          </div>
          <div className="w-full bg-slate-100 p-2 rounded text-center">
            <div className="text-indigo-600 font-bold text-sm select-all">
              {joinUrl}
            </div>
          </div>
        </div>
        <div className="text-2xl font-bold text-indigo-400 mb-6 bg-slate-800 px-6 py-2 rounded-full border border-slate-700">
          <Users className="inline mr-2" />
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

  const currentLevelTitle = playlist[currentLevelIndex]?.levelData.title;

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
        <div className="text-xl font-bold text-slate-400 uppercase tracking-widest mb-4 border border-slate-700 px-4 py-1 rounded-full">
          Round {currentLevelIndex + 1} / {playlist.length}
        </div>
        <h1 className="text-6xl font-black mb-16 text-center">
          {currentLevelTitle}
        </h1>
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
        <div className="flex flex-col gap-3 w-full max-w-lg mb-10 overflow-y-auto custom-scrollbar">
          {playlist[currentLevelIndex]?.levelData.correctOrder.map(
            (step, idx) => (
              <div
                key={idx}
                className="bg-slate-800 border-l-4 border-green-500 p-5 rounded-r-xl flex items-center gap-4"
              >
                <span className="font-black text-2xl text-slate-500 w-8">
                  {idx + 1}
                </span>
                <span className="font-bold text-xl">{step.content}</span>
                <CheckCircle className="ml-auto text-green-500" size={24} />
              </div>
            )
          )}
        </div>
        <button
          onClick={handleShowLeaderboard}
          className="bg-indigo-600 hover:bg-indigo-700 px-12 py-6 rounded-2xl font-black text-2xl shadow-lg"
        >
          SHOW SCORES
        </button>
      </div>
    );

  if (status === "leaderboard")
    return (
      <div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center">
        <h1 className="text-4xl font-black text-yellow-400 mb-2">Standings</h1>
        <p className="text-slate-400 mb-8 font-bold bg-slate-800 px-4 py-1 rounded-full">
          After Round {currentLevelIndex + 1}
        </p>
        <div className="w-full max-w-3xl bg-slate-800 rounded-3xl p-8 mb-8 flex-1 overflow-y-auto custom-scrollbar border border-slate-700 shadow-2xl">
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
