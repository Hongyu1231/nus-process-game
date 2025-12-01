// app/game/page.tsx
"use client";

import React, {
  useState,
  useEffect,
  Suspense,
  useRef,
  useCallback,
  memo,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  TouchSensor,
  MouseSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableItem } from "@/components/SortableItem";
import { LEVELS, Step } from "@/data/levels";
import { Clock, Loader2, Eye, CheckCircle, Trophy, Medal } from "lucide-react";

import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  onSnapshot,
  query,
  where,
  getDocs,
} from "firebase/firestore";

// --- 1. 独立倒计时组件 ---
const TimerDisplay = memo(
  ({
    endTimeMillis,
    onTimeUp,
    isStopped,
  }: {
    endTimeMillis: number;
    onTimeUp: () => void;
    isStopped: boolean;
  }) => {
    const [display, setDisplay] = useState(0);
    const timeUpTriggered = useRef(false);

    useEffect(() => {
      if (isStopped) return; // 停止计时

      const calc = () =>
        Math.max(0, Math.ceil((endTimeMillis - Date.now()) / 1000));
      setDisplay(calc());

      const interval = setInterval(() => {
        const remaining = calc();
        setDisplay(remaining);
        if (remaining <= 0 && !timeUpTriggered.current) {
          timeUpTriggered.current = true;
          onTimeUp();
        }
      }, 200);
      return () => clearInterval(interval);
    }, [endTimeMillis, onTimeUp, isStopped]);

    if (isStopped)
      return (
        <span className="font-mono font-bold text-xl text-slate-400">
          --:--
        </span>
      );

    return (
      <span
        className={`font-mono font-bold text-xl ${
          display < 10 ? "text-red-300" : ""
        }`}
      >
        {Math.floor(display / 60)}:{String(display % 60).padStart(2, "0")}
      </span>
    );
  }
);
TimerDisplay.displayName = "TimerDisplay";

// --- 2. ActiveGame (做题 + Review 一体化) ---
function ActiveGame({
  levelId,
  endTimeMillis,
  sessionId,
  nickname,
  avatar,
  roundIndex,
  isReviewMode, // 新增：由父组件控制是否处于 Review 模式
}: {
  levelId: string;
  endTimeMillis: number;
  sessionId: string;
  nickname: string;
  avatar: string;
  roundIndex: number;
  isReviewMode: boolean;
}) {
  const correctData = LEVELS[levelId];
  const [items, setItems] = useState<Step[]>([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // 初始化题目
  useEffect(() => {
    if (correctData) {
      setItems([...correctData.correctOrder].sort(() => Math.random() - 0.5));
    }
  }, [correctData]);

  // 提交逻辑
  const handleSubmit = useCallback(async () => {
    // 如果是 Review 模式触发的提交，或者用户主动提交
    setHasSubmitted(true);

    const subKey = `sub_${sessionId}_round_${roundIndex}`;
    if (sessionStorage.getItem(subKey)) return; // 防止重复
    sessionStorage.setItem(subKey, "true");

    let correctCount = 0;
    items.forEach((item, index) => {
      if (item.id === correctData.correctOrder[index].id) correctCount++;
    });

    // 只有在非Review模式下(即在规定时间内提交)才有时间分
    const isTimeUp = Date.now() > endTimeMillis;
    const timeTaken = isTimeUp
      ? 0
      : Math.max(0, Math.ceil((endTimeMillis - Date.now()) / 1000));
    const finalScore = correctCount * 100 + timeTaken * 10;

    try {
      await addDoc(collection(db, "scores"), {
        sessionId,
        nickname,
        avatar,
        levelId,
        roundIndex, // 确保上传正确的轮次
        score: finalScore,
        correctCount,
        timeTaken,
        timestamp: serverTimestamp(),
      });
      console.log(`Submitted Round ${roundIndex}`);
    } catch (e) {
      console.error(e);
    }
  }, [
    items,
    correctData,
    endTimeMillis,
    sessionId,
    nickname,
    avatar,
    levelId,
    roundIndex,
  ]);

  // 监听 Review 模式：一旦变身 Review，强制提交当前结果（如果还没交）
  useEffect(() => {
    if (isReviewMode && !hasSubmitted) {
      handleSubmit();
    }
  }, [isReviewMode, hasSubmitted, handleSubmit]);

  // 拖拽
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 100, tolerance: 5 },
    })
  );
  function handleDragEnd(event: DragEndEvent) {
    if (hasSubmitted || isReviewMode) return;
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  // 锁定状态：已提交 或 Review 模式
  const isLocked = hasSubmitted || isReviewMode;

  if (!items.length)
    return (
      <div className="min-h-screen bg-indigo-900 flex items-center justify-center text-white">
        <Loader2 className="animate-spin" /> Loading...
      </div>
    );

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-600 via-purple-600 to-purple-900 flex flex-col items-center py-8">
      {/* Header */}
      <div className="w-full max-w-md px-6 flex justify-between items-center mb-6 text-white">
        <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-full backdrop-blur-sm">
          <Clock size={20} />
          <TimerDisplay
            endTimeMillis={endTimeMillis}
            onTimeUp={handleSubmit}
            isStopped={isReviewMode}
          />
        </div>
        <div className="font-bold flex items-center gap-2">
          <span className="text-2xl">{avatar}</span> {nickname}
        </div>
      </div>

      <h1 className="text-2xl font-extrabold mb-2 text-white text-center px-4 drop-shadow-md">
        {isReviewMode ? "Review Results" : correctData.title}
      </h1>

      {/* Board */}
      <div className="w-full max-w-md px-6 mb-32">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={items} strategy={verticalListSortingStrategy}>
            {items.map((item, index) => (
              <SortableItem
                key={item.id}
                id={item.id}
                content={item.content}
                isLast={index === items.length - 1}
                disabled={isLocked} // 锁住
                // 如果是 Review 模式，显示红绿颜色；否则显示普通白色
                status={
                  isReviewMode
                    ? item.id === correctData.correctOrder[index].id
                      ? "correct"
                      : "wrong"
                    : "normal"
                }
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 w-full bg-white p-4 rounded-t-2xl shadow-2xl flex flex-col items-center z-50">
        {!hasSubmitted && !isReviewMode ? (
          <button
            onClick={handleSubmit}
            className="w-full max-w-md bg-green-500 hover:bg-green-600 text-white font-black py-4 rounded-xl text-xl shadow-lg active:scale-95 transition-all"
          >
            SUBMIT
          </button>
        ) : (
          <div className="text-center w-full max-w-md">
            {isReviewMode ? (
              <div className="text-indigo-600 font-bold text-lg animate-pulse flex items-center justify-center gap-2">
                <Eye /> Check your answers!
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 text-green-600 font-bold text-xl mb-2">
                <CheckCircle /> Submitted!
              </div>
            )}
            {!isReviewMode && (
              <p className="text-slate-500 text-sm">Wait for results...</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- 3. Main Container ---
function GameContent() {
  const searchParams = useSearchParams();
  const nickname = searchParams.get("nickname") || "Anonymous";
  const avatar = searchParams.get("avatar") || "👤";
  const sessionId = searchParams.get("session") || "";

  const [sessionData, setSessionData] = useState<any>(null);
  const [finalStandings, setFinalStandings] = useState<any[]>([]);
  const [myRank, setMyRank] = useState(0);

  // Sync Session
  useEffect(() => {
    if (!sessionId) return;
    const unsub = onSnapshot(doc(db, "sessions", sessionId), (docSnap) => {
      if (docSnap.exists()) setSessionData(docSnap.data());
    });
    return () => unsub();
  }, [sessionId]);

  // Sync Join
  useEffect(() => {
    const reportJoin = async () => {
      const joinKey = `process_game_${sessionId}_joined`;
      if (sessionStorage.getItem(joinKey)) return;
      sessionStorage.setItem(joinKey, "true");
      try {
        await addDoc(collection(db, "players"), {
          sessionId,
          nickname,
          avatar,
          joinedAt: serverTimestamp(),
        });
      } catch (e) {}
    };
    reportJoin();
  }, [sessionId, nickname, avatar]);

  // Sync Final
  useEffect(() => {
    if (sessionData?.status === "final_podium") {
      const fetchScores = async () => {
        const q = query(
          collection(db, "scores"),
          where("sessionId", "==", sessionId)
        );
        const snapshot = await getDocs(q);
        const totals: Record<string, any> = {};
        snapshot.forEach((doc) => {
          const d = doc.data();
          if (!totals[d.nickname])
            totals[d.nickname] = {
              nickname: d.nickname,
              avatar: d.avatar,
              totalScore: 0,
            };
          totals[d.nickname].totalScore += d.score;
        });
        const sorted = Object.values(totals).sort(
          (a: any, b: any) => b.totalScore - a.totalScore
        );
        setFinalStandings(sorted);
        const myIndex = sorted.findIndex((p: any) => p.nickname === nickname);
        setMyRank(myIndex + 1);
      };
      fetchScores();
    }
  }, [sessionData?.status, sessionId, nickname]);

  if (!sessionData)
    return (
      <div className="min-h-screen bg-indigo-900 flex items-center justify-center text-white">
        <Loader2 className="animate-spin mr-2" /> Connecting...
      </div>
    );

  if (sessionData.status === "waiting" || sessionData.status === "setup") {
    return (
      <div className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center text-white p-6 text-center">
        <Loader2 size={60} className="animate-spin text-indigo-400 mb-6" />
        <h1 className="text-3xl font-black mb-2">You are in!</h1>
        <p className="text-xl text-indigo-200 mb-8">Waiting for teacher...</p>
        <div className="bg-indigo-800 px-8 py-4 rounded-full font-bold text-2xl flex items-center gap-3">
          <span>{avatar}</span> {nickname}
        </div>
      </div>
    );
  }

  // --- GAME & REVIEW (Shared Logic) ---
  // 只要不是 Final 或 Waiting，都渲染 ActiveGame
  // ActiveGame 内部会根据 isReviewMode 决定是否显示对错
  if (
    sessionData.status === "playing" ||
    sessionData.status === "review" ||
    sessionData.status === "leaderboard"
  ) {
    const currentIndex = sessionData.currentLevelIndex;
    const currentLevelId = sessionData.playlist?.[currentIndex]?.levelId;
    const endTime = sessionData.endTime?.toMillis() || Date.now() + 60000;

    const isReviewMode =
      sessionData.status === "review" || sessionData.status === "leaderboard";

    if (!currentLevelId)
      return (
        <div className="min-h-screen bg-indigo-900 text-white flex items-center justify-center">
          Loading Level...
        </div>
      );

    return (
      <ActiveGame
        key={`${sessionId}_round_${currentIndex}`} // 关键：轮次变了才销毁，Review 模式不销毁！
        levelId={currentLevelId}
        endTimeMillis={endTime}
        sessionId={sessionId}
        nickname={nickname}
        avatar={avatar}
        roundIndex={currentIndex}
        isReviewMode={isReviewMode} // 传入模式
      />
    );
  }

  // Final Podium
  if (sessionData.status === "final_podium" || sessionData.status === "ended") {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center text-white p-6">
        <Trophy size={64} className="text-yellow-400 mb-4 drop-shadow-lg" />
        <h1 className="text-4xl font-black mb-2">Game Over!</h1>
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 rounded-2xl w-full max-w-md mb-8 text-center shadow-2xl border border-white/10">
          <div className="text-sm font-bold text-indigo-200 uppercase tracking-widest mb-1">
            Your Rank
          </div>
          <div className="text-6xl font-black text-white mb-2">
            #{myRank > 0 ? myRank : "-"}
          </div>
          <div className="flex justify-center items-center gap-2">
            <span className="text-2xl">{avatar}</span>
            <span className="text-xl font-bold">{nickname}</span>
          </div>
        </div>
        <div className="w-full max-w-md bg-slate-800 rounded-xl overflow-hidden flex-1 border border-slate-700">
          <div className="bg-slate-800 p-3 text-xs font-bold text-slate-500 uppercase border-b border-slate-700">
            Leaderboard
          </div>
          <div className="overflow-y-auto h-full pb-20 custom-scrollbar">
            {finalStandings.map((p, i) => {
              const isMe = p.nickname === nickname;
              return (
                <div
                  key={i}
                  className={`flex items-center px-4 py-3 border-b border-slate-700/50 ${
                    isMe ? "bg-yellow-500/20" : ""
                  }`}
                >
                  <div
                    className={`font-bold w-10 text-lg ${
                      isMe ? "text-yellow-400" : "text-slate-500"
                    }`}
                  >
                    #{i + 1}
                  </div>
                  <div className="flex-1 font-bold flex items-center gap-2">
                    <span>{p.avatar}</span>{" "}
                    <span className={isMe ? "text-yellow-400" : "text-white"}>
                      {p.nickname} {isMe && "(You)"}
                    </span>
                  </div>
                  <div className="font-mono font-bold text-slate-400">
                    {p.totalScore}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return <div>Loading...</div>;
}

export default function GamePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <GameContent />
    </Suspense>
  );
}
