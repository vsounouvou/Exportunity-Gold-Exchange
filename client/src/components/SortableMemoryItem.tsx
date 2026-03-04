import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Memory } from "@/types/memory";

interface SortableMemoryItemProps {
  memory: Memory;
}

export function SortableMemoryItem({ memory }: SortableMemoryItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: memory.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 p-4 rounded-lg transition-colors duration-200",
        isDragging
          ? "bg-blue-500/10 border border-blue-500/50 shadow-lg"
          : "bg-gray-800/50 border border-gray-700/50 hover:bg-gray-800"
      )}
    >
      <button
        className={cn(
          "touch-none p-1 cursor-grab active:cursor-grabbing",
          isDragging ? "text-blue-400" : "text-gray-400 hover:text-gray-300"
        )}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>

      <div className="flex-1 min-w-0">
        <p className="text-gray-100 mb-1 line-clamp-2">{memory.content}</p>
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <span>
            {new Date(memory.timestamp).toLocaleDateString()}
          </span>
          {memory.importance && (
            <span>
              Priority: {memory.importance}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}