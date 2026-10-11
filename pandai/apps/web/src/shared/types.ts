// Shapes the dashboard API returns. Cards and columns mirror GitHub issues and
// their `pandai:*` labels; nodes and costs come from the control plane.

export const COLUMNS = ['ide', 'bug', 'tempa', 'siap', 'jalan', 'butuh', 'tinjau', 'selesai'] as const
export type Column = (typeof COLUMNS)[number]

export const COLUMN_LABEL: Record<Column, string> = {
  ide: 'Ide',
  bug: 'Bug',
  tempa: 'Tempa',
  siap: 'Siap',
  jalan: 'Jalan',
  butuh: 'Butuh kamu',
  tinjau: 'Tinjau',
  selesai: 'Selesai',
}

export interface Card {
  /** `<owner>/<repo>#<number>` */
  id: string
  projectId: string
  number: number
  title: string
  column: Column
  /** Ticket numbers (same project) this card waits on. */
  blockedBy: number[]
  costUsd: number
  attempts: number
  updatedAt: string
  /** Why the card needs you, when column is `butuh`. */
  question?: string
  pr?: { number: number; checks: 'pending' | 'success' | 'failure' }
}

export interface Project {
  id: string
  repo: string
  priority: 'high' | 'normal' | 'low'
  monthBudgetUsd?: number
  monthCostUsd: number
}

export interface NodeInfo {
  id: string
  name: string
  online: boolean
  slotsUsed: number
  slotsTotal: number
  lastSeen: string
}

export interface Workspace {
  /** True while the API serves built-in sample data instead of GitHub. */
  sample: boolean
  projects: Project[]
  cards: Card[]
  nodes: NodeInfo[]
}

export interface MoveRequest {
  column: Column
}
