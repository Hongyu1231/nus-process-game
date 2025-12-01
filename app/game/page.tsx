// app/game/page.tsx
"use client";

import React, { useState, useEffect, Suspense } from "react";
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
import { Clock, CheckCircle } from "lucide-react"; // 增加 CheckCircle

import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

function GameContent() {
  const searchParams = useSearchParams();

  const nickname = searchParams.get("nickname") || "Anonymous";
  const levelParam = searchParams.get("level");
  const sessionId = searchParams.get("session") || "demo_session"; // 获取场次ID
  const timeLimitParam = parseInt(searchParams.get("time") || "60"); // 获取时间限制

  const currentLevelId =
    levelParam && LEVELS[levelParam] ? levelParam : "mckinsey";
  const correctData = LEVELS[currentLevelId];

  // --- States ---
  const [items, setItems] = useState<Step[]>([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [alreadyPlayed, setAlreadyPlayed] = useState(false); // 新增：是否已玩过
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(timeLimitParam); // 使用自定义时间
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  // --- 1. 初始化与防重复检查 ---
  useEffect(() => {
    // 检查本地存储：是否在这个 session 已经提交过？
    const storageKey = `process_game_${sessionId}_submitted`;
    if (localStorage.getItem(storageKey)) {
      setAlreadyPlayed(true); // 标记为已玩过
      return;
    }

    const shuffled = [...correctData.correctOrder].sort(
      () => Math.random() - 0.5
    );
    setItems(shuffled);
    setTimeLeft(timeLimitParam);
    setIsTimerRunning(true);
  }, [correctData, sessionId, timeLimitParam]);

  // --- 2. 计时器 ---
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      handleSubmit();
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timeLeft]);

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    if (hasSubmitted || alreadyPlayed) return;
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  // --- 3. 提交 ---
  async function handleSubmit() {
    if (hasSubmitted || isSubmitting || alreadyPlayed) return;
    setIsTimerRunning(false);
    setIsSubmitting(true);

    let correctCount = 0;
    items.forEach((item, index) => {
      if (item.id === correctData.correctOrder[index].id) {
        correctCount += 1;
      }
    });

    const timeBonus =
      correctCount === correctData.correctOrder.length ? timeLeft * 10 : 0;
    const finalScore = correctCount * 100 + timeBonus;

    setScore(finalScore);
    setHasSubmitted(true);

    // --- 写入本地存储 (防止刷新重玩) ---
    const storageKey = `process_game_${sessionId}_submitted`;
    localStorage.setItem(storageKey, "true");

    // --- 上传 Firebase ---
    try {
      await addDoc(collection(db, "scores"), {
        sessionId: sessionId, // 关键：上传 sessionId
        nickname: nickname,
        levelId: currentLevelId,
        score: finalScore,
        correctCount: correctCount,
        timeTaken: timeLimitParam - timeLeft,
        timestamp: serverTimestamp(),
      });
    } catch (e) {
      console.error("Error", e);
    } finally {
      setIsSubmitting(false);
    }
  }

  const getItemStatus = (item: Step, index: number) => {
    if (!hasSubmitted) return "normal";
    return item.id === correctData.correctOrder[index].id ? "correct" : "wrong";
  };

  // --- 如果已经玩过，显示禁止画面 ---
  if (alreadyPlayed) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-6 text-center">
        <CheckCircle size={80} className="text-green-500 mb-6" />
        <h1 className="text-3xl font-bold mb-2">You've already played!</h1>
        <p className="text-slate-400">
          Please wait for the teacher to start a new round.
        </p>
      </div>
    );
  }

  if (!items.length) return <div className="min-h-screen bg-indigo-600"></div>;

  return (
    // ... UI 代码 (Return 部分) 和之前的一样，不用动 ...
    // ... 确保使用 timeLeft 变量显示倒计时 ...
    <div className="min-h-screen bg-gradient-to-b from-indigo-600 via-purple-600 to-purple-900 flex flex-col items-center py-8">
      {/* 顶部信息栏 */}
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
        <div className="text-right">
          <div className="text-xs text-purple-200">Player</div>
          <div className="font-bold">{nickname}</div>
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
                status={getItemStatus(item, index)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <div className="fixed bottom-0 w-full bg-white p-4 rounded-t-2xl shadow-2xl flex flex-col items-center z-50">
        {!hasSubmitted ? (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full max-w-md bg-green-500 hover:bg-green-600 disabled:bg-slate-400 text-white font-black py-4 rounded-xl text-xl shadow-[0_4px_0_rgb(21,128,61)] active:shadow-none active:translate-y-1 transition-all"
          >
            {isSubmitting ? "SUBMITTING..." : "SUBMIT"}
          </button>
        ) : (
          <div className="text-center w-full max-w-md animate-in slide-in-from-bottom duration-500">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-1">
              Total Score
            </h2>
            <div className="text-5xl font-black text-indigo-600 mb-4">
              {score}
            </div>
            <div className="bg-slate-100 p-3 rounded-lg mb-4 text-slate-500 text-sm">
              Wait for the teacher to start the next round.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function GamePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <GameContent />
    </Suspense>
  );
}
