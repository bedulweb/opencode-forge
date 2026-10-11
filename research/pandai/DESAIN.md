# Desain Pandai v2: tool internal

Tanggal: 2026-10-11. Menggantikan arah "produk open source" di `RISET.md`. Riset di sana tetap berlaku sebagai dasar bukti.

## Masalah yang diselesaikan

1. **Manual itu melelahkan.** Setiap langkah agent harus ditanya dan ditunggui satu per satu, jadi rasanya seperti mengasuh bayi.
2. **Autopilot penuh meleset.** Hasilnya tidak sesuai maksud.
3. **Pekerjaan tidak tercatat.** Ide kasar, bug, dan perubahan tidak jelas statusnya: apa yang berubah, kapan, dan kenapa.
4. **VM tidak awet.** VM 6 CPU / 16 GB RAM mati setiap 2–3 hari, sehingga pekerjaan bisa hilang.

## Prinsip: otonomi berpos

Kamu hanya terlibat di **dua pos tetap**, ditambah **antrean interupsi** yang dijawab asinkron. Di antara pos, agent bekerja sendiri.

- **Pos 1: setujui definisi selesai.** Spec, ticket, dan acceptance criteria. Ini tuas penyelarasan terkuat dan murah ditinjau.
- **Pos 2: tinjau PR.** Riset METR menunjukkan PR agent hampir tidak pernah layak merge tanpa ditinjau.
- **Antrean "Butuh kamu".** Muncul hanya kalau agent BLOCKED, spec mustahil, budget habis, atau gagal berulang. Kamu dapat notifikasi dan menjawab kapan sempat.

## Board

```
💡 Ide ─┐
        ├─► 🔨 Tempa ─► ✅ Siap ─► 🔁 Jalan ─► 👀 Tinjau ─► 🎉 Selesai
🐞 Bug ─┘   (async)    [Pos 1]   (otonom)   [Pos 2]
                                   │
                                   └─► ✋ Butuh kamu ─(dijawab)─► kembali ke Jalan
```

| Kolom | Siapa | Apa yang terjadi |
|---|---|---|
| 💡 Ide | kamu | Tulis satu kalimat saja, dari HP (GitHub mobile), CLI `pandai ide "…"`, atau chat |
| 🐞 Bug | kamu | Tulis gejala. Agent otomatis menjalankan fase 1 `diagnosing-bugs`, yaitu membangun repro yang gagal (merah) |
| 🔨 Tempa | agent + kamu, asinkron | Agent membaca codebase, lalu memakai `grilling` lewat komentar issue: satu ronde pertanyaan, masing-masing dengan rekomendasi. Kamu cukup balas "ok semua kecuali #3: …". Hasilnya spec, ticket (sub-issue dengan relasi blokir), acceptance criteria, glosarium/ADR. Kalau mau sesi langsung, buka OpenCode di card itu |
| ✅ Siap | **Pos 1** | Memindahkan card ke kolom ini = setuju. Untuk bug, test repro merah adalah definisi selesainya, jadi cukup dicek sekilas |
| 🔁 Jalan | agent | Per ticket: test-first dikunci → `tdd` → gate (test/typecheck/lint dijalankan Pandai) + proteksi test → review → perbaikan maksimal 2 ronde. Ada budget. Branch WIP di-push di setiap checkpoint. Progres singkat ditulis di komentar |
| ✋ Butuh kamu | interupsi | Pertanyaan dan konteks diposting di issue, lalu notifikasi dikirim. Jawabanmu di komentar membuat card lanjut otomatis |
| 👀 Tinjau | **Pos 2** | PR draft dengan ringkasan, bukti gate, biaya, risiko, dan tingkat bahaya merge. Approve lalu merge, atau beri komentar yang menjadi finding dan card kembali ke Jalan |
| 🎉 Selesai | — | Merge selesai |

**Pelacakan.** Timeline issue berfungsi sebagai log otomatis: perpindahan kolom, tanya-jawab, commit, hasil gate, biaya, dan link PR. Field di Project: Fase, Biaya, Percobaan, PR. Jadi satu card menyimpan seluruh sejarah perubahannya.

## Kenapa GitHub Issues + Projects dijadikan board

- **Semua state ada di GitHub**, jadi VM boleh mati kapan saja.
- **Bisa dipakai dari HP**, dan notifikasinya gratis.
- **Skill Matt sudah mendukung tracker GitHub** secara bawaan (sub-issue dan relasi blokir).
- **Tidak perlu membangun UI** di awal. Kalau board GitHub nanti terasa kurang, tambahkan web board tipis yang membaca data yang sama.

Alternatifnya Linear, kalau memang sudah dipakai. UI-nya lebih enak, tapi PR dan kodenya tetap di GitHub, jadi ada dua integrasi.

## VM yang tidak persisten: VM diperlakukan sebagai barang sekali pakai

Tidak ada data berharga yang hanya tinggal di VM.

| Data | Tempat tinggal | Kalau VM mati |
|---|---|---|
| Ide, keputusan, tanya-jawab, status | GitHub Issues/Projects | Aman |
| Kode yang sedang dikerjakan | Branch `pandai/<issue>`, di-push setiap checkpoint (gate lulus atau tiap iterasi) | Hilang paling banyak beberapa menit kerja |
| State orkestrator | Dibangun ulang dari GitHub saat boot. SQLite hanya cache | Aman |
| Log dan transkrip | Ringkasan di komentar issue. Log lengkap opsional ke object storage | Log rinci boleh hilang |
| Toolchain dan auth | Skrip bootstrap idempotent (systemd). Secret disuntikkan saat boot, tidak disimpan di image | Dipasang ulang otomatis |

Saat VM baru hidup: bootstrap berjalan, repo di-clone ulang, lalu daemon mengambil card di kolom 🔁 Jalan dan melanjutkannya dari branch WIP terakhir.

Restic tidak wajib, karena tidak ada yang penting di disk. Restic hanya berguna kalau log lengkap atau cache build ingin disimpan.

## Kapasitas dan sandbox

- **Model jalan di server provider**, jadi VM hanya menanggung proses agent (sekitar 0,5–1 GB per agent) ditambah build dan test. 16 GB cukup untuk **2–3 agent paralel**, sama dengan angka yang disarankan riset (paralel lebih lebar justru menurunkan hasil).
- **VM itu sendiri adalah sandbox.** VM ini sekali pakai dan memang akan mati, jadi risiko agent merusak sistem terbatas.
- **Pengaman praktis:**
  - token GitHub fine-grained, terbatas ke repo terkait,
  - branch protection di `main`, sehingga agent tidak bisa push ke `main`,
  - API key dengan batas pengeluaran,
  - tidak ada data pribadi di VM.
- **Layanan pendukung per ticket** (Postgres, Redis) dijalankan dengan `docker compose` kalau perlu.
- **Daytona:** belum perlu.
  - Biayanya per jam, sinkronisasi git menambah latensi, dan secret harus masuk ke cloud.
  - Pakai Daytona kalau butuh lebih dari 3 agent, build melebihi 16 GB, atau VM ingin dijadikan "otak" saja.
  - Sandcastle sudah punya provider Daytona (`src/sandboxes/daytona.ts`), jadi nanti tinggal ganti konfigurasi.
  - Dari dokumentasi Daytona: auto-stop default 15 menit, auto-archive untuk sandbox container, dan volume berbasis S3 yang bertahan walau sandbox dihapus.

## Arsitektur

- **Daemon `pandai` (Node + TypeScript) di VM:**
  - poll GitHub setiap 30–60 detik, tanpa webhook atau tunnel, sehingga tahan restart;
  - state machine per card;
  - menjalankan agent (OpenCode/Claude) lewat Sandcastle (`noSandbox` atau `docker`);
  - gate runner, operasi git, budget, watchdog stall.
- **CLI:** `pandai ide`, `pandai bug`, `pandai status`, `pandai resume`.
- **Skill:**
  - dari Matt, dipakai apa adanya: `grilling`, `domain-modeling`, `to-spec`, `to-tickets`, `tdd`, `diagnosing-bugs`, `code-review`, `retro`;
  - satu skill kecil `/pandai` untuk dipanggil dari chat.
- **Pola:** mirip OpenAI Symphony (orkestrator yang digerakkan tracker, dengan poll dan rekonsiliasi), ditambah alur Matt dan gate deterministik.
- **Pelajaran dari Forge dan bukti riset yang tetap dipakai:**
  - proteksi test dan test-first yang dikunci,
  - jalur keluar BLOCKED,
  - gate ulang setelah merge,
  - review sebagai saran,
  - batas ronde perbaikan,
  - circuit breaker untuk kuota,
  - kill seluruh process group.

## Urutan pembangunan (vertical slice)

1. **Bug → Jalan → Tinjau.** Manfaatnya paling cepat terasa karena definisi selesainya jelas (test repro). Push WIP dan resume setelah VM mati sudah termasuk di slice ini.
2. **Ide → Tempa asinkron → spec dan ticket di GitHub.**
3. **Jalan multi-ticket.** Jadwal sesuai relasi blokir, 2 paralel, merge queue, gate ulang.
4. **Bootstrap VM penuh dan laporan biaya.**
5. **Opsional:** web board tipis, retro otomatis, provider Daytona.

## Yang perlu dikonfirmasi

1. Board pakai GitHub Issues + Projects, atau sudah memakai Linear?
2. Harness utama: OpenCode (dengan model apa?) atau Claude Code?
3. Repo private `bedulweb/pandai`: masih perlu dibuat manual dan diberi akses untuk GitHub App Claude.
