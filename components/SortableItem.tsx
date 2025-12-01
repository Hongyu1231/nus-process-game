// src/components/SortableItem.tsx
import React from "react";
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

export function SortableItem({ id, content, isLast, disabled, status }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled: disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
  };

  // 这里专门针对字体颜色做了加深处理 (900系列是Tailwind里最深的颜色)
  const getColors = () => {
    if (isDragging) return "bg-blue-50 border-blue-500 text-blue-900"; // 拖拽时：深蓝字
    if (status === "correct")
      return "bg-green-100 border-green-600 text-green-900"; // 正确：深绿字
    if (status === "wrong") return "bg-red-50 border-red-500 text-red-900"; // 错误：深红字
    return "bg-white border-slate-300 text-slate-900"; // 默认：深黑灰字
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col items-center w-full transition-colors duration-200"
    >
      {/* 卡片本体 */}
      <div
        {...attributes}
        {...listeners}
        className={`
          w-full p-4 rounded-xl shadow-md text-center font-bold text-lg
          border-2 border-b-4 
          ${disabled ? "cursor-default" : "cursor-grab touch-none"} 
          ${getColors()} 
          transition-all relative flex items-center justify-center
        `}
      >
        {/* 状态图标也加深了颜色 */}
        {status === "correct" && (
          <CheckCircle className="absolute left-3 w-6 h-6 text-green-700" />
        )}
        {status === "wrong" && (
          <XCircle className="absolute left-3 w-6 h-6 text-red-600" />
        )}

        <span className="px-6">{content}</span>
      </div>

      {/* 连接箭头 */}
      {!isLast && (
        <div className="h-8 flex items-center justify-center text-white/80 drop-shadow-md">
          <ArrowDown size={32} strokeWidth={3} />
        </div>
      )}
    </div>
  );
}
