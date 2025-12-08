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
  orderBy,
  deleteDoc,
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
  PenTool,
  X,
  Save,
  LayoutList,
} from "lucide-react";

import { LEVELS } from "@/data/levels";

// --- 类型定义 ---
type Step = { id: string; content: string };
type LevelData = { id: string; title: string; correctOrder: Step[] };
type CombinedLevelData = LevelData & { type: "default" | "custom" };

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
  levelData: LevelData;
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
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [currentLevelIndex, setCurrentLevelIndex] = useState(0);
  const [selectedLevelId, setSelectedLevelId] = useState<string>("");
  const [selectedLevelData, setSelectedLevelData] =
    useState<CombinedLevelData | null>(null);
  const [tempTime, setTempTime] = useState(60);
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [newLevelTitle, setNewLevelTitle] = useState("");
  const [newLevelSteps, setNewLevelSteps] = useState<string[]>(["", "", ""]);
  const [customLevels, setCustomLevels] = useState<CombinedLevelData[]>([]);

  const [rawScores, setRawScores] = useState<ScoreData[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [baseUrl, setBaseUrl] = useState("");
  const [timerDisplay, setTimerDisplay] = useState(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window !== "undefined") setBaseUrl(window.location.origin);
  }, []);

  const currentLevelConfig = playlist[currentLevelIndex];

  // --- Load Custom Levels ---
  useEffect(() => {
    const q = query(
      collection(db, "custom_levels"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const levels: CombinedLevelData[] = [];
      snap.forEach((doc) => {
        levels.push({ id: doc.id, ...doc.data() } as CombinedLevelData);
      });
      setCustomLevels(levels);
    });
    return () => unsub();
  }, []);

  const allLevels = useMemo(() => {
    const defaults = Object.values(LEVELS).map(
      (l) => ({ ...l, type: "default" } as CombinedLevelData)
    );
    const customs = customLevels.map(
      (l) => ({ ...l, type: "custom" } as CombinedLevelData)
    );
    return [...defaults, ...customs];
  }, [customLevels]);

  const submittedCount = useMemo(() => {
    if (!currentLevelConfig) return 0;
    const currentRoundScores = rawScores.filter(
      (s) => s.roundIndex === currentLevelIndex
    );
    const uniqueNames = new Set(currentRoundScores.map((s) => s.nickname));
    return uniqueNames.size;
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

    // Deduplication logic
    const uniqueScores: Record<string, number> = {};
    rawScores.forEach((s) => {
      const key = `${s.nickname}_${s.roundIndex}`;
      uniqueScores[key] = s.score;
    });

    Object.entries(uniqueScores).forEach(([key, score]) => {
      const parts = key.split("_");
      const nickname = parts.slice(0, -1).join("_");

      if (totals[nickname]) {
        totals[nickname].totalScore += score;
      }
    });

    return Object.values(totals).sort((a, b) => b.totalScore - a.totalScore);
  }, [rawScores, players]);

  // --- Handlers: Creator ---
  const handleSaveNewLevel = async () => {
    if (!newLevelTitle.trim()) return alert("Title is required");
    const validSteps = newLevelSteps
      .map((s) => s.trim())
      .filter((s) => s !== "");
    if (validSteps.length < 2) return alert("Need at least 2 steps");

    const stepNames = validSteps.map((s) => s.toLowerCase());
    if (new Set(stepNames).size !== stepNames.length) {
      return alert("Error: Step names must be unique within a procedure.");
    }

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
      alert("Error saving procedure");
    }
  };

  const handleDeleteLevel = async (levelId: string) => {
    if (
      confirm(
        "Are you sure you want to delete this custom procedure? This cannot be undone."
      )
    ) {
      try {
        await deleteDoc(doc(db, "custom_levels", levelId));
        if (selectedLevelId === levelId) {
          setSelectedLevelId("");
          setSelectedLevelData(null);
        }
      } catch (e) {
        console.error(e);
        alert("Error deleting procedure.");
      }
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
  const handleSelectLevel = (level: CombinedLevelData) => {
    setSelectedLevelId(level.id);
    setSelectedLevelData(level);
  };

  const handleAddToPlaylist = () => {
    if (!selectedLevelData) return;
    const isAlreadyAdded = playlist.some(
      (p) => p.levelId === selectedLevelData.id
    );
    if (isAlreadyAdded) return;

    setPlaylist([
      ...playlist,
      {
        levelId: selectedLevelData.id,
        timeLimit: tempTime,
        levelData: selectedLevelData,
      },
    ]);

    setSelectedLevelId("");
    setSelectedLevelData(null);
  };

  // --- Game Flow Handlers ---
  const handleCreateLobby = async () => {
    if (playlist.length === 0) return alert("Please add procedures!");
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
    if (confirm("Terminate Session?")) {
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
    const duration = playlist[currentLevelIndex]?.timeLimit;
    if (status === "playing" && duration) {
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
  }, [status, currentLevelIndex, playlist.length]);

  useEffect(() => {
    if (status === "setup" || !sessionId) return;
    const unsub1 = onSnapshot(
      query(collection(db, "scores"), where("sessionId", "==", sessionId)),
      (snap) => {
        const list: ScoreData[] = [];
        snap.forEach((doc) =>
          list.push({ id: doc.id, ...doc.data() } as ScoreData)
        );
        setRawScores(list);
      }
    );
    const unsub2 = onSnapshot(
      query(collection(db, "players"), where("sessionId", "==", sessionId)),
      (snap) => {
        const list: any[] = [];
        snap.forEach((doc) => list.push(doc.data()));
        setPlayers(list);
      }
    );
    return () => {
      unsub1();
      unsub2();
    };
  }, [status, sessionId]);

  const joinUrl = `${baseUrl}/?session=${sessionId}`;

  // ================= VIEW: CREATOR MODE =================
  if (isCreatorOpen) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center justify-center">
        <div className="max-w-2xl w-full bg-slate-800 rounded-3xl p-8 border border-slate-700 shadow-2xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-black text-white flex items-center gap-2">
              <PenTool /> Create Procedure
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
                Procedure Title
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
              <Save size={20} /> SAVE PROCEDURE
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ================= VIEW: SETUP =================
  if (status === "setup") {
    const isSelectedAlreadyAdded = selectedLevelId
      ? playlist.some((p) => p.levelId === selectedLevelId)
      : false;

    return (
      <div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center">
        <h1 className="text-4xl font-black text-indigo-400 mb-8">Game Setup</h1>
        <div className="flex gap-8 w-full max-w-6xl h-[600px]">
          {/* Left */}
          <div className="w-1/2 bg-slate-800 p-6 rounded-3xl border border-slate-700 flex flex-col gap-6">
            <h2 className="text-xl font-bold uppercase tracking-wider text-slate-400">
              Add to Playlist
            </h2>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-bold">Select Procedure</label>
              <button
                onClick={() => setIsCreatorOpen(true)}
                className="bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1"
              >
                <Plus size={14} /> Create New
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar">
              {allLevels.map((l: CombinedLevelData) => {
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
                      <span>{l.correctOrder.length} steps</span>
                      {l.type === "custom" && (
                        <div className="flex items-center gap-1">
                          <div
                            role="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteLevel(l.id);
                            }}
                            className="text-red-400 hover:text-red-300 p-1 cursor-pointer"
                          >
                            <Trash2 size={12} />
                          </div>
                          <span className="text-indigo-400">Custom</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="pt-4 border-t border-slate-700">
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
                  className="w-20 bg-slate-700 border border-slate-600 rounded p-2 font-mono font-bold text-center outline-none"
                />
              </div>
            </div>

            <button
              onClick={() => handleAddToPlaylist()}
              disabled={!selectedLevelId || isSelectedAlreadyAdded}
              className="mt-auto w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-black p-4 rounded-xl flex items-center justify-center gap-2"
            >
              {isSelectedAlreadyAdded
                ? "ADDED TO QUEUE"
                : "ADD SELECTED PROCEDURE"}
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
                  Select procedures from library
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

  // 2. WAITING ROOM
  if (status === "waiting") {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center">
        <h1 className="text-5xl font-black mb-4 tracking-tight">
          Join Session
        </h1>
        <div className="bg-white p-6 rounded-3xl shadow-2xl mb-8 flex flex-col items-center max-w-md w-full">
          <div className="mb-6 w-full flex justify-center">
            <QRCode value={joinUrl} size={280} />
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
              <span className="text-2xl">{p.avatar}</span>{" "}
              <span className="font-bold truncate text-sm">{p.nickname}</span>
            </div>
          ))}
        </div>
        <button
          onClick={handleStartFirstRound}
          className="px-16 py-6 bg-green-500 hover:bg-green-600 text-white font-black text-3xl rounded-full shadow-lg"
        >
          START ROUND 1 <ArrowRight size={40} strokeWidth={4} />
        </button>
      </div>
    );
  }

  // 3. PLAYING
  if (status === "playing") {
    const currentLevelData = playlist[currentLevelIndex].levelData;
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-center p-6 relative">
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
          className="bg-red-600 hover:bg-red-700 px-12 py-6 rounded-2xl font-black text-2xl shadow-lg"
        >
          STOP & SHOW ANSWER
        </button>
      </div>
    );
  }

  // 4. REVIEW
  if (status === "review") {
    const currentLevelData = playlist[currentLevelIndex].levelData;
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
          className="bg-indigo-600 hover:bg-indigo-700 px-12 py-6 rounded-2xl font-black text-2xl shadow-lg"
        >
          SHOW SCORES <ArrowRight size={32} />
        </button>
      </div>
    );
  }

  // 5. LEADERBOARD
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

  // 6. FINAL PODIUM
  if (status === "final_podium") {
    const top3 = leaderboardData.slice(0, 3);
    return (
      <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-slate-950">
        <h1 className="text-5xl md:text-6xl font-black text-yellow-400 mb-12 tracking-wider drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]">
          CHAMPIONS
        </h1>
        <div className="flex items-end justify-center gap-4 mb-8 w-full max-w-4xl h-[500px]">
          {/* 2nd Place */}
          {top3[1] && (
            <div className="w-1/3 flex flex-col items-center animate-in slide-in-from-bottom duration-1000 delay-300 z-10">
              <div className="mb-4 p-3 bg-slate-700 rounded-full border-4 border-slate-600 shadow-lg">
                <div className="text-5xl animate-pulse-slow">
                  {top3[1].avatar}
                </div>
              </div>
              <div className="mb-6 text-center">
                <div className="text-xl font-bold truncate w-32 text-center mx-auto">
                  {top3[1].nickname}
                </div>
                <div className="text-slate-400 font-mono font-bold text-sm">
                  {top3[1].totalScore} pts
                </div>
              </div>
              <div className="w-full h-64 bg-gradient-to-t from-slate-600 to-slate-500 rounded-t-2xl flex items-start justify-center pt-4 relative shadow-2xl border-t-4 border-slate-400">
                <Medal size={50} className="text-slate-300" />
                <div className="absolute bottom-4 text-7xl font-black text-black/20">
                  2
                </div>
              </div>
            </div>
          )}
          {/* 1st Place */}
          {top3[0] && (
            <div className="w-1/3 flex flex-col items-center animate-in slide-in-from-bottom duration-1000 z-20 -mt-12">
              <div className="mb-4 p-5 bg-yellow-500 rounded-full border-8 border-yellow-300 shadow-[0_0_40px_rgba(250,204,21,0.6)] animate-bounce-slow relative">
                <Trophy
                  size={30}
                  className="absolute -top-6 -right-4 text-yellow-300 rotate-12 drop-shadow-lg"
                  fill="currentColor"
                />
                <div className="text-7xl">{top3[0].avatar}</div>
              </div>
              <div className="mb-6 text-center">
                <div className="text-3xl font-black text-yellow-300 truncate w-40 text-center mx-auto drop-shadow-sm">
                  {top3[0].nickname}
                </div>
                <div className="text-yellow-100 font-mono text-xl font-bold">
                  {top3[0].totalScore} pts
                </div>
              </div>
              <div className="w-full h-80 bg-gradient-to-t from-yellow-600 to-yellow-500 rounded-t-2xl flex items-start justify-center pt-6 relative shadow-[0_10px_50px_rgba(250,204,21,0.3)] border-t-4 border-yellow-300">
                <div className="absolute bottom-4 text-9xl font-black text-black/20">
                  1
                </div>
              </div>
            </div>
          )}
          {/* 3rd Place */}
          {top3[2] && (
            <div className="w-1/3 flex flex-col items-center animate-in slide-in-from-bottom duration-1000 delay-500 z-10">
              <div className="mb-4 p-3 bg-amber-800 rounded-full border-4 border-amber-700 shadow-lg">
                <div className="text-5xl animate-pulse-slow">
                  {top3[2].avatar}
                </div>
              </div>
              <div className="mb-6 text-center">
                <div className="text-xl font-bold truncate w-32 text-center mx-auto">
                  {top3[2].nickname}
                </div>
                <div className="text-slate-400 font-mono font-bold text-sm">
                  {top3[2].totalScore} pts
                </div>
              </div>
              <div className="w-full h-48 bg-gradient-to-t from-amber-800 to-amber-700 rounded-t-2xl flex items-start justify-center pt-4 relative shadow-2xl border-t-4 border-amber-600">
                <Medal size={50} className="text-amber-500" />
                <div className="absolute bottom-4 text-7xl font-black text-black/20">
                  3
                </div>
              </div>
            </div>
          )}
        </div>
        <button
          onClick={handleTerminate}
          className="mt-8 bg-slate-800/80 backdrop-blur-sm px-10 py-4 rounded-2xl font-bold text-slate-300 hover:text-white border-2 border-slate-700 hover:bg-slate-700/80 transition-all hover:scale-105 active:scale-95"
        >
          Start New Session
        </button>
      </div>
    );
  }

  return <div>Loading...</div>;
}
