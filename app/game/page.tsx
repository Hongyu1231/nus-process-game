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
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";

// FIX: 1. 确保导入 Modifier 类型
// FIX: 2. 移除 @dnd-kit/modifiers 的导入，避免与下方本地定义冲突
import {
  DndContext,
  pointerWithin,
  DragEndEvent,
  DragOverEvent,
  TouchSensor,
  MouseSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
  DragStartEvent,
  Modifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
} from "@dnd-kit/sortable";

import { SortableItem, ItemCard } from "@/components/SortableItem";
import {
  Clock,
  Loader2,
  Eye,
  CheckCircle,
  Trophy,
  Star,
  GripHorizontal,
  ArrowRight,
  ArrowDown,
  ArrowUp,
} from "lucide-react";

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

// --- 类型定义 ---
type Step = { id: string; content: string };
type LevelData = { id?: string; title: string; correctOrder: Step[] };

// --- 0. 内置修饰符 (解决无需安装包的问题) ---
// 这个函数强制让拖拽物体的中心点对齐鼠标光标
const snapCenterToCursor: Modifier = ({
  transform,
  activatorEvent,
  draggingNodeRect,
}) => {
  if (draggingNodeRect && activatorEvent) {
    const activationCoordinates = {
      x:
        "clientX" in activatorEvent
          ? (activatorEvent as MouseEvent).clientX
          : 0,
      y:
        "clientY" in activatorEvent
          ? (activatorEvent as MouseEvent).clientY
          : 0,
    };

    if (!activationCoordinates.x && !activationCoordinates.y) return transform;

    const offsetX = activationCoordinates.x - draggingNodeRect.left;
    const offsetY = activationCoordinates.y - draggingNodeRect.top;

    return {
      ...transform,
      x: transform.x + offsetX - draggingNodeRect.width / 2,
      y: transform.y + offsetY - draggingNodeRect.height / 2,
    };
  }
  return transform;
};

// --- 1. 占位符组件 (视觉清理版) ---
const SlotPlaceholder = ({
  index,
  arrowDir,
  children,
}: {
  index: number;
  arrowDir: "right" | "down" | "up" | "none";
  children?: React.ReactNode;
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${index}` });
  return (
    <div className="relative flex flex-col items-center w-full">
      <div
        ref={setNodeRef}
        // 透明背景，仅在悬停时显示高亮
        className={`w-full min-h-[70px] rounded-[2rem] flex flex-col justify-center items-center text-center p-3 transition-all duration-200 z-10
                            ${
                              isOver
                                ? "bg-yellow-400/20 ring-2 ring-yellow-400 scale-105"
                                : "bg-white/5"
                            } 
                            text-white/20 text-xs font-bold`}
      >
        {children || `Step ${index + 1}`}
      </div>

      {arrowDir !== "none" && (
        <div
          className={`absolute pointer-events-none text-white/50 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)] z-0
                    ${
                      arrowDir === "right"
                        ? "-right-14 top-1/2 -translate-y-1/2"
                        : ""
                    } 
                    ${
                      arrowDir === "down"
                        ? "-bottom-14 left-1/2 -translate-x-1/2"
                        : ""
                    }
                    ${
                      arrowDir === "up"
                        ? "-top-14 left-1/2 -translate-x-1/2"
                        : ""
                    }
                `}
        >
          {arrowDir === "right" && <ArrowRight size={56} strokeWidth={3} />}
          {arrowDir === "down" && <ArrowDown size={56} strokeWidth={3} />}
          {arrowDir === "up" && <ArrowUp size={56} strokeWidth={3} />}
        </div>
      )}
    </div>
  );
};

// --- 2. Timer ---
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
      if (isStopped) return;
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
        <span className="font-mono font-bold text-xl text-slate-300">
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

// --- 3. ActiveGame ---
function ActiveGame({
  levelId,
  levelData,
  endTimeMillis,
  sessionId,
  nickname,
  avatar,
  roundIndex,
  isReviewMode,
}: {
  levelId: string;
  levelData: LevelData;
  endTimeMillis: number;
  sessionId: string;
  nickname: string;
  avatar: string;
  roundIndex: number;
  isReviewMode: boolean;
}) {
  const [bankItems, setBankItems] = useState<Step[]>([]);
  const [answerSlots, setAnswerSlots] = useState<(Step | null)[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [localScore, setLocalScore] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  const initializedRef = useRef(false);
  const answerSlotsRef = useRef<(Step | null)[]>([]);
  useEffect(() => {
    answerSlotsRef.current = answerSlots;
  }, [answerSlots]);
  useEffect(() => setMounted(true), []);

  const isFull = answerSlots.every((slot) => slot !== null);
  const isLocked = hasSubmitted || isReviewMode;

  useEffect(() => {
    if (!initializedRef.current && levelData && levelData.correctOrder) {
      setBankItems([...levelData.correctOrder].sort(() => Math.random() - 0.5));
      setAnswerSlots(new Array(levelData.correctOrder.length).fill(null));
      initializedRef.current = true;
    }
  }, [levelData]);

  const handleSubmit = useCallback(
    async (isForced = false) => {
      setHasSubmitted((prev) => {
        if (prev) return true;
        return prev;
      });

      const currentAnswers = answerSlotsRef.current;

      if (!isForced) {
        if (!currentAnswers.length || currentAnswers.some((s) => s === null)) {
          alert("Please fill all slots before submitting.");
          return;
        }
      }

      setHasSubmitted(true);
      const subKey = `sub_${sessionId}_round_${roundIndex}`;
      if (sessionStorage.getItem(subKey)) return;
      sessionStorage.setItem(subKey, "true");

      let correctCount = 0;
      levelData.correctOrder.forEach((correctStep, index) => {
        const userStep = currentAnswers[index];
        if (userStep && userStep.id === correctStep.id) correctCount++;
      });

      const isTimeUp = Date.now() > endTimeMillis;
      const timeTaken = isTimeUp
        ? 0
        : Math.max(0, Math.ceil((endTimeMillis - Date.now()) / 1000));

      const isPerfect =
        correctCount === levelData.correctOrder.length &&
        currentAnswers.every((s) => s !== null);
      const timeBonus = isPerfect ? timeTaken * 10 : 0;
      const finalScore = correctCount * 100 + timeBonus;

      setLocalScore(finalScore);

      try {
        await addDoc(collection(db, "scores"), {
          sessionId,
          nickname,
          avatar,
          levelId,
          roundIndex,
          score: finalScore,
          correctCount,
          timeTaken,
          timestamp: serverTimestamp(),
        });
      } catch (e) {
        console.error(e);
      }
    },
    [levelData, levelId, endTimeMillis, sessionId, nickname, avatar, roundIndex]
  );

  useEffect(() => {
    if (isReviewMode && !hasSubmitted) {
      handleSubmit(true);
    }
  }, [isReviewMode, hasSubmitted, handleSubmit]);

  // DnD Logic
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 100, tolerance: 5 },
    })
  );
  const findContainer = (id: string) => {
    if (bankItems.find((i) => i.id === id)) return "bank";
    if (answerSlots.find((i) => i?.id === id)) return "answer";
    return null;
  };
  const getItemById = (id: string) =>
    bankItems.find((i) => i.id === id) || answerSlots.find((i) => i?.id === id);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;
    const activeItem = getItemById(activeIdStr);
    const sourceContainer = findContainer(activeIdStr);
    const isOverAnswerContainer =
      overIdStr === "answer-container" ||
      overIdStr.startsWith("slot-") ||
      findContainer(overIdStr) === "answer";
    const targetContainer = isOverAnswerContainer
      ? "answer"
      : overIdStr === "bank-container"
      ? "bank"
      : null;

    if (!activeItem || !sourceContainer || !targetContainer) return;

    // 1. Slot <-> Slot (交换)
    if (sourceContainer === "answer" && targetContainer === "answer") {
      let activeIndex = answerSlots.findIndex((s) => s?.id === activeIdStr);
      let overIndex = -1;
      if (overIdStr.startsWith("slot-"))
        overIndex = parseInt(overIdStr.replace("slot-", ""), 10);
      else overIndex = answerSlots.findIndex((s) => s?.id === overIdStr);

      if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
        const itemToReturn = answerSlots[overIndex];

        if (itemToReturn) {
          // Swap
          setAnswerSlots((slots) => {
            const newSlots = [...slots];
            const temp = newSlots[activeIndex];
            newSlots[activeIndex] = newSlots[overIndex];
            newSlots[overIndex] = temp;
            return newSlots;
          });
        } else {
          // Move to empty
          setAnswerSlots((slots) => {
            const newSlots = [...slots];
            newSlots[overIndex] = activeItem as Step;
            newSlots[activeIndex] = null;
            return newSlots;
          });
        }
      }
    }
    // 2. Bank -> Slot
    else if (sourceContainer === "bank" && targetContainer === "answer") {
      let targetIndex = -1;
      if (overIdStr.startsWith("slot-"))
        targetIndex = parseInt(overIdStr.replace("slot-", ""), 10);
      else targetIndex = answerSlots.findIndex((s) => s?.id === overIdStr);

      if (targetIndex !== -1) {
        const itemToReturn = answerSlots[targetIndex];
        const newItem = activeItem as Step;

        setBankItems((items) => items.filter((i) => i.id !== activeIdStr));
        setAnswerSlots((slots) => {
          const newSlots = [...slots];
          newSlots[targetIndex] = newItem;
          return newSlots;
        });
        if (itemToReturn) setBankItems((items) => [...items, itemToReturn]);
      }
    }
    // 3. Slot -> Bank
    else if (sourceContainer === "answer" && targetContainer === "bank") {
      const activeIndex = answerSlots.findIndex((s) => s?.id === activeIdStr);
      if (activeIndex !== -1) {
        setAnswerSlots((slots) => {
          const newSlots = [...slots];
          newSlots[activeIndex] = null;
          return newSlots;
        });
        setBankItems((items) => [...items, activeItem as Step]);
      }
    }
  };

  const isLockedUI = isLocked;
  const activeItemData = activeId ? getItemById(activeId) : null;

  // --- U-Shape Layout ---
  const totalSlots = levelData?.correctOrder.length || 0;
  const midPoint = Math.ceil(totalSlots / 2);
  const leftIndices = Array.from({ length: midPoint }, (_, i) => i);
  const rightIndices = Array.from(
    { length: totalSlots - midPoint },
    (_, i) => totalSlots - 1 - i
  );

  const renderSlot = (index: number, colType: "left" | "right") => {
    const item = answerSlots[index];
    let arrowDir: "right" | "down" | "up" | "none" = "none";

    if (colType === "left") {
      if (index === midPoint - 1) arrowDir = "right";
      else arrowDir = "down";
    } else {
      if (index === totalSlots - 1) arrowDir = "none";
      else arrowDir = "up";
    }

    if (!item) {
      return (
        <SlotPlaceholder
          key={`slot-${index}`}
          index={index}
          arrowDir={arrowDir}
        />
      );
    }

    let status: "normal" | "correct" | "wrong" = "normal";
    let correctSolution = undefined;
    if (isReviewMode) {
      const correctStep = levelData.correctOrder[index];
      if (correctStep && item.id === correctStep.id) status = "correct";
      else {
        status = "wrong";
        correctSolution = correctStep ? correctStep.content : "Missing";
      }
    }

    return (
      <SortableContext
        key={item.id}
        items={[item.id]}
        strategy={rectSortingStrategy}
      >
        <SortableItem
          key={item.id}
          id={item.id}
          content={item.content}
          disabled={isLockedUI}
          status={status}
          variant="answer"
          correctSolution={correctSolution}
          arrowDir={arrowDir}
        />
      </SortableContext>
    );
  };

  if (!levelData)
    return (
      <div className="min-h-screen bg-indigo-900 flex items-center justify-center text-white">
        <Loader2 className="animate-spin" /> Loading...
      </div>
    );

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-600 via-purple-600 to-purple-900 flex flex-col h-screen overflow-hidden">
      <div className="w-full px-4 pt-4 pb-2 flex justify-between items-center text-white shrink-0">
        <div className="flex items-center gap-2 bg-white/20 px-3 py-1.5 rounded-full backdrop-blur-sm">
          <Clock size={18} />
          <TimerDisplay
            endTimeMillis={endTimeMillis}
            onTimeUp={() => handleSubmit(true)}
            isStopped={isReviewMode}
          />
        </div>
        <div className="font-bold flex items-center gap-2">
          <span className="text-xl">{avatar}</span> {nickname}
        </div>
      </div>

      <div className="px-4 pb-2 text-center shrink-0">
        <h1 className="text-xl font-extrabold text-white drop-shadow-md leading-tight mb-1">
          {isReviewMode ? "Round Results" : levelData.title}
        </h1>
        {!isLocked && (
          <p className="text-red-500 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-1 animate-pulse">
            <GripHorizontal size={14} />{" "}
            {isFull ? "Drag to Switch Order" : "Drag to Fill Slots"}{" "}
            <GripHorizontal size={14} />
          </p>
        )}
        {isReviewMode && localScore !== null && (
          <div className="mt-2 bg-white/10 backdrop-blur-md rounded-lg p-2 flex justify-center items-center gap-2 border border-white/20">
            <span className="text-xs text-indigo-100 font-bold uppercase">
              Score
            </span>
            <span className="text-2xl font-black text-yellow-400 flex items-center gap-1">
              {localScore} <Star size={18} fill="currentColor" />
            </span>
          </div>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Bank */}
        <div className="px-4 pb-2 shrink-0 max-h-[30vh] overflow-y-auto custom-scrollbar">
          <div className="bg-black/20 rounded-xl p-3 border border-white/10 min-h-[80px]">
            <div className="text-[10px] font-bold text-indigo-300 uppercase mb-2 tracking-wider">
              Option Bank ({bankItems.length})
            </div>
            <SortableContext
              items={bankItems}
              strategy={rectSortingStrategy}
              id="bank-container"
            >
              <div className="grid grid-cols-2 gap-2" id="bank-container">
                {bankItems.map((item) => (
                  <SortableItem
                    key={item.id}
                    id={item.id}
                    content={item.content}
                    disabled={isLockedUI}
                    status="normal"
                    variant="bank"
                    arrowDir="none"
                  />
                ))}
              </div>
            </SortableContext>
            {bankItems.length === 0 && (
              <div className="text-center text-white/30 text-xs py-4 italic">
                All items placed
              </div>
            )}
          </div>
        </div>

        {/* Answer Area */}
        <div className="flex-1 px-4 pb-32 overflow-y-auto min-h-0 custom-scrollbar relative">
          {/* FIX: 移除了 bg-white/10 和 border-dashed，只保留布局 */}
          <div
            className="rounded-xl min-h-full relative px-6 py-6"
            id="answer-container"
          >
            <div className="text-[10px] font-bold text-indigo-200 uppercase mb-4 tracking-wider flex justify-between">
              <span>Your Order</span>
              <span>
                {answerSlots.filter((s) => s !== null).length} / {totalSlots}
              </span>
            </div>

            <div className="flex justify-between gap-12 h-full">
              <div className="flex-1 flex flex-col gap-16">
                {leftIndices.map((idx) => renderSlot(idx, "left"))}
              </div>
              <div className="flex-1 flex flex-col gap-16 justify-end">
                {rightIndices.map((idx) => renderSlot(idx, "right"))}
              </div>
            </div>
          </div>
        </div>

        {mounted &&
          createPortal(
            <DragOverlay modifiers={[snapCenterToCursor]} zIndex={1000}>
              {activeId && activeItemData ? (
                <div className="w-[150px] opacity-90 cursor-grabbing">
                  <ItemCard
                    id={activeId}
                    content={activeItemData.content}
                    disabled={false}
                    status="normal"
                    variant="answer"
                    arrowDir="none"
                    isDragging={true}
                  />
                </div>
              ) : null}
            </DragOverlay>,
            document.body
          )}
      </DndContext>

      {!isReviewMode && (
        <div className="fixed bottom-0 w-full bg-white p-4 rounded-t-2xl shadow-2xl flex flex-col items-center z-50">
          {!hasSubmitted ? (
            <button
              onClick={() => handleSubmit(false)}
              className={`w-full max-w-md text-white font-black py-4 rounded-xl text-xl shadow-lg transition-all 
                            ${
                              isFull
                                ? "bg-green-500 hover:bg-green-600 active:scale-95"
                                : "bg-slate-400 cursor-not-allowed"
                            }`}
            >
              SUBMIT
            </button>
          ) : (
            <div className="text-center w-full max-w-md">
              <div className="flex items-center justify-center gap-2 text-green-600 font-bold text-xl mb-2">
                <CheckCircle /> Submitted!
              </div>
              <p className="text-slate-500 text-sm">Wait for results...</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- 4. Main Container ---
function GameContent() {
  const searchParams = useSearchParams();
  const nickname = searchParams.get("nickname") || "Anonymous";
  const avatar = searchParams.get("avatar") || "👤";
  const sessionId = searchParams.get("session") || "";

  const [sessionData, setSessionData] = useState<any>(null);
  const [finalStandings, setFinalStandings] = useState<any[]>([]);
  const [myRank, setMyRank] = useState(0);

  useEffect(() => {
    if (!sessionId) return;
    const unsub = onSnapshot(doc(db, "sessions", sessionId), (docSnap) => {
      if (docSnap.exists()) setSessionData(docSnap.data());
    });
    return () => unsub();
  }, [sessionId]);

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
        <p className="text-xl text-indigo-200 mb-8">
          Waiting for instructor to start...
        </p>
        <div className="bg-indigo-800 px-8 py-4 rounded-full font-bold text-2xl flex items-center gap-3">
          <span>{avatar}</span> {nickname}
        </div>
      </div>
    );
  }

  if (
    sessionData.status === "playing" ||
    sessionData.status === "review" ||
    sessionData.status === "leaderboard"
  ) {
    const currentIndex = sessionData.currentLevelIndex;
    const playlistItem = sessionData.playlist?.[currentIndex];
    const levelData = playlistItem?.levelData;
    const currentLevelId = playlistItem?.levelId;
    const endTime = sessionData.endTime?.toMillis() || Date.now() + 60000;
    const isReviewMode =
      sessionData.status === "review" || sessionData.status === "leaderboard";

    if (!levelData || !currentLevelId)
      return (
        <div className="min-h-screen bg-indigo-900 text-white flex items-center justify-center">
          Loading Level...
        </div>
      );

    return (
      <ActiveGame
        key={`${sessionId}_round_${currentIndex}`}
        levelId={currentLevelId}
        levelData={levelData}
        endTimeMillis={endTime}
        sessionId={sessionId}
        nickname={nickname}
        avatar={avatar}
        roundIndex={currentIndex}
        isReviewMode={isReviewMode}
      />
    );
  }

  // FINAL PODIUM
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
