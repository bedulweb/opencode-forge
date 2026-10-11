# Desain Pandai v3: tool internal di atas GitHub, Depot, dan Doppler

Tanggal: 2026-10-11. Riset dasar ada di `RISET.md`.

**Perubahan dari v2.** Sumber daya yang tersedia adalah kredit Depot $5000 dan Doppler (2–3 tahun). Dengan itu, eksekusi dipindah dari VM yang tidak persisten ke **GitHub Actions di runner Depot**. Akibatnya tidak ada daemon yang harus terus hidup, tidak ada database, dan tidak perlu backup. VM tidak lagi dibutuhkan untuk eksekusi.

## Masalah yang diselesaikan

1. **Mode manual melelahkan.** Setiap langkah agent harus ditanya satu per satu, seperti mengasuh bayi.
2. **Autopilot penuh meleset.** Hasilnya tidak sesuai maksud.
3. **Pekerjaan tidak terlacak.** Ide kasar, bug, dan perubahan tidak jelas jejaknya (apa, kapan, kenapa).
4. **VM tidak persisten.** VM mati setiap 2–3 hari dan pekerjaan bisa hilang.

## Prinsip: otonomi dengan pos pemeriksaan

Kamu hanya terlibat di dua pos tetap, ditambah antrean interupsi yang dijawab asinkron:

- **Pos 1: menyetujui definisi selesai.** Yang disetujui adalah spec, ticket, dan acceptance criteria.
- **Pos 2: meninjau PR.**
- **Antrean "Butuh kamu".** Card masuk ke sini kalau agent BLOCKED, spec ternyata mustahil, budget habis, atau gagal berulang.

## Board (GitHub Issues + Projects)

```
💡 Ide ─┐
        ├─► 🔨 Tempa ─► ✅ Siap ─► 🔁 Jalan ─► 👀 Tinjau ─► 🎉 Selesai
🐞 Bug ─┘   (async)    [Pos 1]   (otonom)   [Pos 2]
                                   └─► ✋ Butuh kamu ─(dijawab)─► Jalan
```

| Kolom | Apa yang terjadi |
|---|---|
| 💡 Ide | Tulis satu kalimat dari HP, CLI, atau chat |
| 🐞 Bug | Agent menjalankan fase 1 `diagnosing-bugs`: membuat test repro yang merah, lalu push ke branch |
| 🔨 Tempa | Grilling asinkron lewat komentar issue: satu ronde pertanyaan, masing-masing dengan rekomendasi. Thread issue berfungsi sebagai memori, jadi setiap ronde adalah job stateless. Hasil akhirnya spec dan ticket (sub-issue dengan relasi blokir) |
| ✅ Siap | **Pos 1.** Card ini sudah disetujui |
| 🔁 Jalan | Per ticket: test-first dikunci → `tdd` → branch di-push setiap checkpoint → PR draft. Budget dan timeout berlaku |
| ✋ Butuh kamu | Pertanyaan diposting di issue. Balasanmu memicu kelanjutan |
| 👀 Tinjau | **Pos 2.** Gate CI hijau, ada review dua sumbu, ringkasan biaya, dan risiko |
| 🎉 Selesai | Merge lewat merge queue |

**Pelacakan.** Timeline issue/PR mencatat semuanya: perpindahan kolom, tanya-jawab, commit, hasil gate, biaya, dan review.

**State.** State disimpan di **label** (`pandai:tempa`, `pandai:jalan`, …), karena perubahan label bisa memicu workflow. Field Status di Project disinkronkan dari label. Kalau card digeser langsung di board, perubahan itu ditangkap oleh reconciler cron. Catatan: perlu diverifikasi, tapi setahu saya perubahan field Project v2 tidak bisa memicu GitHub Actions secara langsung.

## Eksekusi: GitHub Actions sebagai otak, Depot sebagai otot

| Workflow | Pemicu | Isi |
|---|---|---|
| `pandai-tempa` | `issues` (label ide), `issue_comment` dari pemilik | Satu ronde grilling, atau `to-spec` + `to-tickets` saat kamu membalas `/siap` |
| `pandai-bug` | label `bug` | `diagnosing-bugs` fase 1 → branch berisi test repro merah |
| `pandai-scheduler` | cron, merge PR, perubahan label | Hitung frontier dari relasi blokir, batasi konkurensi (2–3), lalu dispatch `pandai-jalan` |
| `pandai-jalan` | `workflow_dispatch` per ticket | Agent (OpenCode/Claude) di runner Depot. Idempotent: kalau job mati, job dilanjutkan dari branch terakhir |
| **CI gate** (workflow terpisah) | PR | Test, typecheck, dan lint, ditambah cek proteksi test sebagai *required status check*. Job ini **terpisah dari job agent**, jadi agent tidak bisa memengaruhinya |
| `pandai-review` | CI hijau | Skill `code-review` Matt dalam konteks segar. Finding spec yang memblokir memberi label `pandai:fix`, dan card kembali ke Jalan (maksimal 2 ronde) |
| Merge queue (bawaan GitHub) | Approve | Gate dijalankan ulang di atas hasil merge, sesuai rekomendasi riset |

- **Runner Depot:** `depot-ubuntu-24.04-4` atau `-8`. Tarifnya per detik, sekitar $0,006/menit per 2 vCPU, jadi job 45 menit dengan 4 vCPU kira-kira $0,54. Kredit $5000 cukup untuk ribuan jam. Biaya LLM tetap komponen terbesar.
- **Timeout:** set `timeout-minutes` per job (misalnya 90). Ticket memang sebaiknya kecil (≤1–3 jam kerja manusia). Batas maksimum job di runner Depot belum terverifikasi.
- **Depot Cache dan build Docker Depot** mempercepat gate untuk build dan test.

### Depot remote agent sandboxes (`depot claude`): opsional

- Isinya: filesystem dan sesi Claude yang persisten, bisa di-resume dari web, $0,01/menit, 2 vCPU / 4 GB.
- Batasannya: **hanya Claude Code**, belum ada API/SDK (yang ada CLI dengan `--wait`, `--output json`, `-p`), dan ukurannya kecil.
- Kegunaannya: sebagai **"ambil alih"**. Kalau card masuk "Butuh kamu" dan kamu ingin langsung mengobrol dengan sesi itu dari browser, sandbox ini cocok. Tidak dijadikan jalur utama supaya harness tetap bebas (OpenCode).

## Secret: Doppler

- Config Doppler khusus agent (`pandai-agent`) berisi **hanya**:
  - API key LLM (dengan batas pengeluaran),
  - token GitHub fine-grained,
  - env untuk test (bukan production).
- Disalurkan ke GitHub Actions lewat integrasi sync Doppler → GitHub secrets, atau service token + `doppler run`.
- Secret production tidak pernah masuk ke job agent.

## Keamanan

- Repo private. Workflow hanya merespons issue dan komentar dari pemilik (`author_association: OWNER`), sebagai perlindungan dari prompt injection.
- `permissions:` workflow dibatasi seminimal mungkin. `main` diproteksi, sehingga agent hanya bisa push ke branch `pandai/*`.
- Proteksi test (lihat RISET §4): file test yang dikunci, tidak boleh menambah skip/only, dan pengecekan ini dijalankan di job CI terpisah.

## VM 6 CPU / 16 GB

Tidak lagi dibutuhkan untuk Pandai. Pilihan pemakaiannya:
- **Dev box interaktif** (OpenCode manual) kalau kamu ingin turun tangan langsung.
- **Dimatikan saja**, karena Depot sudah menangani eksekusi.

Dengan desain ini, VM yang mati tidak menghilangkan apa pun. Semua state ada di GitHub dan semua kerja ada di branch yang sudah di-push.

## Apa itu "Pandai" secara kode

- **CLI kecil (TypeScript):**
  - `pandai tempa-round`, `pandai jalan <issue>`, `pandai schedule`, `pandai review`;
  - parser ticket dan graf;
  - driver agent (OpenCode/Claude headless, budget, watchdog);
  - git checkpoint;
  - penulis komentar dan status.
- **Template workflow** (`.github/workflows/pandai-*.yml`) yang dipasang ke tiap repo proyek lewat `pandai init`.
- **Prompt preamble** untuk menjalankan skill Matt tanpa pengawasan (lihat RISET §6.2).
- **Tanpa** daemon, database, server, maupun UI di awal.

## Urutan pembangunan

1. **Bug → Jalan → PR draft + CI gate.** Workflow `pandai-bug` dan `pandai-jalan` di runner Depot, secret dari Doppler, ditambah checkpoint push dan resume.
2. **Tempa asinkron**: grilling di komentar, lalu `to-spec` dan `to-tickets` menjadi sub-issue.
3. **Scheduler multi-ticket**, review dua sumbu, dan merge queue.
4. **Sinkronisasi board Project**, ringkasan biaya per card, dan retro.

## Yang perlu dikonfirmasi

1. Harness utama dan modelnya: OpenCode (provider apa?) atau Claude Code (API key, atau token langganan Max?).
2. Apakah kredit Depot berlaku untuk GitHub Actions runners (dan agent sandboxes)?
3. Repo private `bedulweb/pandai`, plus satu repo proyek nyata sebagai uji coba pertama.

## Sumber (Depot/Daytona, diakses 2026-10-11)

- Depot remote agents: https://depot.dev/docs/agents/overview, https://depot.dev/docs/cli/reference/agents, https://depot.dev/blog/now-available-remote-agent-sandboxes
- Depot GitHub Actions runners: https://depot.dev/docs/github-actions/overview, https://depot.dev/docs/github-actions/runner-types
- Depot changelog: https://depot.dev/changelog
- Daytona: https://www.daytona.io/docs/en/sandboxes/, https://www.daytona.io/docs/en/persistence/
