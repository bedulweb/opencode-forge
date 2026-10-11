import { ArrowRightIcon, ServerIcon } from 'lucide-react'
import { COLUMNS, COLUMN_LABEL, type Workspace } from '../../shared/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card'
import { Meter, MeterIndicator, MeterLabel, MeterTrack, MeterValue } from '@/components/ui/meter'
import { href } from '@/lib/route'
import { usd } from '@/lib/format'

export function Overview({ data }: { data: Workspace }) {
  const butuh = data.cards.filter((c) => c.column === 'butuh')
  const running = data.cards.filter((c) => c.column === 'jalan')
  const counts = COLUMNS.map((col) => ({ col, n: data.cards.filter((c) => c.column === col).length }))

  return (
    <div className="grid gap-4">
      <Card className={butuh.length > 0 ? 'border-warning/48' : undefined}>
        <CardHeader>
          <CardTitle>Butuh kamu</CardTitle>
          <CardDescription>
            {butuh.length === 0 ? 'Tidak ada yang menunggu keputusanmu.' : `${butuh.length} kartu menunggu keputusanmu.`}
          </CardDescription>
        </CardHeader>
        {butuh.length > 0 && (
          <CardPanel className="grid gap-2">
            {butuh.map((c) => (
              <a
                key={c.id}
                href={href.project(c.projectId)}
                className="flex items-start gap-3 rounded-lg border p-3 hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm">
                    {c.title} <span className="text-muted-foreground">#{c.number}</span>
                  </div>
                  {c.question && <div className="mt-0.5 text-muted-foreground text-sm">{c.question}</div>}
                </div>
                <Badge variant="outline">{c.projectId}</Badge>
                <ArrowRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              </a>
            ))}
          </CardPanel>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Kartu per kolom</CardTitle>
            <CardDescription>Semua proyek</CardDescription>
          </CardHeader>
          <CardPanel>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              {counts.map(({ col, n }) => (
                <div key={col} className="flex items-baseline justify-between gap-2 border-b py-1">
                  <dt className="text-muted-foreground">{COLUMN_LABEL[col]}</dt>
                  <dd className="font-mono tabular-nums">{n}</dd>
                </div>
              ))}
            </dl>
          </CardPanel>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sedang jalan</CardTitle>
            <CardDescription>{running.length} ticket dikerjakan agent</CardDescription>
          </CardHeader>
          <CardPanel className="grid gap-2 text-sm">
            {running.length === 0 && <p className="text-muted-foreground">Tidak ada job yang berjalan.</p>}
            {running.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {c.title} <span className="text-muted-foreground">#{c.number}</span>
                </span>
                <span className="shrink-0 font-mono text-muted-foreground tabular-nums">
                  percobaan {c.attempts} · {usd(c.costUsd)}
                </span>
              </div>
            ))}
          </CardPanel>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Biaya bulan ini</CardTitle>
            <CardDescription>Biaya LLM per proyek dibanding budget</CardDescription>
          </CardHeader>
          <CardPanel className="grid gap-4">
            {data.projects.map((p) => (
              <Meter key={p.id} value={p.monthCostUsd} max={p.monthBudgetUsd ?? Math.max(p.monthCostUsd, 1)}>
                <div className="flex items-center justify-between gap-2">
                  <MeterLabel>{p.id}</MeterLabel>
                  <MeterValue className="font-mono text-sm tabular-nums">
                    {() => `${usd(p.monthCostUsd)}${p.monthBudgetUsd ? ` / ${usd(p.monthBudgetUsd)}` : ''}`}
                  </MeterValue>
                </div>
                <MeterTrack>
                  <MeterIndicator />
                </MeterTrack>
              </Meter>
            ))}
          </CardPanel>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Node</CardTitle>
            <CardDescription>Mesin yang menjalankan agent</CardDescription>
          </CardHeader>
          <CardPanel className="grid gap-2 text-sm">
            {data.nodes.map((n) => (
              <div key={n.id} className="flex items-center gap-3">
                <ServerIcon className="size-4 text-muted-foreground" />
                <span className="flex-1 truncate">{n.name}</span>
                <Badge variant={n.online ? 'success' : 'error'}>{n.online ? 'online' : 'offline'}</Badge>
                <span className="whitespace-nowrap text-right font-mono text-muted-foreground tabular-nums">
                  {n.slotsUsed}/{n.slotsTotal} slot
                </span>
              </div>
            ))}
          </CardPanel>
        </Card>
      </div>
    </div>
  )
}
