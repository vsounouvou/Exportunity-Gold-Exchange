import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { SortableMemoryItem } from "@/components/SortableMemoryItem";
import type { Memory } from "@/types/memory";

interface MemoryOrganizerProps {
  memories: Memory[];
  onOrderChange: (newMemories: Memory[]) => void;
}

export function MemoryOrganizer({ memories, onOrderChange }: MemoryOrganizerProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = memories.findIndex((item) => item.id === active.id);
      const newIndex = memories.findIndex((item) => item.id === over.id);
      const newMemories = arrayMove(memories, oldIndex, newIndex);
      onOrderChange(newMemories);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-2">
        <SortableContext
          items={memories.map((memory) => memory.id)}
          strategy={verticalListSortingStrategy}
        >
          {memories.map((memory) => (
            <SortableMemoryItem key={memory.id} memory={memory} />
          ))}
        </SortableContext>
      </div>
    </DndContext>
  );
}