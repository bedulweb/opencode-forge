# Verifikasi teknis sebelum implementasi (2026-10-11)

## OpenCode v2 (`@opencode/cli` / `@opencode/client` 2.0.26)
- **Run headless:** gunakan client SDK.
  - Panggil `Service.ensure()` (atau `opencode serve` dengan `OPENCODE_PASSWORD`), lalu `OpenCode.make()`, `session.create({location:{directory}, model, agent, permissions:[{action:"*",resource:"*",effect:"allow"}]})`, `session.prompt()`, dan `session.wait()`.
  - Event yang dipakai sebagai tanda selesai: `session.execution.succeeded`, `.failed`, `.interrupted`. Biaya dibaca dari `session.get().cost` dan `.tokens`.
  - Fallback: jalankan `opencode run --format json --auto -m p/m` dengan `cwd`, `env.PWD`, dan `stdin` ditutup.
- **ACP:** `opencode acp` (stdio, protokol 1). Mendukung `loadSession`, list, resume, dan fork. Tidak ada flag `--auto`, jadi client wajib menjawab `session/request_permission`. Biaya dibaca dari update `usage_update`.
- **Tidak ada `opencode web` di v2.** Yang ada `opencode serve` (API + web, password wajib) dan `opencode pair`. Karena itu chat dashboard memakai ACP lewat `pandai-node`.
- **SDK client ACP:** `@agentclientprotocol/sdk` 1.8.0, dengan API `client().connectWith(ndJsonStream(...))`.
- **Config:** `opencode.json(c)`; `{env:VAR}` dan `{file:path}` didukung. Skill dibaca dari `.opencode|.claude|.agents/skill(s)/` dan dari key `skills:[...]`.

## Cloudflare
- **Workers Free:** 10 ms CPU per request, 50 subrequest, 5 cron. Ini terlalu sempit untuk control plane, jadi **pakai Workers Paid ($5/bulan)**.
- **Durable Objects:** SQLite-backed, dengan WebSocket Hibernation (`acceptWebSocket`; attachment ≤16 KB; semua socket putus setiap kali deploy). Penjadwalan memakai alarm.
- **SPA + API dalam satu Worker:** `@cloudflare/vite-plugin` + `assets.run_worker_first` (sudah dipakai di `pandai/apps/web`).
- **Doppler → Cloudflare:** tidak ada sinkron otomatis. Alirkan lewat pipe `doppler secrets --json | … | wrangler secret bulk` di CI.

## GitHub
- **Webhook GitHub App:** `issues`, `issue_comment`, `sub_issues`, `issue_dependencies` (`blocked_by_added`/`removed`), `pull_request`, `check_run`/`check_suite`, `workflow_run`.
- **Installation token:** bisa dibatasi per repo dan berlaku 1 jam.
- **Sub-issue dan dependency "blocked by":** tersedia via REST (GA). Sub-issue boleh lintas repo selama pemiliknya sama. Dependency lintas repo belum terdokumentasi, jadi perlu diuji.
- **Webhook Projects v2 hanya untuk organisasi.** Kolom tetap disimpan di label (sesuai desain).
- **Merge queue tidak tersedia untuk repo milik akun pribadi.** Untuk repo private, fitur ini butuh org + Enterprise Cloud. Penggantinya: Pandai menggabungkan PR satu per satu (update branch dari base → CI ulang → merge).
- **Issue types hanya ada di level organisasi.**

## UI
- **coss ui** (shadcn registry `@coss/style`, Base UI + Tailwind v4) berjalan di Vite.
- `@import "geist"` khusus Next.js, jadi diganti `@fontsource-variable/geist-mono`.
- Dark mode memakai class `.dark` (hook `useTheme`).
- Drag-and-drop memakai `@dnd-kit/core` 6.3.1 (stabil).
