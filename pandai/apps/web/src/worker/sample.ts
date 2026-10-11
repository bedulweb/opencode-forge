import type { Workspace } from '../shared/types'

// Example data shown until the GitHub App is connected. The UI labels it as
// sample data so it is never mistaken for real project state.
export function sampleWorkspace(now = Date.now()): Workspace {
  const ago = (min: number) => new Date(now - min * 60_000).toISOString()
  return {
    sample: true,
    projects: [
      { id: 'contoh-api', repo: 'contoh/api', priority: 'high', monthBudgetUsd: 100, monthCostUsd: 41.2 },
      { id: 'contoh-web', repo: 'contoh/web', priority: 'normal', monthBudgetUsd: 50, monthCostUsd: 12.75 },
    ],
    cards: [
      { id: 'contoh/api#12', projectId: 'contoh-api', number: 12, title: 'Notifikasi WA saat pembayaran gagal', column: 'tempa', blockedBy: [], costUsd: 0.4, attempts: 0, updatedAt: ago(30) },
      { id: 'contoh/api#13', projectId: 'contoh-api', number: 13, title: 'Tabel log notifikasi', column: 'jalan', blockedBy: [], costUsd: 1.1, attempts: 1, updatedAt: ago(4) },
      { id: 'contoh/api#14', projectId: 'contoh-api', number: 14, title: 'Retry pengiriman 3×', column: 'siap', blockedBy: [13], costUsd: 0, attempts: 0, updatedAt: ago(50) },
      { id: 'contoh/api#15', projectId: 'contoh-api', number: 15, title: 'Checkout error saat voucher kosong', column: 'butuh', blockedBy: [], costUsd: 2.3, attempts: 2, updatedAt: ago(12), question: 'Voucher kosong: tolak di form atau abaikan di server?' },
      { id: 'contoh/api#9', projectId: 'contoh-api', number: 9, title: 'Rate limit endpoint login', column: 'tinjau', blockedBy: [], costUsd: 1.8, attempts: 1, updatedAt: ago(90), pr: { number: 31, checks: 'success' } },
      { id: 'contoh/web#4', projectId: 'contoh-web', number: 4, title: 'Halaman riwayat notifikasi', column: 'ide', blockedBy: [], costUsd: 0, attempts: 0, updatedAt: ago(300) },
      { id: 'contoh/web#5', projectId: 'contoh-web', number: 5, title: 'Tombol salin ID transaksi tidak jalan di Safari', column: 'bug', blockedBy: [], costUsd: 0.2, attempts: 0, updatedAt: ago(20) },
      { id: 'contoh/web#2', projectId: 'contoh-web', number: 2, title: 'Mode gelap di dashboard', column: 'selesai', blockedBy: [], costUsd: 1.4, attempts: 1, updatedAt: ago(1440) },
    ],
    nodes: [
      { id: 'n1', name: 'vps-utama', online: true, slotsUsed: 1, slotsTotal: 3, lastSeen: ago(0) },
      { id: 'n2', name: 'daytona-cadangan', online: false, slotsUsed: 0, slotsTotal: 1, lastSeen: ago(2880) },
    ],
  }
}
