# Pandai: arsitektur, flow, dan loop (ringkasan final)

Tanggal: 2026-10-11. Detail keputusan dan alasannya ada di `DESAIN.md`; bukti riset ada di `RISET.md`.

## 1. Arsitektur

```
┌──────────────────────────── KAMU (laptop / HP) ────────────────────────────┐
│  Dashboard Pandai        opencode web (chat)        Telegram/WA (notif)    │
└───────┬──────────────────────────┬───────────────────────────┬─────────────┘
        │                          │ Cloudflare Tunnel+Access  │
┌───────▼─────────────┐            │                           │
│ CLOUDFLARE (selalu  │            │                           │
│ hidup, gratis)      │            │                           │
│ • Pages: UI React   │            │                           │
│ • Worker: API +     │◄── webhook ┼───────────┐               │
│   webhook + notif ──┼────────────┼───────────┼──────────────►┘
│ • D1: cache, chat   │            │           │
└───────┬─────────────┘            │           │
        │ GitHub API               │           │
┌───────▼──────────────────────────┼───────────┴──────────────────────────────┐
│ GITHUB (sumber kebenaran + otak)                                            │
│ • Issues = kartu · Label = kolom · Komentar = diskusi/timeline             │
│ • Branch/PR = hasil kerja · Merge queue · Required checks                   │
│ • Actions = otak: pandai-tempa, pandai-bug, pandai-scheduler,               │
│   pandai-jalan, pandai-review, ci-gate                                      │
└───────┬───────────────────────────────┬───────────────────────┬────────────┘
        │ job agent                     │ job CI gate           │ job ringan
┌───────▼───────────────────┐  ┌────────▼────────┐  ┌───────────▼──────────┐
│ VM 6CPU/16GB (utama)      │  │ DEPOT           │  │ GitHub-hosted        │
│ • 2–3 runner ephemeral    │  │ test/type/lint  │  │ scheduler, sync      │
│ • opencode (headless)     │  │ + proteksi test │  │ + cadangan agent     │
│ • opencode web (chat)     │  └─────────────────┘  │   saat VM mati       │
│ • skill Matt + pandai CLI │                       └──────────────────────┘
└───────────────────────────┘
   cadangan: DAYTONA (sandbox persisten untuk chat/ambil alih saat VM mati)
   secret:   DOPPLER → GitHub secrets, VM, Cloudflare
```

| Komponen | Peran | Kalau mati |
|---|---|---|
| GitHub | Data + otak (pemicu, scheduler, CI, merge) | — (pusat) |
| Cloudflare | Dashboard, webhook → notifikasi | GitHub tetap bisa dipakai langsung |
| VM | Otot agent + chat `opencode web` | Job pindah ke GitHub-hosted atau antre; chat pindah ke Daytona |
| Depot | CI gate | — |
| Doppler | Semua secret | — |

## 2. Flow kartu

```
              🧑 tulis                🤖 tanya-jawab            🧑 /siap
 💡 Ide ──────────────────► 🔨 Tempa ◄──────────────► 🧑 ────────────────┐
                               │ 🤖 spec + ticket (sub-issue, blocked-by)  │
                               ▼                                           ▼
 🐞 Bug ──► 🤖 repro (test merah) ──► 🧑 /siap ──────────────────► ✅ Siap
                                                                        │ scheduler
                                                                        ▼
                                          ┌───────────────────── 🔁 Jalan (loop §3)
                                          │                         │        │
                              🧑 jawab ◄──┤ ✋ Butuh kamu ◄──────────┘        │
                                          └────────────────────────►        │
                                                                             ▼
                          🧑 komentar (jadi finding) ◄────────────── 👀 Tinjau (PR)
                                   │                                         │ 🧑 approve
                                   └──────────► 🔁 Jalan          merge queue (CI ulang)
                                                                             ▼
                                                                        🎉 Selesai
```

**Tugas kamu cuma:** tulis kartu → jawab pertanyaan → `/siap` → review PR.

## 3. Loop per ticket (kolom 🔁 Jalan)

```
                    ┌────────────────────────────────────────────┐
                    │ 0. SIAPKAN                                 │
                    │ checkout branch pandai/<n> (atau lanjutkan)│
                    │ pasang skill, ambil secret                 │
                    └───────────────────┬────────────────────────┘
                                        ▼
                    ┌────────────────────────────────────────────┐
                    │ 1. TEST DULU (sekali per ticket)           │
                    │ agent menulis acceptance test dari kriteria│
                    │ Pandai jalankan → HARUS merah → kunci hash │
                    └───────────────────┬────────────────────────┘
                                        ▼
               ┌──────────────► 2. KERJAKAN (opencode + skill tdd)
               │                   • watchdog stall / wall-clock / budget $
               │                   • push branch tiap checkpoint
               │                   • pintu darurat: BLOCKED → ✋
               │                        │
               │                        ▼
               │                3. PR draft + CI GATE (Depot, job terpisah)
               │                   test + typecheck + lint + test terkunci utuh
               │                        │
               │         merah ◄────────┴────────► hijau
               │           │                         │
               │   ronde < 2? ──tidak──► ✋          ▼
               │           │ya            4. REVIEW (agent lain, konteks bersih)
               │           │                 • Spec: sesuai ticket?   → blokir
               └───────────┘                 • Standar: kualitas      → saran
               ▲                                     │
               │        pelanggaran spec ◄───────────┴──────► lulus
               │        & ronde < 2                            │
               └────────────┘ (ronde habis → ✋)              ▼
                                                    5. 👀 TINJAU → notif ke kamu
```

| Batas | Default | Kalau tercapai |
|---|---|---|
| Ronde perbaikan CI | 2 | ✋ Butuh kamu + ringkasan |
| Ronde perbaikan review | 2 | ✋ Butuh kamu |
| Budget per ticket | mis. $3 | Diparkir + ringkasan |
| Wall-clock per job | 90 menit | Checkpoint, lalu job lanjutan |
| Stall (tanpa progres) | 5 menit | Kill, lalu coba lagi (2× sidik sama → ✋) |
| Paralel | 2–3 ticket | Sisanya antre di scheduler |

**Scheduler** (cron + event), setiap kali dipicu:
1. Hitung ticket yang siap jalan, yaitu ticket yang semua blocker-nya sudah merge.
2. Hindari menjalankan bersamaan ticket yang menyentuh file yang sama.
3. Isi slot kosong dengan ticket yang siap.
4. Setelah merge, beri tahu ticket yang sedang jalan tentang perubahan itu (rebase + catatan).

## 4. Kejadian tak terduga

| Kejadian | Penanganan |
|---|---|
| VM mati | Job gagal → dispatch ulang → GitHub-hosted atau antre → lanjut dari branch terakhir |
| Agent mengubah test terkunci / tambah skip | CI gate gagal → kembali ke langkah 2 |
| Spec ternyata mustahil | Agent keluar dengan BLOCKED → ✋, tidak memaksa |
| Kuota / API provider error | Circuit breaker: semua job berhenti dulu, notif ke kamu |
| Konflik merge | Ticket di-rebase oleh agent pemiliknya, lalu CI diulang |
| Cloudflare down | Tetap bisa kerja lewat GitHub web/app; loop tidak terpengaruh |

## 5. Struktur kode (TypeScript + Bun)

```
pandai/
├── cli/            # binary `pandai`: jalan, tempa-round, bug, review, schedule
│   ├── driver/     # opencode headless + watchdog + budget
│   ├── gate/       # proteksi test (hash, skip/only), pembanding CI
│   ├── graph/      # parser ticket + frontier
│   └── github/     # label, komentar, PR, dispatch
├── workflows/      # template .github/workflows/pandai-*.yml + ci-gate
├── prompts/        # preamble tanpa-pengawasan untuk skill Matt
├── skills/pandai/  # skill kecil agar agent chat paham board
├── dashboard/      # Cloudflare: Hono API + React PWA + D1
├── bot/            # notifikasi Telegram/WA (di Worker)
└── vm/bootstrap.sh # setup runner + opencode web + tunnel
```

## 6. Multi-project (revisi)

Dengan banyak proyek, **otak dipindah dari GitHub Actions ke control plane di Cloudflare**. Alasannya:
- Event dari banyak repo masuk ke satu tempat, lewat webhook GitHub App.
- Scheduler perlu melihat semua proyek sekaligus untuk konkurensi, prioritas, dan budget global.
- Node menerima job langsung lewat koneksi WebSocket-nya, sehingga tidak perlu memasang workflow agent di setiap repo.

GitHub tetap menjadi sumber kebenaran kartu dan kode. Di repo proyek, Actions hanya menjalankan **CI gate** (di Depot).

```
GitHub App "Pandai" (dipasang di repo-repo proyek)
   │ webhook semua repo
   ▼
Control plane (Cloudflare: Worker + Durable Object + D1)
   • registry proyek + config      • scheduler global (fair, prioritas, budget)
   • antrean job + state           • registry node (online, kapasitas, kemampuan)
   │ dispatch lewat WebSocket node
   ▼
Node pool (VPS utama, VPS tambahan, Daytona cadangan)
   • cache clone per proyek: /var/pandai/projects/<owner>/<repo>
   • worktree per ticket; job berjalan di container per proyek (isolasi toolchain + secret)
```

### Konsep data
| Entitas | Disimpan di | Isi |
|---|---|---|
| Workspace | D1 | Kamu, budget global, konkurensi global |
| Project | `pandai.yml` di repo + cache D1 | Repo, gate, setup, model, budget, prioritas, kebutuhan node, config Doppler |
| Kartu / ticket | GitHub Issues | Sama seperti sebelumnya; satu board GitHub Project bisa memuat banyak repo |
| Job | D1 (Durable Object) | Antrean, status, node, percobaan, biaya |
| Node | D1 | Token (hash), kemampuan (`docker`, `node22`, …), slot, heartbeat |
| Biaya | D1 + komentar issue | Per ticket, per proyek, per bulan |

### Contoh `pandai.yml` di tiap repo
```yaml
project: wazapin-api
setup: pnpm install --frozen-lockfile
gate:                       # dijalankan CI gate (Depot) + dicek Pandai
  test: pnpm test
  typecheck: pnpm typecheck
  lint: pnpm lint
protected_tests: ["**/*.test.ts", "test/**"]
models: { coder: <model-kuat>, reviewer: <model-kuat>, chat: <model-cepat> }
budget: { ticket_usd: 3, month_usd: 100 }
concurrency: 2              # maksimal ticket paralel di proyek ini
priority: high              # high | normal | low
node: { requires: [docker, node22] }
secrets: { doppler_project: wazapin, doppler_config: pandai-agent }
```

### Scheduler global
1. Kumpulkan frontier dari semua proyek.
2. Saring berdasarkan budget bulanan proyek dan konkurensi per proyek.
3. Urutkan menurut prioritas proyek, lalu umur antrean (fair, supaya proyek kecil tidak kelaparan).
4. Pasangkan ke node yang punya slot dan memenuhi `node.requires`.
5. Kalau tidak ada node yang cocok, nyalakan node Daytona (API) atau biarkan antre.

### Isolasi antar-proyek di node yang sama
- Setiap job berjalan dalam container proyeknya. Isinya hanya secret proyek itu (dari Doppler config proyek) dan hanya clone repo itu.
- Token GitHub per job adalah installation token GitHub App yang dibatasi ke repo proyek itu dan berumur pendek.
- Sesi chat juga dibuka di container proyek kartu tersebut.

### Onboarding proyek baru
1. Pasang GitHub App Pandai di repo.
2. Di dashboard, klik "Tambah project". Pandai membuka PR berisi `pandai.yml`, workflow CI gate (Depot), dan label kolom.
3. Merge PR. Proyek muncul di dashboard dan siap menerima kartu.

### Dashboard multi-project
- **Workspace:** semua proyek dalam satu layar (kartu per kolom, biaya bulan ini vs budget, job berjalan) dan satu **inbox "✋ Butuh kamu" gabungan** lintas proyek.
- **Per proyek:** kanban, detail kartu, biaya, dan setelan (`pandai.yml`).
- **Chat:** ada level workspace ("proyek mana yang macet?") dan level kartu (sesi OpenCode di proyek itu).
- **Ticket lintas proyek** (misalnya API backend dan UI frontend): relasi "blocked by" boleh antar-repo. Scheduler membaca edge dari GitHub, atau dari D1 kalau GitHub tidak mendukungnya.
