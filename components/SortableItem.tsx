// components/SortableItem.tsx
"use client";

import React, { memo, forwardRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckCircle,
  XCircle,
  GripVertical,
  ArrowRight,
  ArrowDown,
  ArrowUp,
} from "lucide-react";

type Props = {
  id: string;
  content: string;
  disabled?: boolean;
  status?: "normal" | "correct" | "wrong";
  variant?: "bank" | "answer";
  correctSolution?: string;
  arrowDir?: "right" | "down" | "up" | "none";
  isDragging?: boolean;
  isOver?: boolean; // ✅ 新增：是否被悬停
};

// --- 1. 纯 UI 组件 ---
export const ItemCard = memo(
  forwardRef<HTMLDivElement, Props & React.HTMLAttributes<HTMLDivElement>>(
    (
      {
        content,
        disabled,
        status = "normal",
        variant = "answer",
        correctSolution,
        arrowDir = "none",
        isDragging,
        isOver,
        style,
        ...props
      },
      ref
    ) => {
      const getColors = () => {
        // 1. 正在被拖拽：深色文字 + 强烈阴影
        if (isDragging)
          return "bg-indigo-100 border-indigo-500 text-indigo-900 shadow-2xl scale-105 z-50";

        // 2. ✅ 核心修改：作为目标被悬停时 (Swap 提示)
        // 显示黄色边框 + 轻微放大，提示用户可以交换
        if (isOver && !disabled)
          return "bg-yellow-50 border-yellow-400 text-slate-900 scale-105 shadow-[0_0_20px_rgba(250,204,21,0.6)] z-40 ring-2 ring-yellow-300";

        // 3. 结果展示状态
        if (status === "correct")
          return "bg-green-50 border-green-500 text-green-900 ring-2 ring-green-200";
        if (status === "wrong")
          return "bg-red-50 border-red-500 text-red-900 ring-2 ring-red-200";

        // 4. 普通状态
        if (variant === "bank")
          return "bg-slate-100 border-slate-300 text-slate-700 hover:border-indigo-400 hover:bg-white";
        return "bg-white border-slate-300 text-slate-900";
      };

      const isBank = variant === "bank";

      return (
        <div
          ref={ref}
          style={style}
          className={`relative flex flex-col items-center w-full transition-all duration-200`}
          {...props}
        >
          {/* 卡片主体 */}
          <div
            className={`
                w-full relative flex flex-col justify-center items-center text-center select-none z-10
                ${
                  disabled
                    ? "cursor-default"
                    : "cursor-grab active:cursor-grabbing"
                } 
                ${getColors()} 
                ${
                  isBank
                    ? "p-2 text-xs rounded-lg min-h-[50px]"
                    : "p-3 text-sm font-bold min-h-[70px] shadow-md rounded-[2rem]"
                } 
            `}
          >
            <div className="flex items-center justify-center gap-2 w-full px-1">
              <div className="shrink-0">
                {status === "correct" && (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                )}
                {status === "wrong" && (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
                {status === "normal" && !disabled && variant === "bank" && (
                  <GripVertical className="w-3 h-3 text-slate-400" />
                )}
              </div>
              <div className="leading-tight break-words w-full">{content}</div>
            </div>

            {status === "wrong" && correctSolution && (
              <div className="mt-1 pt-1 border-t border-red-200 text-[10px] text-green-700 font-mono w-full text-center">
                <span className="opacity-70 mr-1 text-green-700 font-bold">
                  Ans:
                </span>
                {correctSolution}
              </div>
            )}
          </div>

          {/* 箭头渲染 */}
          {!isBank && !isDragging && arrowDir !== "none" && (
            <div
              className={`absolute pointer-events-none text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] z-0
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
    }
  )
);
ItemCard.displayName = "ItemCard";

// --- 2. 逻辑包装组件 ---
export const SortableItem = memo(function SortableItem(props: Props) {
  // FIX: 获取 isOver 状态并传给 ItemCard
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: props.id,
    disabled: props.disabled,
    data: { variant: props.variant },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 999 : "auto",
    touchAction: "none",
  };

  return (
    <ItemCard
      ref={setNodeRef}
      style={style}
      isDragging={isDragging}
      isOver={isOver} // ✅ 传递 hover 状态
      {...props}
      {...attributes}
      {...listeners}
    />
  );
});
