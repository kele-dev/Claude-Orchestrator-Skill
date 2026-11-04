---
name: off
description: Matikan mode orkestrasi untuk sisa sesi ini. Hanya dipakai saat pengguna mengetik /orchestrator:off.
disable-model-invocation: true
---

# Mode orchestrator: OFF

Mode orkestrasi NONAKTIF untuk sisa sesi ini, sampai pengguna mengetik `/orchestrator:on`.

- Abaikan aturan "orkestrasi wajib" yang dimuat di awal sesi, dan jangan memuat skill `orchestrator:on` secara otomatis.
- Kerjakan tugas langsung seperti biasa (boleh mengedit sendiri), tanpa PRD dan tanpa delegasi wajib ke subagent.
- Tetap berlaku: jangan commit/push tanpa diminta, jangan sentuh .env, jangan jalankan migrasi DB.

Balas pengguna singkat: "Mode orkestrasi dimatikan untuk sesi ini. Ketik /orchestrator:on untuk mengaktifkan lagi."
