// app/game/page.tsx
"use client";

import React, {
  useState,
  useEffect,
  Suspense,
  useRef,
  useCallback,
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

// ============================================================================
// 子组件：ActiveGame (由 key={levelId} 控制生命周期，换关卡时自动销毁重建)
// ============================================================================
function ActiveGame({
  levelId,
  endTimeMillis,
  sessionId,
  nickname,
  avatar,
  onForceSubmit,
}: {
  levelId: string;
  endTimeMillis: number;
  sessionId: string;
  nickname: string;
  avatar: string;
  onForceSubmit: () => void;
}) {
  const correctData = LEVELS[levelId];
  const [items, setItems] = useState<Step[]>([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  // 初始化题目
  useEffect(() => {
    if (correctData) {
      setItems([...correctData.correctOrder].sort(() => Math.random() - 0.5));
    }
  }, [correctData]);

  // 绝对时间同步倒计时
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((endTimeMillis - now) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0 && !hasSubmitted) {
        handleSubmit();
      }
    }, 200);
    return () => clearInterval(interval);
  }, [endTimeMillis, hasSubmitted]);

  // 提交逻辑
  const handleSubmit = async () => {
    if (hasSubmitted) return;
    setHasSubmitted(true); // 立即锁定

    // 防止重复提交的 Key
    const subKey = `sub_${sessionId}_${levelId}`;
    if (sessionStorage.getItem(subKey)) return;
    sessionStorage.setItem(subKey, "true");

    let correctCount = 0;
    items.forEach((item, index) => {
      if (item.id === correctData.correctOrder[index].id) correctCount++;
    });

    // 倒计时结束时，timeLeft 为 0；手动提交时，timeLeft > 0
    const timeBonus =
      correctCount === correctData.correctOrder.length ? timeLeft * 10 : 0;
    const finalScore = correctCount * 100 + timeBonus;

    try {
      await addDoc(collection(db, "scores"), {
        sessionId,
        nickname,
        avatar,
        levelId,
        score: finalScore,
        correctCount,
        // 记录用时 = 总时间 - 剩余时间
        timeTaken: Math.max(0, Math.ceil((endTimeMillis - Date.now()) / 1000)), // 粗略估算，或者传 totalTime 进来
        timestamp: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
    }
  };

  // 拖拽逻辑
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    })
  );
  function handleDragEnd(event: DragEndEvent) {
    if (hasSubmitted) return;
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  if (!items.length)
    return (
      <div className="min-h-screen bg-indigo-900 flex items-center justify-center text-white">
        <Loader2 className="animate-spin" /> Loading...
      </div>
    );

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-600 via-purple-600 to-purple-900 flex flex-col items-center py-8">
      <div className="w-full max-w-md px-6 flex justify-between items-center mb-6 text-white">
        <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-full backdrop-blur-sm">
          <Clock
            size={20}
            className={timeLeft < 10 ? "animate-pulse text-red-300" : ""}
          />
          <span
            className={`font-mono font-bold text-xl ${
              timeLeft < 10 ? "text-red-300" : ""
            }`}
          >
            {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
          </span>
        </div>
        <div className="font-bold flex items-center gap-2">
          <span className="text-2xl">{avatar}</span> {nickname}
        </div>
      </div>

      <h1 className="text-2xl font-extrabold mb-2 text-white text-center px-4 drop-shadow-md">
        {correctData.title}
      </h1>

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
                disabled={hasSubmitted}
                status={
                  hasSubmitted
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

      <div className="fixed bottom-0 w-full bg-white p-4 rounded-t-2xl shadow-2xl flex flex-col items-center z-50">
        {!hasSubmitted ? (
          <button
            onClick={handleSubmit}
            className="w-full max-w-md bg-green-500 hover:bg-green-600 text-white font-black py-4 rounded-xl text-xl shadow-[0_4px_0_rgb(21,128,61)] active:shadow-none active:translate-y-1 transition-all"
          >
            SUBMIT
          </button>
        ) : (
          <div className="text-center w-full max-w-md">
            <div className="flex items-center justify-center gap-2 text-green-600 font-bold text-xl mb-2">
              <CheckCircle /> Submitted!
            </div>
            <p className="text-slate-500 text-sm">Wait for next round...</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 主组件：GameContent (负责路由状态和 Session 监听)
// ============================================================================
function GameContent() {
  const searchParams = useSearchParams();
  const nickname = searchParams.get("nickname") || "Anonymous";
  const avatar = searchParams.get("avatar") || "👤";
  const sessionId = searchParams.get("session") || "";

  const [sessionData, setSessionData] = useState<any>(null);
  const [finalStandings, setFinalStandings] = useState<any[]>([]);
  const [myRank, setMyRank] = useState(0);
  const hasJoinedRef = useRef(false);

  // 1. 监听 Session
  useEffect(() => {
    if (!sessionId) return;
    const unsub = onSnapshot(doc(db, "sessions", sessionId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSessionData(data);
      }
    });
    return () => unsub();
  }, [sessionId]);

  // 2. 自动加入
  useEffect(() => {
    const reportJoin = async () => {
      const joinKey = `process_game_${sessionId}_joined`;
      if (hasJoinedRef.current || sessionStorage.getItem(joinKey)) return;
      hasJoinedRef.current = true;
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

  // 3. 监听最终排名
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

  // === VIEW ROUTER ===

  if (!sessionData)
    return (
      <div className="min-h-screen bg-indigo-900 flex items-center justify-center text-white">
        <Loader2 className="animate-spin mr-2" /> Connecting...
      </div>
    );

  // Waiting Room
  if (sessionData.status === "waiting" || sessionData.status === "setup") {
    return (
      <div className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center text-white p-6 text-center">
        <Loader2 size={60} className="animate-spin text-indigo-400 mb-6" />
        <h1 className="text-3xl font-black mb-2">You are in!</h1>
        <p className="text-xl text-indigo-200 mb-8">
          Waiting for teacher to start...
        </p>
        <div className="bg-indigo-800 px-8 py-4 rounded-full font-bold text-2xl flex items-center gap-3">
          <span>{avatar}</span> {nickname}
        </div>
      </div>
    );
  }

  // Active Game (使用 key 强制重置)
  if (sessionData.status === "playing") {
    const currentIndex = sessionData.currentLevelIndex;
    const currentLevelId = sessionData.playlist?.[currentIndex]?.levelId;
    const endTime = sessionData.endTime?.toMillis() || Date.now() + 60000; // 防空保护

    if (!currentLevelId)
      return (
        <div className="min-h-screen bg-indigo-900 text-white flex items-center justify-center">
          Loading Level Data...
        </div>
      );

    return (
      <ActiveGame
        key={`${sessionId}_${currentLevelId}_${currentIndex}`} // 核心！关卡变动时销毁重建
        levelId={currentLevelId}
        endTimeMillis={endTime}
        sessionId={sessionId}
        nickname={nickname}
        avatar={avatar}
        onForceSubmit={() => {}} // 逻辑已内聚
      />
    );
  }

  // Review / Leaderboard (只读模式，不显示正确答案细节，只显示"Look at screen")
  if (sessionData.status === "review" || sessionData.status === "leaderboard") {
    return (
      <div className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center text-white p-6 text-center">
        <Eye size={80} className="text-indigo-400 mb-6 animate-pulse" />
        <h1 className="text-4xl font-black mb-4">Look at the Screen!</h1>
        <p className="text-xl text-indigo-200">
          Checking answers and scores...
        </p>
      </div>
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
