# MPI Siklus CPU + CPU QUEST 3D

Versi GitHub Pages ini menggabungkan Media Pembelajaran Interaktif Siklus CPU dengan game open-world **CPU QUEST 3D — Petualangan di Dalam Prosesor**.

## Alur siswa
Materi → Video → Kuis → HOTS → Refleksi → CPU QUEST 3D. Game tetap terkunci sampai 5 tahap pembelajaran selesai.

## Struktur penting
- `index.html` — MPI utama
- `css/style.css` — tampilan MPI dan shell game
- `js/app.js` — progres pembelajaran dan integrasi game
- `game/cpu-quest-3d.html` — game 3D open-world

## Upload GitHub Pages
Upload seluruh isi folder ini ke root repository. Jangan memindahkan folder `game`, `css`, atau `js`. GitHub Pages dapat tetap menggunakan branch `main` dan `/(root)`.

## Catatan
CPU QUEST 3D memakai Three.js dari CDN jsDelivr saat game dimuat, sehingga game memerlukan koneksi internet. Progres MPI dan game disimpan di localStorage browser.
