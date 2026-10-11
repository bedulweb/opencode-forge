# Desain Pandai v3.1: tool internal di atas GitHub Actions, VM sendiri, Depot (khusus CI), dan Doppler

Tanggal: 2026-10-11. Riset dasar ada di `RISET.md`.

**Perubahan dari v2.** GitHub Actions menjadi otak. Akibatnya tidak ada daemon yang harus terus hidup, tidak ada database, dan tidak perlu backup.

**Revisi v3.1.**
- **Kredit Depot (paket $200/bulan) tetap dipakai untuk CI saja**, supaya tidak tersedot oleh agent.
- **Kerja agent pindah ke VM sendiri** (6 CPU / 16 GB, gratis), yang didaftarkan sebagai *self-hosted runner ephemeral*.

| Jenis job | Jalan di | Biaya |
|---|---|---|
| Otak: scheduler, sinkron label/board (hitungan detik) | GitHub-hosted `ubuntu-latest` | Kuota gratis Actions |
| Agent: Tempa, Bug, Jalan, Review (menit sampai jam) | **Self-hosted runner di VM** (label `pandai`, 2–3 instance) | $0. Status per 2026: GitHub *menunda*, tapi belum membatalkan, rencana biaya $0,002/menit untuk self-hosted di repo private |
| CI gate: test, typecheck, lint, proteksi test | **Depot** (pemakaian CI yang memang sudah ada) | Kredit Depot |
| Overflow atau fitur "ambil alih" | Daytona/E2B (kredit gratis sekitar $200), opsional | Kredit gratis |

**Kalau VM mati:**
1. Job agent yang sedang jalan gagal.
2. Scheduler men-dispatch ulang job itu.
3. Job menunggu di antrean sampai VM hidup lagi. Batas tunggu antrean self-hosted sekitar 24 jam (perlu dicek).
4. Kerja dilanjutkan dari branch terakhir yang sudah di-push.

Tidak ada yang hilang selain pekerjaan sejak checkpoint terakhir.

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

## Eksekusi: GitHub Actions sebagai otak, VM sebagai otot, Depot untuk CI

| Workflow | Pemicu | Isi |
|---|---|---|
| `pandai-tempa` | `issues` (label ide), `issue_comment` dari pemilik | Satu ronde grilling, atau `to-spec` + `to-tickets` saat kamu membalas `/siap` |
| `pandai-bug` | label `bug` | `diagnosing-bugs` fase 1 → branch berisi test repro merah |
| `pandai-scheduler` | cron, merge PR, perubahan label | Hitung frontier dari relasi blokir, batasi konkurensi (2–3), lalu dispatch `pandai-jalan` |
| `pandai-jalan` | `workflow_dispatch` per ticket | Agent (OpenCode/Claude) di self-hosted runner VM. Idempotent: kalau job mati, job dilanjutkan dari branch terakhir |
| **CI gate** (workflow terpisah) | PR | Test, typecheck, dan lint, ditambah cek proteksi test sebagai *required status check*. Job ini **terpisah dari job agent**, jadi agent tidak bisa memengaruhinya |
| `pandai-review` | CI hijau | Skill `code-review` Matt dalam konteks segar. Finding spec yang memblokir memberi label `pandai:fix`, dan card kembali ke Jalan (maksimal 2 ronde) |
| Merge queue (bawaan GitHub) | Approve | Gate dijalankan ulang di atas hasil merge, sesuai rekomendasi riset |

- **Runner untuk agent:** self-hosted di VM (`runs-on: [self-hosted, pandai]`), mode `--ephemeral`, sehingga setiap job mendapat runner bersih. Jumlah slot paralel diatur lewat jumlah instance runner (2–3 untuk 16 GB).
- **Runner Depot hanya untuk workflow CI gate** (`runs-on: depot-ubuntu-24.04-*`). Gate memang CI, jadi pemakaiannya wajar dan singkat.
- **Timeout:** set `timeout-minutes` per job (misalnya 90). Ticket memang sebaiknya kecil (≤1–3 jam kerja manusia). Batas job self-hosted di GitHub adalah 5 hari, jadi tidak jadi masalah.
- **Depot Cache dan build Docker Depot** mempercepat gate untuk build dan test.

### Depot remote agent sandboxes (`depot claude`): opsional

- Isinya: filesystem dan sesi Claude yang persisten, bisa di-resume dari web, $0,01/menit, 2 vCPU / 4 GB.
- Batasannya: **hanya Claude Code**, belum ada API/SDK (yang ada CLI dengan `--wait`, `--output json`, `-p`), dan ukurannya kecil.
- Kegunaannya: sebagai **"ambil alih"**. Kalau card masuk "Butuh kamu" dan kamu ingin langsung mengobrol dengan sesi itu dari browser, sandbox ini cocok. Tidak dijadikan jalur utama supaya harness tetap bebas (OpenCode).

### Daytona / E2B (kredit gratis sekitar $200): bukan jalur utama, tapi lapisan sandbox dibuat bisa diganti

- **Alasan utamanya bukan harga.** Dengan tarif sekitar $0,08/jam untuk sandbox kecil, $200 masih setara ratusan jam. Alasannya **jumlah komponen yang bergerak**. Daytona dan E2B hanya *kotak* tempat menjalankan perintah. Pandai tetap butuh *otak* (pemicu dari issue, scheduler, log, secret, status check) yang hidup di tempat lain. GitHub Actions (dengan runner di VM sendiri) memberi otak dan otot sekaligus, dan sudah terintegrasi langsung dengan board, required checks, dan merge queue.
- **Kalau Daytona/E2B dipakai sebagai otot,** alurnya jadi: job Actions membuat sandbox → menjalankan agent di dalamnya → memantau → membersihkan. Konsekuensinya:
  - ada satu hop tambahan,
  - runner menunggu idle sementara sandbox bekerja (dua tagihan berjalan bersamaan); alternatifnya pola fire-and-forget yang dipantau cron (lebih rumit),
  - secret harus disalurkan ke vendor ketiga,
  - sinkronisasi git dua arah,
  - satu akun lagi yang harus dikelola.
- **Daytona/E2B lebih unggul untuk:**
  - sandbox persisten yang bisa di-pause dan di-resume dengan filesystem tetap utuh, misalnya sesi Tempa live atau "ambil alih" yang dibuka lagi besok;
  - paralelisme yang melonjak;
  - kode yang tidak tepercaya.
- **Keputusannya:**
  - antarmuka sandbox di Pandai dibuat bisa diganti (Sandcastle sudah punya provider Daytona);
  - kredit $200 dipakai untuk eksperimen fitur "ambil alih";
  - pindah ke Daytona/E2B sebagai jalur utama hanya kalau runner Actions terbukti kurang.

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

## VM 6 CPU / 16 GB sebagai runner yang bisa dibuang

- **Skrip bootstrap idempotent** (cloud-init atau systemd), dijalankan setiap kali VM hidup:
  1. Pasang toolchain proyek, `opencode`/`claude`, Doppler CLI, dan `pandai`.
  2. Ambil secret dari Doppler (`pandai-agent`), termasuk kredensial untuk mendaftarkan runner (GitHub App atau PAT fine-grained).
  3. Daftarkan 2–3 runner `--ephemeral` dengan label `pandai`, lalu jalankan dalam loop: daftar → ambil satu job → bersih → daftar lagi.
- **VM ini tidak menyimpan apa pun yang berharga.** State ada di GitHub dan kerja ada di branch yang sudah di-push. VM yang mati hanya menunda antrean.
- **VM yang sama juga bisa jadi dev box** untuk OpenCode manual, asal tidak bentrok dengan slot runner (misalnya cukup 2 runner kalau sedang dipakai interaktif).

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

1. **Bug → Jalan → PR draft + CI gate.** Workflow `pandai-bug` dan `pandai-jalan` di self-hosted runner VM, CI gate di Depot, secret dari Doppler, ditambah checkpoint push dan resume serta bootstrap VM.
2. **Tempa asinkron**: grilling di komentar, lalu `to-spec` dan `to-tickets` menjadi sub-issue.
3. **Scheduler multi-ticket**, review dua sumbu, dan merge queue.
4. **Sinkronisasi board Project**, ringkasan biaya per card, dan retro.

## Yang perlu dikonfirmasi

1. Harness utama dan modelnya: OpenCode (provider apa?) atau Claude Code (API key, atau token langganan Max?).
2. Akses ke VM untuk memasang bootstrap runner, serta OS/distro VM-nya.
3. Repo private `bedulweb/pandai`, plus satu repo proyek nyata sebagai uji coba pertama.

## Sumber (Depot/Daytona/GitHub, diakses 2026-10-11)

- Depot remote agents: https://depot.dev/docs/agents/overview, https://depot.dev/docs/cli/reference/agents, https://depot.dev/blog/now-available-remote-agent-sandboxes
- Depot GitHub Actions runners: https://depot.dev/docs/github-actions/overview, https://depot.dev/docs/github-actions/runner-types
- Depot changelog: https://depot.dev/changelog
- Daytona: https://www.daytona.io/docs/en/sandboxes/, https://www.daytona.io/docs/en/persistence/
- GitHub menunda biaya self-hosted runner: https://www.theregister.com/2025/12/17/github_charge_dev_own_hardware/
