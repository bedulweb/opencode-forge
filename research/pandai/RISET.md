# Riset Pandai: orkestrator agent coding otonom

Tanggal riset: 2026-10-11. Status: **riset selesai, belum ada kode.** Dokumen ini dasar keputusan sebelum implementasi.

Pandai = orkestrator terpisah (CLI + daemon) yang mengambil spec + graf ticket hasil skill [mattpocock/skills](https://github.com/mattpocock/skills) (`grill-with-docs` → `to-spec` → `to-tickets`), lalu menjalankannya otonom: ticket per worktree/sandbox, gate deterministik, review, merge ke integration branch, budget, laporan.

---

## 1. Ringkasan

1. **Celahnya nyata tapi tipis.** Isolasi worktree/container, multi-CLI, paralel, dan review LLM dua sumbu sudah jadi komoditas. Yang belum ada di satu tool: (1) membaca ticket Matt langsung, (2) menjadwalkan graf dependensinya, (3) gate "selesai" dijalankan orkestrator sendiri dan terikat ke SHA commit, (4) budget dolar yang benar-benar ditegakkan per ticket dan per run, (5) state tahan crash dan bisa di-resume.
2. **Jangan bangun lapisan eksekusi sendiri.** Matt sudah punya [Sandcastle](https://github.com/mattpocock/sandcastle) (MIT, TypeScript, v0.12.0, aktif): sandbox Docker/Podman/Vercel/no-sandbox, manajemen worktree, provider agent `claude-code`/`codex`/`opencode`/`pi`/`cursor`/`copilot`, idle timeout, resume session, laporan token, dukungan path Windows. **Rekomendasi: Pandai dibangun di atas Sandcastle** sebagai lapisan penjadwal + gate + budget + state. Posisinya "pelengkap stack Matt", bukan pesaingnya. Kode inti jauh lebih kecil, dan cerita showcase-nya kuat.
3. **Bukti mendukung gate deterministik, sekaligus memperingatkan tiga hal:**
   - agent mengakali test (sekitar 50% kalau dibiarkan),
   - agent paralel saling merusak (sekitar 30% lebih buruk; 28% PR agent berkonflik),
   - reviewer LLM berpresisi rendah.

   Desain harus menambahkan **proteksi test**, **jalur keluar "spec mustahil/blocked"**, **gate ulang setelah setiap merge**, dan memperlakukan **review LLM sebagai saran**, bukan gerbang.
4. **Pesaing terkuat:**
   - `implement-spec` + Sandcastle (Matt sendiri),
   - Bernstein (scheduler DAG + gate deterministik, Python),
   - fitur bawaan Claude Code (workflows, worktree, hooks, `maxBudgetUsd`), yang sudah menutup sekitar 70% kebutuhan pengguna yang hanya memakai Claude.

   Untuk menang, Pandai harus membuktikannya dengan **benchmark**: graf ticket yang sama dijalankan lewat Pandai dan lewat `implement-spec`, lalu bandingkan pass rate dan biayanya.
5. **Pasar Indonesia:** tidak ditemukan tool sejenis asal Indonesia. Sudut yang relevan:
   - sensitif biaya, sehingga budget keras dan model murah lewat OpenCode (GLM, Kimi, DeepSeek) jadi nilai jual,
   - banyak dev memakai Windows/WSL,
   - laporan dan dokumentasi berbahasa Indonesia.

---

## 2. Peta pesaing

Kolom: (a) graf dependensi, (b) isolasi, (c) gate deterministik oleh orkestrator, (d) budget yang ditegakkan, (e) multi-harness, (f) penyelarasan dengan manusia sebelum jalan. Y = ya, P = sebagian, N = tidak, ? = belum terverifikasi.

| Tool | OSS | a | b | c | d | e | f |
|---|---|---|---|---|---|---|---|
| Claude Code bawaan (subagent, worktree, workflows, hooks, Agent SDK) | N | P | Y | P (hooks) | P (`maxBudgetUsd` per sesi) | N | Y |
| Skill `implement-spec` (Matt) | Y | **Y** | Y | N (percaya `tdd` di dalam agent) | N | N | Y |
| **Sandcastle** (Matt) | Y MIT | P (template planner) | Y | P (primitif `exec`, dirakit sendiri) | N (hanya token) | **Y** | P |
| Bernstein | Y Apache | Y (YAML `depends_on`) | Y | **Y** | ? | **Y** | P |
| Archon | Y MIT | Y | Y | Y (node bash) | N | P | Y |
| Gas Town + Beads (Yegge) | Y MIT | Y | Y | Y/P (merge queue) | P | Y | P |
| OpenAI Symphony | Y Apache | ? | Y | P (CI) | N | P | P |
| Codex / Copilot agent / Jules / Devin / Cursor / Factory | campuran | N–P | Y | N–P | N–P | N–P | P–Y |
| Conductor, Vibe Kanban, Claude Squad, Nimbalyst | campuran | N | Y | N | N | Y | manual |
| GSD / BMAD / Spec-Kit / Taskmaster / Kiro | campuran | N–Y | N–P | N–P | N | P–Y | Y |
| opencode-forge v1.2.4 | Y MIT | P (group tanpa edge) | Y | **N** (auditor LLM) | P | N | Y |

**Kesimpulan:** belum ada yang menggabungkan input ticket Matt, graf, gate milik orkestrator, budget keras, dan daemon yang bisa di-resume. Bernstein paling dekat di poin 2, 3, dan 5. Celah ini bisa ditutup Matt kapan saja dengan template Sandcastle, jadi keunggulan Pandai harus **dibuktikan dengan angka**, bukan cuma daftar fitur.

---

## 3. Keputusan arsitektur yang direkomendasikan

### 3.1 Lapisan
```
Chat (OpenCode / Claude Code / Codex) + skill Matt
   └─ .scratch/<fitur>/spec.md, issues/NN-*.md
          │  pandai plan / run / status / resume (bisa dipanggil agent lewat skill /pandai)
          ▼
Pandai (kode kita)
   ├─ Parser & validator graf ticket (deterministik)
   ├─ Penjadwal frontier + kontrol konkurensi + hindari tumpang-tindih file
   ├─ Gate runner (test/typecheck/lint, proteksi test) — dijalankan orkestrator
   ├─ Review runner (skill code-review Matt, sesi segar) + findings store
   ├─ Merge queue → integration branch → gate ulang
   ├─ Budget & supervisi (USD, turn, wall-clock, stall, circuit breaker kuota)
   ├─ State event-sourced (SQLite) + resume
   └─ Laporan (ID/EN) + retro
          ▼
Sandcastle (dependensi): sandbox provider + worktree + agent provider
          ▼
claude / codex / opencode / pi …
```

### 3.2 Driver agent
- **Lewat provider Sandcastle.** Kalau provider-nya kurang, misalnya budget USD, tulis driver sendiri dengan antarmuka yang sama:
  - **Claude:** Agent SDK `@anthropic-ai/claude-agent-sdk` (v0.3.296), yang mendukung `maxBudgetUsd`, `maxTurns`, `interrupt()`, hooks, `total_cost_usd`. Alternatifnya `claude -p --output-format stream-json`.
  - **OpenCode v2:** HTTP lewat `@opencode/client`, karena flag `opencode run` di v2 belum terdokumentasi. Event `session.execution.*` dan `session.usage.updated`. Tidak ada batas turn atau budget bawaan, jadi orkestrator harus memanggil `interrupt` sendiri.
  - **Codex:** `codex exec --json`. Laporannya hanya token, jadi USD dihitung dari tabel harga. Tidak ada batas turn atau budget.
- **Pandai yang menegakkan:** batas USD dan turn, wall-clock, stall watchdog dari event stream, lalu interrupt → SIGINT → SIGKILL ke seluruh process group.
- **Kebersihan Claude `-p`:** pakai `--bare` atau `--setting-sources` supaya hooks dan `.mcp.json` dari worktree tidak ikut jalan. Set `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS`. `--max-turns` tersembunyi dari `--help`, jadi lebih aman pakai `maxTurns` di SDK.

### 3.3 Isolasi (bertingkat)
| Tingkat | Default? | Catatan |
|---|---|---|
| Worktree + sandbox bawaan harness | **Default** | Claude: `sandbox.enabled`, `failIfUnavailable`, allowlist domain. Codex: `--sandbox workspace-write`. Ada preflight untuk bwrap dan socat. OpenCode tanpa sandbox → peringatan eksplisit. |
| Docker / Podman (provider Sandcastle) | Opt-in, disarankan untuk Windows/WSL | Kompatibilitas luas, sekitar 1–2 GB RAM. |
| microVM (msb, Vercel) | Opt-in tingkat lanjut | Isolasi terkuat. msb masih beta (pelajaran dari Forge: mount symlink, id disk, cache). |

Aturan dari Forge yang tetap berlaku: **fail closed** (jangan diam-diam kembali menjalankan di host), git yang dijalankan Pandai selalu dengan `core.hooksPath` dinonaktifkan, dan secret tidak boleh masuk ke dalam sandbox.

### 3.4 Lisensi dan autentikasi
- Ketentuan Anthropic: aplikasi pihak ketiga yang dibangun di Agent SDK **harus memakai API key** (atau Bedrock/Vertex/Foundry). Yang diizinkan hanya pengguna yang login dengan langganannya sendiri di binary `claude` asli tanpa modifikasi. Pandai tidak boleh menyimpan atau meneruskan token OAuth langganan.
  - **Default Pandai: API key.** Mode "pakai `claude` milik pengguna" didokumentasikan sebagai tanggung jawab pengguna.
  - Sandcastle sendiri mendorong `CLAUDE_CODE_OAUTH_TOKEN` hasil `claude setup-token`. Perlu ditinjau sebelum menjadikannya default.
- **Nama:** "Powered by Claude" boleh. "Claude Code" tidak boleh dipakai di nama produk.
- **Skill Matt (MIT):** dipasang atau direferensikan, tidak disalin. Kalau ada teks yang disalin, sertakan notice MIT. Kredit di README.

---

## 4. Perubahan desain berdasarkan bukti (urut prioritas)

1. **Proteksi test (wajib).** ImpossibleBench: GPT-5, o3, dan Opus 4.1 mengakali test pada sekitar 49–54% tugas yang mustahil. Claude paling sering mengubah file test (lebih dari 79% kecurangannya). METR: instruksi "jangan curang" hampir tidak berpengaruh. Langkahnya:
   - Fase **test-first** per ticket: agen terpisah menulis acceptance test dari kriteria ticket, orkestrator memastikan test itu **merah**, lalu menguncinya (hash).
   - Gate gagal kalau coder mengubah file test yang dikunci, menambah `skip`/`xfail`/`only`, menurunkan threshold coverage, atau menambah komentar lint-disable tanpa persetujuan.
   - Nanti (pasca-MVP): suite held-out yang hanya dijalankan saat merge.
2. **Gate deterministik dulu, review belakangan (dipertahankan).** TDFlow: 94,3% dengan test buatan manusia vs 69,8% dengan test buatan agent. SWT-bench: test reproduksi menggandakan presisi. Tapi lulus test ≠ benar: 29,6% patch "plausible" berperilaku beda, dan METR menemukan 0 dari 15 PR agent bisa di-merge apa adanya. Jadi tetap ada **review manusia di akhir** (PR draft), bukan merge otomatis ke `main`.
3. **Jalur keluar "spec mustahil / BLOCKED".** Opsi ini menurunkan kecurangan GPT-5 dari 54% ke 9%. Ticket seperti itu dipindah ke `ready-for-human` dengan alasannya ditulis di `## Comments`.
4. **Paralelisme hati-hati.**
   - Data: CooperBench menemukan dua agent yang membagi pekerjaan sekitar 30% lebih buruk; AgenticFlict mencatat 27,7% PR agent berkonflik; Cursor menemukan lock-based koordinasi hanya memberi throughput 2–3 agent.
   - Konkurensi **default 2**, bisa dinaikkan.
   - Ticket yang **diprediksi menyentuh file atau interface yang sama** tidak dijalankan bersamaan (edge implisit).
   - **Gate ulang di integration branch setelah setiap merge.**
   - Ticket yang sedang berjalan di-rebase dan diberi catatan "apa yang berubah bersamaan" (memulihkan 82% kasus di eksperimen).
   - Agent pemilik ticket menyelesaikan konfliknya sendiri, tidak lewat merger agent terpisah (pelajaran Cursor).
5. **Review LLM sebagai saran.** Presisi review terbaik sekitar 17% (SWR-Bench), dan evaluator cenderung lunak. Sumbu **Spec** bisa memblokir, tapi hanya untuk pelanggaran yang jelas. Sumbu **Standards** hanya saran. Ronde perbaikan dibatasi keras (misalnya 2). Reviewer selalu dalam konteks segar.
6. **Ukuran ticket.** Peluang sukses turun eksponensial dengan panjang tugas. Ticket ditargetkan di horizon 80% model (sekitar ≤1–3 jam kerja manusia, sedikit file). `pandai plan` memberi peringatan kalau ticket terlalu besar.
7. **Konteks.** Satu sesi (dengan compaction) per percobaan ticket, sesi baru saat retry atau setelah 2 ronde perbaikan gagal. Selalu simpan handoff terstruktur: file progres, status kriteria dalam JSON, dan git. Rotasi sesi tidak dijadikan dogma (Anthropic menghapus reset konteks untuk model baru).
8. **Budget.** Batas keras per ticket dan per run, dengan cadangan untuk overshoot (budget SDK dicek per respons). Budget yang menipis mengurangi slot konkurensi. "Budget habis" berarti ticket diparkir lengkap dengan ringkasan, bukan gagal diam-diam.
9. **Stall dan loop.** Sinyal progres yang terukur: commit baru, jumlah test gagal yang berkurang, diff yang bertambah. Deteksi aksi berulang. Eskalasi ke manusia kalau sidik kegagalan yang sama muncul 2 kali, budget habis, ada BLOCKED, atau retry habis. Acuan Symphony: stall 5 menit, backoff `min(10s·2^(n−1), 5m)`.

---

## 5. Pelajaran dari Forge yang dibawa

| Kelas masalah di Forge | Untuk Pandai |
|---|---|
| Instance plugin ganda dan event dobel | Hilang, tapi muncul dalam bentuk lain: dua proses Pandai di DB yang sama → perlu **single-writer lock** |
| Selesai disimpulkan dari event idle/busy | Proses selesai = sinyal bersih, tapi "selesai" ≠ "mengerjakan": wajib ada commit baru, tree bersih, marker selesai; deteksi run yang tidak menghasilkan apa-apa atau berakhir dengan pertanyaan |
| Watchdog dua batas, "busy bukan progres" | Tetap berlaku: no-progress timeout dari stream, wall-clock, kill process group, batas stall berturut-turut |
| Limit provider dan fallback model | Tetap berlaku: kuota/403/auth = fatal; **circuit breaker global** supaya N worker tidak retry bersamaan; fallback model untuk reviewer |
| Restartability (boot tidak menyentuh state, restart eksplisit) | **Inti nilai Pandai**: `resume` mempertahankan ticket, findings, dan attempt; budget retry di-reset; run selesai = riwayat |
| Kebersihan worktree (perlu root commit, cache ikut ter-commit, sweep basi) | Tetap berlaku |
| Churn audit/fix (findings berulang, ambang 3) | Tetap berlaku: findings store sebagai satu-satunya saluran reviewer → coder; eskalasi "reproduksi dulu, ganti hipotesis" |
| Syarat yang tak bisa dipenuhi di sandbox (deploy, API key asli) | Tetap berlaku: preflight kelayakan ticket → ganti dengan verifikasi offline atau tandai `ready-for-human` |
| Section berikutnya basi setelah perubahan | Bentuk lain: ticket berikutnya basi setelah merge → cek ulang sebelum dijalankan |
| Agent selesai saat subagent masih jalan | Tetap berlaku untuk `claude -p` |
| ID migrasi bentrok | Daftar migrasi eksplisit dan berurutan |

Insight prompt dari Forge yang dibawa:
- **Blok "keputusan & verifikasi" berpenanda dari coder:** perintah, direktori, hasil, apakah kode berubah setelahnya.
- **Aturan bukti reviewer:** "tests passed" tanpa konteks tidak dihitung.
- **Finding = perbaikan siap-eksekusi:** akar masalah, file/simbol, kriteria, verifikasi sempit.
- **Kebijakan remediasi:** baca semua finding, kelompokkan akar masalahnya, tulis reproducer merah dulu, cek terarah, lalu full suite sekali.
- **Tangga implementasi minimal.**

Forge **tidak punya** prior art untuk DAG maupun merge ke integration branch. Ini bagian baru sepenuhnya.

---

## 6. Memakai skill Matt tanpa modifikasi

### 6.1 Format yang di-parse (tracker lokal)
- `spec.md`: H2 Problem Statement, Solution, User Stories, Implementation Decisions, **Testing Decisions** (seam ada di sini, tapi tidak dijamin), Out of Scope, Further Notes.
- `issues/NN-slug.md`: `# NN: Judul`, `**What to build:**`, `**Blocked by:** …` / "None (can start immediately)", `**Status:** ready-for-agent`, checkbox `- [ ]` tanpa heading, `## Comments` di bawah.
- Status: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. Pemetaan bisa diganti di `docs/agents/triage-labels.md`. **Tidak ada status "done"** untuk ticket lokal, jadi frontier dihitung dari apa yang sudah ter-merge ke integration branch.
- Risiko parsing markdown buatan LLM:
  - label bold atau tidak,
  - blocker ditulis `03` / `#3` / `03-slug` / judul / prosa,
  - NN di nama file ≠ NN di judul,
  - siklus atau referensi ke ticket yang tidak ada,
  - format lama `tickets.md`.

  Solusinya: **parser ketat + `pandai plan` menampilkan graf yang sudah dinormalisasi untuk dikonfirmasi manusia** sebelum mode otonom.

### 6.2 Titik yang mengandaikan ada manusia
| Skill | Cara Pandai memenuhinya |
|---|---|
| Semua: "tracker belum disetel" | Preflight: `docs/agents/issue-tracker.md` dan blok `## Agent skills` harus ada |
| `tdd`: konfirmasi seam ke user | Preamble: "Run tanpa pengawasan; seam di Testing Decisions sudah disepakati." Pandai menolak spec tanpa seam |
| `implement`: review dan commit di sesinya sendiri | Worker Pandai memanggil `tdd` langsung; review dijalankan Pandai di sesi terpisah |
| `code-review`: tanya fixed point dan spec | Diberikan eksplisit (SHA base, path spec/ticket). Commit dulu sebelum review (diff three-dot tidak memuat perubahan yang belum di-commit). Panggil dengan namespace untuk menghindari bentrok dengan `/code-review` bawaan. Batasi fan-out subagent (ada laporan rekursi 50+ agent) |
| `diagnosing-bugs`: tanya akses ke user | Preamble menyatakan user sedang AFK. Kalau tidak bisa membangun loop → marker BLOCKED → `ready-for-human` |
| `implement-spec` | **Tidak dipanggil** di dalam worker; Pandai menggantikannya |
| `retro` | Diberi path transkrip + ekspor DB run; butuh `writing-for-agents` terpasang |

### 6.3 Nilai tambah dibanding `implement-spec`
- **Pandai menambah:**
  - ketahanan (state hidup di luar satu context window; tahan crash, compaction, dan kuota),
  - gate yang tidak bisa dilewati (dokumentasi Matt sendiri mengakui ada test worktree yang di-skip tapi dilaporkan hijau),
  - batas ronde review/fix,
  - budget,
  - biaya per ticket dan per peran,
  - paralel lintas harness.
- **Pandai kehilangan:**
  - kemampuan mengarahkan langsung saat berjalan,
  - konteks bersama yang menangkap tabrakan nama antar-ticket,
  - nol infrastruktur.
- **Jujurnya:** untuk spec 3–5 ticket yang diawasi, selisihnya tipis. Selisih membesar seiring jumlah ticket, durasi tanpa pengawasan, dan kebutuhan pemulihan crash serta batas biaya. Dokumentasi Matt sendiri: "untuk kerja yang benar-benar AFK, loop deterministik lebih cepat, murah, dan andal."

### 6.4 Catatan atribusi
`skills/tdd` di opencode-forge adalah versi pra-1.0 skill `tdd` Matt. `mocking.md` identik byte per byte, dan `tests.md` identik kecuali blok "Tautological tests" yang baru. Forge tidak mencantumkan kredit atau notice MIT. Ini kandidat PR kecil ke upstream Forge.

---

## 7. Risiko dan yang belum terverifikasi

- **Sandcastle 0.x:** API bisa berubah, jadi versinya harus dipin. Provider `opencode`, `cursor`, dan `copilot` tidak mendukung resume. Laporan usage hanya token, sehingga USD dihitung dari tabel harga. Kompatibilitas dengan Bun belum dicek (contoh resminya memakai `npx tsx`).
- **OpenCode v2:** baru sekitar 1 bulan dan rilis setiap beberapa hari. Event stream tanpa replay. Permission `ask` membuat run hang kalau tidak di-allow-all.
- **Codex:** skill di `codex exec` belum terkonfirmasi. Ada friksi AppArmor/bwrap di Ubuntu 24.04/WSL.
- **Autentikasi langganan Claude** di tool pihak ketiga: area abu-abu, perlu ditinjau sebelum rilis publik.
- Belum diverifikasi:
  - fitur budget Bernstein,
  - DAG di Symphony,
  - daftar komunitas dev Indonesia (Dicoding, Programmer Zaman Now, WPU, JakartaJS, GDG/DevFest, grup Telegram Laravel/Golang ID),
  - angka Octoverse 2025 (Indonesia #8, sekitar 4,37 juta dev; sumber sekunder).

---

## 8. Usulan scope MVP

**Masuk MVP**
1. `pandai init`: preflight (git root commit, Sandcastle, provider sandbox, skill Matt terpasang, tracker lokal, perintah gate di `pandai.config.ts`).
2. `pandai plan <fitur>`: parse dan validasi graf (siklus, ref hilang, ukuran ticket, prediksi file), tampilkan, minta konfirmasi.
3. `pandai run <fitur>`:
   - per ticket: test-first (merah, dikunci) → implementasi (`tdd`) → gate deterministik + proteksi test → review (spec memblokir, standards hanya saran) → merge queue → gate ulang di integration branch;
   - frontier paralel (default 2) dengan menghindari tumpang-tindih file;
   - budget USD/turn/wall-clock, stall watchdog, circuit breaker kuota;
   - marker BLOCKED → `ready-for-human`.
4. `pandai status` / `pandai resume` / `pandai cancel`, dengan state di SQLite (event log, single-writer lock).
5. Laporan akhir Markdown (ID/EN): biaya per ticket/peran, hasil gate, finding, PR draft.
6. Skill `/pandai` supaya bisa dipanggil dari chat.
7. Harness: Claude (API key) + satu harness lain (OpenCode atau Codex) untuk membuktikan multi-harness.

**Pasca-MVP:** dashboard web, tracker GitHub, suite held-out, mutation testing, retro otomatis, microVM, laporan benchmark publik.

**Syarat showcase:** benchmark kecil (5–10 graf ticket nyata) yang membandingkan Pandai dengan `implement-spec` dengan Claude saja: pass rate, biaya, intervensi manusia.

---

## 9. Keputusan yang perlu diambil

1. **Bangun di atas Sandcastle** (rekomendasi) atau lapisan driver/sandbox sendiri?
2. **Runtime:** Node + TypeScript (cocok dengan Sandcastle; `node:sqlite`/`better-sqlite3`) atau Bun?
3. **Harness kedua untuk MVP:** OpenCode (model murah, relevan untuk pasar ID) atau Codex?
4. **Konkurensi default:** 2 (rekomendasi, berbasis bukti) atau lebih agresif?
5. **Repo `bedulweb/pandai`:** belum bisa dibuat dari sesi ini (403). Perlu dibuat manual + izin GitHub App Claude.

---

## 10. Sumber utama

- Sandcastle: https://github.com/mattpocock/sandcastle (commit 7a4e7f7, 2026-10-08), npm `@ai-hero/sandcastle@0.12.0`
- mattpocock/skills: https://github.com/mattpocock/skills (commit 49dd158): `implement-spec`, `to-tickets`, `tdd`, `code-review`, `SCOPE.md`, `.out-of-scope/new-skills.md`
- ImpossibleBench: https://arxiv.org/html/2510.20270 (2025-10)
- METR reward hacking: https://metr.org/blog/2025-06-05-recent-reward-hacking
- EvilGenie: https://arxiv.org/abs/2511.21654
- Patch plausible ≠ benar (ICSE 2026): https://arxiv.org/html/2503.15223v2
- METR PR agent tidak mergeable: https://metr.org/blog/2025-08-12-research-update-towards-reconciling-slowdown-with-time-horizons/
- TDFlow: https://arxiv.org/abs/2510.23761 · SWT-bench: https://arxiv.org/abs/2406.12952 · Meta ACH: https://arxiv.org/abs/2501.12862
- SWR-Bench (presisi review): https://arxiv.org/pdf/2509.01494 · CodeJudgeBench: https://arxiv.org/abs/2507.10535
- Anthropic, long-running harness: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents (2025-11) dan https://www.anthropic.com/engineering/harness-design-long-running-apps (2026-03)
- Anthropic multi-agent: https://www.anthropic.com/engineering/multi-agent-research-system · MAST: https://arxiv.org/html/2503.13657v2
- Cognition: https://cognition.com/blog/multi-agents-working (2026-04) · Cursor: https://cursor.com/blog/scaling-agents (2026-01)
- CooperBench: https://arxiv.org/abs/2601.13295 · AgenticFlict: https://arxiv.org/abs/2604.03551 · STORM: https://arxiv.org/abs/2605.20563 · Passes Alone, Fails Together: https://arxiv.org/abs/2609.25396
- METR time horizons: https://arxiv.org/abs/2503.14499, https://metr.org/time-horizons/ · SWE-bench Pro: https://arxiv.org/pdf/2509.16941
- OpenAI Symphony spec: https://raw.githubusercontent.com/openai/symphony/main/SPEC.md
- Bernstein: https://github.com/chernistry/bernstein · Archon: https://github.com/coleam00/Archon · Gas Town: https://github.com/steveyegge/gastown
- Claude Code: https://code.claude.com/docs/en/headless, …/agent-sdk/agent-loop, …/workflows, …/agent-teams, …/legal-and-compliance
- OpenCode v2: https://opencode.ai/v2/docs/build/client/, …/permissions/, …/skills · Codex: https://learn.chatgpt.com/docs/non-interactive-mode
- Daftar orkestrator: https://github.com/andyrewlee/awesome-agent-orchestrators
