import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { CheckCircle2Icon, CircleDashedIcon, LinkIcon, XCircleIcon } from 'lucide-react'
import { useState } from 'react'
import { COLUMNS, COLUMN_LABEL, type Card, type Column } from '../../shared/types'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Sheet, SheetDescription, SheetHeader, SheetPanel, SheetPopup, SheetTitle } from '@/components/ui/sheet'
import { ago, usd } from '@/lib/format'
import { cn } from '@/lib/utils'

// Columns a person may drop a card into. Others are entered by the agent.
const DROPPABLE: ReadonlySet<Column> = new Set(['ide', 'bug', 'tempa', 'siap', 'selesai'])

export function Kanban({
  cards,
  onMove,
  projectKnown,
}: {
  cards: Card[]
  onMove: (cardId: string, column: Column) => void
  projectKnown: boolean
}) {
  const [open, setOpen] = useState<Card | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  if (!projectKnown) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Proyek tidak ditemukan</EmptyTitle>
          <EmptyDescription>Pilih proyek dari sidebar.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const onDragEnd = (e: DragEndEvent) => {
    const to = e.over?.id as Column | undefined
    const card = cards.find((c) => c.id === e.active.id)
    if (card && to && to !== card.column && DROPPABLE.has(to)) onMove(card.id, to)
  }

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="min-w-0 overflow-x-auto pb-2">
          <div className="grid auto-cols-[minmax(15rem,1fr)] grid-flow-col gap-3">
            {COLUMNS.map((col) => (
              <KanbanColumn key={col} column={col} cards={cards.filter((c) => c.column === col)} onOpen={setOpen} />
            ))}
          </div>
        </div>
      </DndContext>
      <CardSheet card={open} onClose={() => setOpen(null)} />
    </>
  )
}

function KanbanColumn({ column, cards, onOpen }: { column: Column; cards: Card[]; onOpen: (c: Card) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: column, disabled: !DROPPABLE.has(column) })
  return (
    <section
      ref={setNodeRef}
      aria-label={COLUMN_LABEL[column]}
      className={cn(
        'flex min-h-40 flex-col gap-2 rounded-xl border bg-muted/40 p-2',
        column === 'butuh' && cards.length > 0 && 'border-warning/48',
        isOver && 'ring-2 ring-ring',
      )}
    >
      <h2 className="flex items-center justify-between px-1 pt-1 font-medium text-sm">
        {COLUMN_LABEL[column]}
        <span className="font-mono text-muted-foreground text-xs tabular-nums">{cards.length}</span>
      </h2>
      {cards.map((c) => (
        <KanbanCard key={c.id} card={c} onOpen={onOpen} />
      ))}
    </section>
  )
}

function KanbanCard({ card, onOpen }: { card: Card; onOpen: (c: Card) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(card)}
      className={cn(
        'grid gap-1.5 rounded-lg border bg-card p-3 text-left text-sm shadow-xs/5 focus-visible:outline-2 focus-visible:outline-ring',
        isDragging && 'z-20 opacity-80 shadow-lg',
      )}
    >
      <span className="font-medium leading-snug">{card.title}</span>
      <span className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
        <span className="font-mono">#{card.number}</span>
        {card.blockedBy.length > 0 && (
          <Badge variant="outline" size="sm">
            tunggu {card.blockedBy.map((n) => `#${n}`).join(', ')}
          </Badge>
        )}
        {card.pr && <ChecksBadge checks={card.pr.checks} />}
        {card.costUsd > 0 && <span className="ml-auto font-mono tabular-nums">{usd(card.costUsd)}</span>}
      </span>
    </button>
  )
}

function ChecksBadge({ checks }: { checks: 'pending' | 'success' | 'failure' }) {
  if (checks === 'success')
    return (
      <Badge variant="success" size="sm">
        <CheckCircle2Icon /> CI
      </Badge>
    )
  if (checks === 'failure')
    return (
      <Badge variant="error" size="sm">
        <XCircleIcon /> CI
      </Badge>
    )
  return (
    <Badge variant="info" size="sm">
      <CircleDashedIcon /> CI
    </Badge>
  )
}

function CardSheet({ card, onClose }: { card: Card | null; onClose: () => void }) {
  return (
    <Sheet open={card !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetPopup>
        {card && (
          <>
            <SheetHeader>
              <SheetTitle>{card.title}</SheetTitle>
              <SheetDescription>
                {card.id} · {COLUMN_LABEL[card.column]} · diperbarui {ago(card.updatedAt)}
              </SheetDescription>
            </SheetHeader>
            <SheetPanel className="grid gap-4 text-sm">
              {card.question && (
                <div className="rounded-lg border border-warning/48 bg-warning/8 p-3">
                  <div className="font-medium">Pertanyaan agent</div>
                  <p className="mt-1 text-muted-foreground">{card.question}</p>
                </div>
              )}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <dt className="text-muted-foreground">Biaya</dt>
                <dd className="font-mono tabular-nums">{usd(card.costUsd)}</dd>
                <dt className="text-muted-foreground">Percobaan</dt>
                <dd className="font-mono tabular-nums">{card.attempts}</dd>
                <dt className="text-muted-foreground">Menunggu</dt>
                <dd>{card.blockedBy.length ? card.blockedBy.map((n) => `#${n}`).join(', ') : 'tidak ada'}</dd>
                {card.pr && (
                  <>
                    <dt className="text-muted-foreground">Pull request</dt>
                    <dd className="flex items-center gap-1.5">
                      <LinkIcon className="size-3.5" /> #{card.pr.number}
                    </dd>
                  </>
                )}
              </dl>
              <p className="text-muted-foreground">Timeline, log live, dan chat untuk kartu ini menyusul di tahap berikutnya.</p>
            </SheetPanel>
          </>
        )}
      </SheetPopup>
    </Sheet>
  )
}
