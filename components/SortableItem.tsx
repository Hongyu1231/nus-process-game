// components/SortableItem.tsx
import React, { memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, CheckCircle, XCircle } from "lucide-react";

type Props = {
  id: string;
  content: string;
  isLast: boolean;
  disabled: boolean;
  status: "normal" | "correct" | "wrong";
};

// 使用 memo 防止父组件(倒计时)刷新导致卡片重绘
export const SortableItem = memo(function SortableItem({
  id,
  content,
  isLast,
  disabled,
  status,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled,
    animateLayoutChanges: () => false, // 性能优化：减少不必要的布局动画计算
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
    touchAction: "none", // 关键：防止移动端滚动干扰拖拽
  };

  const getColors = () => {
    if (isDragging)
      return "bg-blue-50 border-blue-500 text-blue-900 scale-105 shadow-xl";
    if (status === "correct")
      return "bg-green-100 border-green-600 text-green-900 ring-2 ring-green-400";
    if (status === "wrong")
      return "bg-red-50 border-red-500 text-red-900 ring-2 ring-red-300 opacity-80";
    return "bg-white border-slate-300 text-slate-900";
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col items-center w-full transition-colors duration-200"
    >
      <div
        {...attributes}
        {...listeners}
        className={`
          w-full p-4 rounded-xl shadow-md text-center font-bold text-lg
          border-2 border-b-4 relative flex items-center justify-center
          ${disabled ? "cursor-default" : "cursor-grab"} 
          ${getColors()} 
        `}
      >
        {status === "correct" && (
          <CheckCircle className="absolute left-3 w-6 h-6 text-green-700" />
        )}
        {status === "wrong" && (
          <XCircle className="absolute left-3 w-6 h-6 text-red-600" />
        )}
        <span className="px-6">{content}</span>
      </div>
      {!isLast && (
        <div className="h-8 flex items-center justify-center text-white/80 drop-shadow-md">
          <ArrowDown size={32} strokeWidth={3} />
        </div>
      )}
    </div>
  );
});
