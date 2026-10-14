/* MPI Siklus CPU — GitHub Pages Edition
   Hosting statis: GitHub Pages
   Penyimpanan progres: localStorage browser
*/

/* === STATE MANAGEMENT === */
        let studentData = {
            studentId: "",
            name: "",
            class: ""
        };

        /* === PROGRESS GATE: belajar dulu, game kemudian === */
        const progressSteps = [
            { key: 'material', label: 'Materi', tab: 'materi', icon: 'fa-book-open' },
            { key: 'video', label: 'Video', tab: 'video', icon: 'fa-play-circle' },
            { key: 'quiz', label: 'Kuis', tab: 'kuis', icon: 'fa-tasks' },
            { key: 'hots', label: 'HOTS', tab: 'hots', icon: 'fa-brain' },
            { key: 'reflection', label: 'Refleksi', tab: 'refleksi', icon: 'fa-mirror' }
        ];
        const PROGRESS_SCHEMA_VERSION = 3;
        let learningProgress = createDefaultProgress();
        let activeProgressKey = '';
        let modalAfterCloseAction = null;
        let modalActionLabel = 'Tutup & Lanjutkan';

        let syncTimer = null;
        let syncInFlight = false;
        let syncAgainAfterFlight = false;
        const pendingSyncEvents = new Set();

        function nowMs() { return Date.now(); }

        function createDefaultProgress() {
            return {
                schemaVersion: PROGRESS_SCHEMA_VERSION,
                updatedAt: 0,
                material: false,
                video: false,
                quiz: false,
                hots: false,
                reflection: false,
                quizScore: null,
                quizBestScore: null,
                quizAttempts: 0,
                hotsScore: null,
                hotsBestScore: null,
                hotsAttempts: 0,
                reflectionText: { r1: '', r2: '', r3: '' },
                game: { version: 2, score: 0, completedMissions: [], missionStars: {}, bestScore: 0, updatedAt: 0, resetAt: 0 }
            };
        }

        function normalizeProgress(raw) {
            const fresh = createDefaultProgress();
            const saved = raw && typeof raw === 'object' ? raw : {};
            const gameRaw = saved.game && typeof saved.game === 'object' ? saved.game : {};
            const normalized = {
                ...fresh,
                ...saved,
                schemaVersion: PROGRESS_SCHEMA_VERSION,
                updatedAt: Number(saved.updatedAt) || 0,
                material: !!saved.material,
                video: !!saved.video,
                quiz: !!saved.quiz,
                hots: !!saved.hots,
                reflection: !!saved.reflection,
                quizScore: saved.quizScore !== null && saved.quizScore !== '' && Number.isFinite(Number(saved.quizScore)) ? Number(saved.quizScore) : null,
                quizBestScore: saved.quizBestScore !== null && saved.quizBestScore !== '' && Number.isFinite(Number(saved.quizBestScore)) ? Number(saved.quizBestScore) : (saved.quizScore !== null && saved.quizScore !== '' && Number.isFinite(Number(saved.quizScore)) ? Number(saved.quizScore) : null),
                quizAttempts: Math.max(0, Number(saved.quizAttempts) || (saved.quiz ? 1 : 0)),
                hotsScore: saved.hotsScore !== null && saved.hotsScore !== '' && Number.isFinite(Number(saved.hotsScore)) ? Number(saved.hotsScore) : null,
                hotsBestScore: saved.hotsBestScore !== null && saved.hotsBestScore !== '' && Number.isFinite(Number(saved.hotsBestScore)) ? Number(saved.hotsBestScore) : (saved.hotsScore !== null && saved.hotsScore !== '' && Number.isFinite(Number(saved.hotsScore)) ? Number(saved.hotsScore) : null),
                hotsAttempts: Math.max(0, Number(saved.hotsAttempts) || (saved.hots ? 1 : 0)),
                reflectionText: { ...fresh.reflectionText, ...(saved.reflectionText || {}) },
                game: {
                    ...fresh.game,
                    ...gameRaw,
                    completedMissions: Array.isArray(gameRaw.completedMissions) ? [...new Set(gameRaw.completedMissions.map(Number).filter(Number.isFinite))] : [],
                    missionStars: gameRaw.missionStars && typeof gameRaw.missionStars === 'object' ? { ...gameRaw.missionStars } : {},
                    score: Math.max(0, Number(gameRaw.score) || 0),
                    bestScore: Math.max(0, Number(gameRaw.bestScore) || 0),
                    updatedAt: Number(gameRaw.updatedAt) || 0,
                    resetAt: Number(gameRaw.resetAt) || 0
                }
            };
            if (normalized.game.version !== 2) normalized.game = { ...fresh.game };
            return normalized;
        }

        function getProgressStorageKey() {
            const id = (studentData.studentId || 'tanpa_kode').toLowerCase().replace(/[^a-z0-9._-]+/g, '_').replace(/^_|_$/g, '');
            const c = (studentData.class || 'kelas').toLowerCase().replace(/[^a-z0-9]+/g, '_');
            return `mpi_cpu_progress_v3_${c}_${id}`;
        }

        function hasAppsScriptBridge() {
            return false; // GitHub Pages adalah hosting statis; progres disimpan di localStorage.
        }

        function setSyncStatus(state, message) {
            const el = document.getElementById('syncStatus');
            const btn = document.getElementById('syncNowBtn');
            if (!el) return;
            const map = {
                synced: ['text-green-300', 'fa-cloud-arrow-up'],
                syncing: ['text-cyan-300', 'fa-rotate'],
                local: ['text-amber-300', 'fa-hard-drive'],
                error: ['text-rose-300', 'fa-triangle-exclamation']
            };
            el.classList.remove('text-slate-400', 'text-green-300', 'text-cyan-300', 'text-amber-300', 'text-rose-300');
            const cfg = map[state] || ['text-slate-400', 'fa-cloud'];
            el.classList.add(cfg[0]);
            el.innerHTML = `<i class="fas ${cfg[1]} mr-2"></i>${message}`;
            if (btn) btn.disabled = state === 'syncing';
        }

        function persistLocalProgress() {
            if (!activeProgressKey) activeProgressKey = getProgressStorageKey();
            try { localStorage.setItem(activeProgressKey, JSON.stringify(learningProgress)); } catch (e) {}
        }

        function loadLearningProgress() {
            activeProgressKey = getProgressStorageKey();
            try {
                const saved = JSON.parse(localStorage.getItem(activeProgressKey) || 'null');
                learningProgress = normalizeProgress(saved);
            } catch (e) {
                learningProgress = createDefaultProgress();
            }
            updateProgressUI();
            if (hasAppsScriptBridge()) {
                setSyncStatus('syncing', 'Mengambil progres dari Google Sheet...');
                loadProgressFromServer();
            } else {
                setSyncStatus('local', 'Progres tersimpan otomatis di browser/perangkat ini.');
            }
        }

        function mergeGameProgress(aRaw, bRaw) {
            const fresh = createDefaultProgress().game;
            const a = { ...fresh, ...(aRaw || {}) };
            const b = { ...fresh, ...(bRaw || {}) };
            const aTime = Number(a.updatedAt) || 0;
            const bTime = Number(b.updatedAt) || 0;
            const aReset = Number(a.resetAt) || 0;
            const bReset = Number(b.resetAt) || 0;
            let result;

            if (aReset > bTime && aReset >= bReset) {
                result = { ...a };
            } else if (bReset > aTime && bReset >= aReset) {
                result = { ...b };
            } else {
                const newer = aTime >= bTime ? a : b;
                const stars = { ...(a.missionStars || {}) };
                Object.entries(b.missionStars || {}).forEach(([k, v]) => {
                    stars[k] = Math.max(Number(stars[k]) || 0, Number(v) || 0);
                });
                result = {
                    ...newer,
                    version: 2,
                    completedMissions: [...new Set([...(a.completedMissions || []), ...(b.completedMissions || [])].map(Number).filter(Number.isFinite))].sort((x,y)=>x-y),
                    missionStars: stars,
                    bestScore: Math.max(Number(a.bestScore) || 0, Number(b.bestScore) || 0),
                    updatedAt: Math.max(aTime, bTime),
                    resetAt: Math.max(aReset, bReset)
                };
            }
            result.bestScore = Math.max(Number(a.bestScore) || 0, Number(b.bestScore) || 0, Number(result.bestScore) || 0);
            return result;
        }

        function maxNullableClient(a, b) {
            const vals = [a, b].filter(v => v !== null && v !== '' && Number.isFinite(Number(v))).map(Number);
            return vals.length ? Math.max(...vals) : null;
        }

        function mergeProgress(localRaw, remoteRaw) {
            const a = normalizeProgress(localRaw);
            const b = normalizeProgress(remoteRaw);
            const newer = a.updatedAt >= b.updatedAt ? a : b;
            const older = newer === a ? b : a;
            const reflectionNewer = newer.reflectionText || {};
            const reflectionOlder = older.reflectionText || {};
            const out = normalizeProgress({
                ...newer,
                material: a.material || b.material,
                video: a.video || b.video,
                quiz: a.quiz || b.quiz,
                hots: a.hots || b.hots,
                reflection: a.reflection || b.reflection,
                quizBestScore: maxNullableClient(a.quizBestScore, b.quizBestScore),
                quizAttempts: Math.max(Number(a.quizAttempts) || 0, Number(b.quizAttempts) || 0),
                hotsBestScore: maxNullableClient(a.hotsBestScore, b.hotsBestScore),
                hotsAttempts: Math.max(Number(a.hotsAttempts) || 0, Number(b.hotsAttempts) || 0),
                reflectionText: {
                    r1: reflectionNewer.r1 || reflectionOlder.r1 || '',
                    r2: reflectionNewer.r2 || reflectionOlder.r2 || '',
                    r3: reflectionNewer.r3 || reflectionOlder.r3 || ''
                },
                game: mergeGameProgress(a.game, b.game),
                updatedAt: Math.max(a.updatedAt, b.updatedAt)
            });
            return out;
        }

        function loadProgressFromServer() {
            if (!hasAppsScriptBridge()) return;
            google.script.run
                .withSuccessHandler((res) => {
                    if (res && res.found && res.progress) {
                        learningProgress = mergeProgress(learningProgress, res.progress);
                        persistLocalProgress();
                        updateProgressUI();
                        setSyncStatus('synced', 'Progres berhasil dimuat dan disinkronkan dari Google Sheet.');
                        scheduleServerSync('LOGIN_MERGE', true);
                    } else {
                        setSyncStatus('syncing', 'Belum ada data di Sheet. Membuat progres baru...');
                        scheduleServerSync('FIRST_LOGIN', true);
                    }
                })
                .withFailureHandler((err) => {
                    const msg = err && err.message ? err.message : 'Server tidak dapat dihubungi';
                    setSyncStatus('error', `Sinkronisasi gagal. Progres lokal tetap aman. (${msg})`);
                })
                .getStudentProgress({ studentId: studentData.studentId, name: studentData.name, class: studentData.class });
        }

        function saveLearningProgress(options = {}) {
            learningProgress = normalizeProgress(learningProgress);
            learningProgress.updatedAt = nowMs();
            persistLocalProgress();
            updateProgressUI();
            if (!options.skipServer) scheduleServerSync(options.event || '', !!options.forceServer);
        }

        function scheduleServerSync(eventName = '', immediate = false) {
            if (eventName) pendingSyncEvents.add(String(eventName));
            if (!hasAppsScriptBridge()) {
                setSyncStatus('local', 'Perubahan tersimpan otomatis di browser/perangkat ini.');
                return;
            }
            if (syncInFlight) {
                syncAgainAfterFlight = true;
                return;
            }
            if (syncTimer) clearTimeout(syncTimer);
            syncTimer = setTimeout(() => syncProgressNow(), immediate ? 50 : 1200);
        }

        function syncProgressNow(manualEvent = '') {
            if (manualEvent) pendingSyncEvents.add(String(manualEvent));
            if (!hasAppsScriptBridge()) {
                setSyncStatus('local', 'GitHub Pages aktif: progres disimpan lokal di browser/perangkat ini.');
                return;
            }
            if (syncInFlight) {
                syncAgainAfterFlight = true;
                return;
            }
            if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
            syncInFlight = true;
            const events = [...pendingSyncEvents];
            pendingSyncEvents.clear();
            const snapshot = JSON.parse(JSON.stringify(learningProgress));
            setSyncStatus('syncing', 'Menyinkronkan progres ke Google Sheet...');

            google.script.run
                .withSuccessHandler((res) => {
                    syncInFlight = false;
                    if (res && res.progress) {
                        learningProgress = mergeProgress(learningProgress, res.progress);
                        persistLocalProgress();
                        updateProgressUI();
                    }
                    setSyncStatus('synced', 'Tersinkron ke Google Sheet.');
                    if (syncAgainAfterFlight || pendingSyncEvents.size) {
                        syncAgainAfterFlight = false;
                        scheduleServerSync('', true);
                    }
                })
                .withFailureHandler((err) => {
                    syncInFlight = false;
                    events.forEach(e => pendingSyncEvents.add(e));
                    const msg = err && err.message ? err.message : 'Server tidak dapat dihubungi';
                    setSyncStatus('error', `Belum tersinkron. Data lokal tetap aman. (${msg})`);
                })
                .saveStudentProgress({
                    student: { studentId: studentData.studentId, name: studentData.name, class: studentData.class },
                    progress: snapshot,
                    events: events,
                    clientUpdatedAt: snapshot.updatedAt
                });
        }

        function completedLearningCount() {
            return progressSteps.filter(s => learningProgress[s.key]).length;
        }

        function isGameUnlocked() { return completedLearningCount() === progressSteps.length; }

        function markLearningStep(key) {
            const wasUnlocked = isGameUnlocked();
            const wasDone = !!learningProgress[key];
            learningProgress[key] = true;
            saveLearningProgress({ event: wasDone ? '' : `STEP_${String(key).toUpperCase()}`, forceServer: !wasDone });
            if (!wasUnlocked && isGameUnlocked()) {
                showModal('CPU QUEST 3D Terbuka!', `Selamat ${studentData.name}! Semua tahap pembelajaran selesai. Petualangan 3D di dalam prosesor sekarang sudah dapat dimainkan.`, 'success');
            }
        }

        function updateProgressUI() {
            const done = completedLearningCount();
            const pct = Math.round((done / progressSteps.length) * 100);
            const count = document.getElementById('homeProgressCount');
            const bar = document.getElementById('homeProgressBar');
            const homeSteps = document.getElementById('homeProgressSteps');
            if (count) count.textContent = `${done}/5`;
            if (bar) bar.style.width = `${pct}%`;
            if (homeSteps) homeSteps.innerHTML = progressSteps.map(s => `
                <div class="flex items-center gap-2 rounded-xl px-3 py-3 ${learningProgress[s.key] ? 'bg-green-500/15 text-green-200 border border-green-500/30' : 'bg-slate-800 text-slate-300 border border-slate-700'}">
                    <i class="fas ${learningProgress[s.key] ? 'fa-circle-check' : 'fa-circle'}"></i><span>${s.label}</span>
                </div>`).join('');

            const navIcon = document.getElementById('navGameIcon');
            const navBtn = document.getElementById('navGameBtn');
            if (navIcon) navIcon.className = `fas ${isGameUnlocked() ? 'fa-gamepad' : 'fa-lock'}`;
            if (navBtn) navBtn.title = isGameUnlocked() ? 'CPU QUEST 3D sudah terbuka' : `Game terkunci: ${done}/5 tahap selesai`;
            const mobileGameIcon = document.getElementById('mobileGameIcon');
            const mobileGameBtn = document.getElementById('mobileGameBtn');
            if (mobileGameIcon) mobileGameIcon.className = `fas ${isGameUnlocked() ? 'fa-gamepad' : 'fa-lock'}`;
            if (mobileGameBtn) {
                mobileGameBtn.classList.toggle('game-unlocked', isGameUnlocked());
                mobileGameBtn.title = isGameUnlocked() ? 'CPU QUEST 3D sudah terbuka' : `Game terkunci: ${done}/5 tahap selesai`;
            }

            const gateBar = document.getElementById('gameGateBar');
            const gateCount = document.getElementById('gameGateCount');
            const gateSteps = document.getElementById('gameGateSteps');
            if (gateBar) gateBar.style.width = `${pct}%`;
            if (gateCount) gateCount.textContent = `${done} dari 5 tahap selesai`;
            if (gateSteps) gateSteps.innerHTML = progressSteps.map(s => `
                <button onclick="openTab('${s.tab}')" class="rounded-2xl border p-4 ${learningProgress[s.key] ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-slate-50'}">
                    <div class="text-2xl mb-2 ${learningProgress[s.key] ? 'text-green-600' : 'text-slate-400'}"><i class="fas ${learningProgress[s.key] ? 'fa-circle-check' : s.icon}"></i></div>
                    <div class="font-bold text-slate-800">${s.label}</div><div class="text-sm ${learningProgress[s.key] ? 'text-green-700' : 'text-slate-500'}">${learningProgress[s.key] ? 'Selesai' : 'Belum selesai'}</div>
                </button>`).join('');

            const materialStatus = document.getElementById('materialCheckpointStatus');
            const materialButton = document.getElementById('btnCompleteMaterial');
            if (materialStatus && learningProgress.material) materialStatus.innerHTML = '<span class="text-green-700"><i class="fas fa-circle-check mr-2"></i>Tahap Materi sudah selesai.</span>';
            if (materialButton) {
                materialButton.innerHTML = learningProgress.material
                    ? '<i class="fas fa-arrow-right mr-2"></i> Lanjut ke Video'
                    : '<i class="fas fa-check-double mr-2"></i> Selesaikan Tahap Materi';
            }
            const videoStatus = document.getElementById('videoCheckpointStatus');
            const videoButton = document.getElementById('btnCompleteVideo');
            if (videoStatus && learningProgress.video) videoStatus.innerHTML = '<span class="text-green-700"><i class="fas fa-circle-check mr-2"></i>Tahap Video sudah selesai.</span>';
            if (videoButton) {
                videoButton.innerHTML = learningProgress.video
                    ? '<i class="fas fa-arrow-right mr-2"></i> Lanjut ke Kuis'
                    : '<i class="fas fa-check mr-2"></i> Selesaikan Tahap Video';
            }

            const savedReflection = learningProgress.reflectionText || {};
            const rr1 = document.getElementById('refleksi1');
            const rr2 = document.getElementById('refleksi2');
            const rr3 = document.getElementById('refleksi3');
            if (rr1 && !rr1.value && savedReflection.r1) rr1.value = savedReflection.r1;
            if (rr2 && !rr2.value && savedReflection.r2) rr2.value = savedReflection.r2;
            if (rr3 && !rr3.value && savedReflection.r3) rr3.value = savedReflection.r3;

            renderGameGate();
            updateGameHud();
        }

        function goToNextIncompleteStep() {
            const next = progressSteps.find(s => !learningProgress[s.key]);
            openTab(next ? next.tab : 'game');
        }

        function completeMaterialCheckpoint() {
            if (learningProgress.material) { openTab('video'); return; }
            const ok = document.getElementById('matCheck1').value === 'fde' && document.getElementById('matCheck2').value === 'pc' && document.getElementById('matCheck3').value === 'interpret';
            if (!ok) { showModal('Checkpoint belum tepat', 'Ada jawaban yang belum tepat. Baca kembali bagian Fetch, Decode, Execute dan komponen CPU, lalu coba lagi.', 'warning'); return; }
            markLearningStep('material');
            showModal(
                'Materi Selesai',
                'Checkpoint benar. Tahap Materi selesai. Setelah menutup pesan ini, kamu akan lanjut ke Video.',
                'success',
                () => openTab('video'),
                'Lanjut ke Video'
            );
        }

        function completeVideoCheckpoint() {
            if (learningProgress.video) { openTab('kuis'); return; }
            const ok = document.getElementById('vidCheck1').value === 'take' && document.getElementById('vidCheck2').value === 'interpret' && document.getElementById('vidCheck3').value === 'perform';
            if (!ok) { showModal('Checkpoint video belum tepat', 'Periksa kembali arti Fetch, Decode, dan Execute. Kamu boleh membuka video lagi lalu mencoba checkpoint.', 'warning'); return; }
            markLearningStep('video');
            showModal(
                'Video Selesai',
                'Checkpoint video benar. Setelah menutup pesan ini, kamu akan lanjut ke Kuis.',
                'success',
                () => openTab('kuis'),
                'Lanjut ke Kuis'
            );
        }


        /* === DATA 15 SOAL KUIS (LENGKAP, TIDAK ADA PLACEHOLDER) === */
        const quizData = [
            {
                q: "Apa fungsi utama dari CPU pada sebuah komputer?",
                options: ["Menyimpan data secara permanen", "Mengontrol semua operasi dan memproses data", "Menampilkan gambar di layar", "Memberikan daya listrik ke komputer"],
                ans: 1
            },
            {
                q: "Apa nama siklus berulang yang terus menerus dilakukan oleh CPU?",
                options: ["Siklus Data", "Siklus Memori", "Siklus Mesin (Machine Cycle)", "Siklus Booting"],
                ans: 2
            },
            {
                q: "Siklus mesin (Machine Cycle) terdiri dari 3 tahap utama, urutan yang benar adalah...",
                options: ["Decode - Execute - Fetch", "Fetch - Decode - Execute", "Execute - Fetch - Decode", "Fetch - Execute - Decode"],
                ans: 1
            },
            {
                q: "Pada tahap 'Fetch', CPU mengambil instruksi dari mana?",
                options: ["Harddisk (Storage)", "Memori Utama (RAM)", "Monitor", "Keyboard"],
                ans: 1
            },
            {
                q: "Apa yang terjadi pada tahap 'Decode' dalam siklus kerja CPU?",
                options: ["Menyimpan kembali hasil ke RAM", "Menafsirkan opcode/instruksi dan menentukan tindakan atau sinyal kontrol yang diperlukan", "Menghitung angka matematika", "Mematikan komputer"],
                ans: 1
            },
            {
                q: "Komponen CPU manakah yang terutama mengatur dan menafsirkan instruksi pada tahap Decode?",
                options: ["ALU (Arithmetic Logic Unit)", "Register", "Control Unit (CU)", "Bus"],
                ans: 2
            },
            {
                q: "Komponen CPU manakah yang bertugas untuk melakukan tahap 'Execute' (seperti menghitung perhitungan matematika)?",
                options: ["ALU (Arithmetic Logic Unit)", "Control Unit (CU)", "Cache Memory", "Motherboard"],
                ans: 0
            },
            {
                q: "Berdasarkan analogi restoran, apa yang merepresentasikan tahap 'Fetch'?",
                options: ["Koki memasak makanan", "Koki membaca resep masakan", "Pelayan mengambil kertas pesanan dari pelanggan", "Pelanggan membayar di kasir"],
                ans: 2
            },
            {
                q: "Berdasarkan analogi restoran, tahap 'Decode' sama dengan aktivitas...",
                options: ["Koki menyajikan makanan", "Koki membaca dan memahami pesanan (resep)", "Pelayan berjalan ke dapur", "Pelanggan melihat menu"],
                ans: 1
            },
            {
                q: "Apa singkatan dari CPU?",
                options: ["Computer Processing Unit", "Central Processing Unit", "Control Process Unit", "Core Processing Utility"],
                ans: 1
            },
            {
                q: "Jika CPU diibaratkan sebagai otak manusia, maka RAM diibaratkan sebagai...",
                options: ["Mata yang melihat", "Ingatan jangka pendek tempat informasi sementara disimpan", "Tangan yang bergerak", "Jantung yang memompa darah"],
                ans: 1
            },
            {
                q: "Jalur komunikasi tempat lewatnya data dari RAM menuju CPU disebut...",
                options: ["Bus", "Kereta", "Kabel Power", "Kipas (Fan)"],
                ans: 0
            },
            {
                q: "Apa akibatnya jika tahap 'Execute' gagal dilakukan oleh CPU?",
                options: ["Komputer menjadi lebih cepat", "Instruksi tidak dikerjakan dan program mungkin error (crash)", "RAM bertambah besar", "Monitor mati sendiri"],
                ans: 1
            },
            {
                q: "Apa arti satuan GHz yang sering digunakan pada spesifikasi CPU?",
                options: ["Jumlah aplikasi yang dapat dibuka", "Jumlah file yang dapat disimpan", "Frekuensi clock CPU dalam miliaran siklus clock per detik", "Ukuran RAM yang digunakan CPU"],
                ans: 2
            },
            {
                q: "Setelah tahap Execute selesai, apa yang umumnya dilakukan CPU selanjutnya?",
                options: ["Tidur", "Mengulang kembali siklus ke tahap Fetch untuk instruksi berikutnya", "Mematikan RAM", "Menghapus semua file"],
                ans: 1
            }
        ];

        /* === DATA 5 SOAL HOTS KASUS KONTEKSTUAL (LENGKAP) === */
        const hotsData = [
            {
                scenario: "Skenario 1: Budi sedang membuka 15 tab Google Chrome sekaligus dan bermain game. Tiba-tiba komputernya sangat lambat (lag/ngehang).",
                q: "Berdasarkan analogi restoran dan siklus kerja CPU, analisis mana di bawah ini yang paling tepat menjelaskan penyebab komputer Budi melambat?",
                options: [
                    "Koki (ALU) terlalu malas untuk memasak sehingga pesanan dibuang.",
                    "Banyak program aktif meningkatkan beban CPU dan penggunaan RAM. Jika RAM tidak cukup, sistem dapat lebih sering memindahkan data ke penyimpanan yang lebih lambat sehingga respons komputer menurun.",
                    "Kompor di dapur mati, sehingga tahap Decode tidak berjalan.",
                    "Resep masakan hilang, sehingga Execute dibatalkan."
                ],
                ans: 1
            },
            {
                scenario: "Skenario 2: Sebuah komputer terkena virus jenis 'Cryptominer' yang memaksa CPU melakukan perhitungan matematika super rumit secara sembunyi-sembunyi, sehingga suhu CPU meningkat drastis.",
                q: "Pada siklus CPU, tahap manakah yang paling dieksploitasi/diperas tenaganya oleh virus tersebut?",
                options: [
                    "Hanya tahap Fetch, karena virus bersembunyi di memori.",
                    "Tahap Execute (oleh ALU), karena ALU dipaksa terus-menerus memproses perhitungan rumit tanpa jeda.",
                    "Tahap Decode, karena virus mengubah bahasa mesin.",
                    "Tidak ada siklus yang terpengaruh, hanya kipas yang rusak."
                ],
                ans: 1
            },
            {
                scenario: "Skenario 3: Ani mengeluh komputernya lambat. Teknisi menyarankan untuk 'Upgrade RAM' dari 4GB menjadi 16GB. Setelah di-upgrade, komputernya menjadi jauh lebih cepat saat memproses data.",
                q: "Mengapa memperbesar RAM dapat memperlancar siklus CPU?",
                options: [
                    "Karena RAM yang besar membuat CPU berputar lebih kencang.",
                    "Karena RAM menyimpan daya listrik cadangan untuk CPU.",
                    "RAM yang lebih besar dapat menampung lebih banyak program/data aktif sehingga sistem lebih jarang memindahkan data ke penyimpanan yang jauh lebih lambat; CPU pun lebih sering memperoleh data/instruksi yang dibutuhkan dari RAM.",
                    "Karena RAM menggantikan tugas Control Unit dalam menerjemahkan (Decode) instruksi."
                ],
                ans: 2
            },
            {
                scenario: "Skenario 4: Saat koki (Control Unit) menerima pesanan (instruksi), ia mendapati pesanan tersebut ditulis dalam bahasa asing yang tidak ia mengerti.",
                q: "Dalam dunia nyata komputer, apa yang terjadi pada siklus CPU (khususnya Decode) jika instruksi yang diambil rusak (corrupt) atau format programnya tidak dikenali?",
                options: [
                    "Control Unit akan mengabaikan instruksi tersebut dan mematikan monitor secara permanen.",
                    "Control Unit tidak dapat menjalankan instruksi tidak valid seperti instruksi normal; CPU dapat memicu exception/illegal-instruction sehingga sistem operasi atau program menghentikan atau menangani proses tersebut.",
                    "ALU (Arithmetic Logic Unit) akan mengambil alih tugas Decode secara otomatis.",
                    "CPU akan menebak-nebak dan mengarang instruksi baru."
                ],
                ans: 1
            },
            {
                scenario: "Skenario 5: Sebuah prosesor memiliki kecepatan clock 4,5 GHz, sedangkan prosesor lain 2,0 GHz. Angka GHz menunjukkan frekuensi clock, bukan jumlah pasti instruksi yang selesai setiap detik.",
                q: "Kesimpulan manakah yang paling tepat tentang angka GHz tersebut?",
                options: [
                    "CPU 4,5 GHz pasti menyelesaikan tepat 4,5 miliar instruksi Fetch-Decode-Execute setiap detik.",
                    "CPU 2,0 GHz tidak memiliki tahap Decode.",
                    "Clock yang lebih tinggi berarti CPU memiliki lebih banyak denyut kerja per detik, tetapi kinerja nyata juga dipengaruhi arsitektur dan jenis instruksi.",
                    "Angka GHz menunjukkan kapasitas RAM yang dapat digunakan."
                ],
                ans: 2
            }
        ];

        /* === INITIALIZATION LOGIC === */
        document.addEventListener("DOMContentLoaded", () => {
            renderQuiz();
            renderHots();
            setupVideoPlayer();
            updateProgressUI();
        });

        /* === VIDEO COMPATIBILITY ===
           YouTube embed dapat gagal dengan Error 153 saat HTML dibuka langsung via file://
           karena browser tidak mengirim HTTP Referer. Iframe hanya diaktifkan pada http/https.
        */
        function setupVideoPlayer() {
            const embedMode = document.getElementById("videoEmbedMode");
            const localMode = document.getElementById("videoLocalMode");
            const frame = document.getElementById("cpuVideoFrame");

            if (!embedMode || !localMode || !frame) return;

            const canEmbedSafely = window.location.protocol === "http:" || window.location.protocol === "https:";

            if (canEmbedSafely) {
                embedMode.classList.remove("hide");
                localMode.classList.add("hide");
                frame.src = frame.dataset.src;
            } else {
                embedMode.classList.add("hide");
                localMode.classList.remove("hide");
                frame.removeAttribute("src");
            }
        }

        function startLearning() {
            const nameInput = document.getElementById("studentName").value.trim();
            const codeInput = document.getElementById("studentCode").value.trim();
            const classInput = document.getElementById("studentClass").value;

            if (!nameInput || !codeInput || !classInput) {
                showModal("Data Belum Lengkap!", "Isi Nama Lengkap, Kode Siswa / NIS, dan pilih Kelas sebelum memulai.", "error");
                return;
            }
            if (!/^[A-Za-z0-9._-]{2,30}$/.test(codeInput)) {
                showModal("Kode Siswa Tidak Valid", "Gunakan 2–30 karakter berupa huruf, angka, titik, garis bawah, atau tanda minus.", "error");
                return;
            }

            // Simpan state
            studentData.studentId = codeInput;
            studentData.name = nameInput;
            studentData.class = classInput;

            // Update UI User
            document.getElementById("displayUser").innerText = `${studentData.name} (${studentData.class})`;
            const mobileUser = document.getElementById("mobileDisplayUser");
            if (mobileUser) mobileUser.innerText = `${studentData.name} (${studentData.class})`;

            // Muat progres khusus untuk nama + kelas ini
            loadLearningProgress();
            
            // Personalisasi Beranda
            document.getElementById("welcomeMessage").innerHTML = `Halo, <span class="text-brand-600">${studentData.name}</span> dari kelas <span class="text-brand-600">${studentData.class}</span>!`;

            // Transisi Halaman
            document.getElementById("loginPage").classList.add("opacity-0");
            setTimeout(() => {
                document.getElementById("loginPage").classList.add("hide");
                const mainApp = document.getElementById("mainApp");
                mainApp.classList.remove("hide");
                mainApp.classList.add("flex"); // Tailwind flex
                openTab("beranda");
            }, 500); // 500ms transition time
        }

        const mobileTabLabels = { beranda:'Beranda', materi:'Materi', video:'Video', kuis:'Kuis', hots:'HOTS', refleksi:'Refleksi', game:'Game' };

        function toggleMobileNav(forceState) {
            const panel = document.getElementById('mobileNavPanel');
            const btn = document.getElementById('mobileMenuButton');
            if (!panel || !btn) return;
            const shouldOpen = typeof forceState === 'boolean' ? forceState : panel.classList.contains('hide');
            panel.classList.toggle('hide', !shouldOpen);
            btn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
            btn.innerHTML = shouldOpen
                ? '<i class="fas fa-xmark" aria-hidden="true"></i><span class="sr-only">Tutup menu</span>'
                : '<i class="fas fa-bars" aria-hidden="true"></i><span class="sr-only">Menu</span>';
        }

        function closeMobileNav() { toggleMobileNav(false); }

        function openTab(tabId) {
            if (tabId === 'game') renderGameGate();
            if (tabId !== 'game') {
                const appRoot = document.getElementById('mainApp');
                if (appRoot && appRoot.classList.contains('game-immersive')) {
                    appRoot.classList.remove('game-immersive');
                    updateGameFocusButton();
                }
            }
            // Sembunyikan semua tab
            const tabs = document.querySelectorAll(".tab-content");
            tabs.forEach(tab => {
                tab.classList.add("hide");
                tab.classList.remove("fade-in");
            });

            // Tampilkan tab target
            const target = document.getElementById(tabId);
            target.classList.remove("hide");
            // Trik untuk trigger ulang animasi CSS
            void target.offsetWidth; 
            target.classList.add("fade-in");

            // Update Nav State
            const navBtns = document.querySelectorAll(".nav-btn");
            navBtns.forEach(btn => {
                btn.classList.remove("text-brand-600", "bg-brand-50", "active-nav");
                btn.classList.add("text-slate-600");
            });

            const activeBtn = document.querySelector(`.nav-btn[data-target="${tabId}"]`);
            if(activeBtn) {
                activeBtn.classList.remove("text-slate-600");
                activeBtn.classList.add("text-brand-600", "bg-brand-50", "active-nav");

                // Pastikan menu aktif selalu terlihat tanpa membuat item paling kiri terpotong.
                const navScroll = document.getElementById("mainNavScroll");
                if (navScroll) {
                    const targetLeft = activeBtn.offsetLeft - (navScroll.clientWidth / 2) + (activeBtn.offsetWidth / 2);
                    navScroll.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
                }
            }
            
            // Sinkronkan label dan status menu mobile.
            const mobileLabel = document.getElementById('mobileNavLabel');
            if (mobileLabel) mobileLabel.textContent = mobileTabLabels[tabId] || 'Menu';
            document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.target === tabId);
            });
            closeMobileNav();

            // Scroll to top
            document.getElementById("mainContentArea").scrollTop = 0;
        }

        function renderQuiz() {
            const container = document.getElementById("quizContainer");
            container.innerHTML = ""; // Bersihkan

            quizData.forEach((q, index) => {
                const questionDiv = document.createElement("div");
                questionDiv.className = "bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200 mb-6";
                
                // Question text
                const qText = document.createElement("h3");
                qText.className = "text-2xl font-bold text-slate-800 mb-6";
                qText.innerHTML = `<span class="bg-brand-100 text-brand-700 w-10 h-10 inline-flex items-center justify-center rounded-full mr-3 text-xl">${index + 1}</span> ${q.q}`;
                questionDiv.appendChild(qText);

                // Options grid
                const optionsDiv = document.createElement("div");
                optionsDiv.className = "grid grid-cols-1 md:grid-cols-2 gap-4";
                
                q.options.forEach((opt, optIndex) => {
                    const label = document.createElement("label");
                    label.className = "relative cursor-pointer";
                    
                    const input = document.createElement("input");
                    input.type = "radio";
                    input.name = `quiz_q${index}`;
                    input.value = optIndex;
                    input.className = "peer sr-only radio-custom";
                    
                    const optBox = document.createElement("div");
                    optBox.className = "p-5 border-2 border-slate-200 rounded-xl text-xl text-slate-700 hover:bg-slate-50 transition-colors peer-checked:bg-brand-50 peer-checked:border-brand-500 peer-checked:text-brand-800 touch-target flex items-center";
                    
                    const letter = String.fromCharCode(65 + optIndex); // A, B, C, D
                    optBox.innerHTML = `<span class="font-bold mr-3 border-r-2 border-slate-300 pr-3">${letter}</span> ${opt}`;
                    
                    label.appendChild(input);
                    label.appendChild(optBox);
                    optionsDiv.appendChild(label);
                });

                questionDiv.appendChild(optionsDiv);
                container.appendChild(questionDiv);
            });
        }

        function calculateQuizScore() {
            let score = 0;
            let answered = 0;
            
            quizData.forEach((q, index) => {
                const selected = document.querySelector(`input[name="quiz_q${index}"]:checked`);
                if (selected) {
                    answered++;
                    if (parseInt(selected.value) === q.ans) {
                        score++;
                    }
                }
            });

            if (answered < quizData.length) {
                showModal("Belum Selesai!", `Kamu baru menjawab ${answered} dari ${quizData.length} soal. Yuk, lengkapi dulu!`, "warning");
                return;
            }

            // Hitung nilai akhir skala 100
            const finalScore = Math.round((score / quizData.length) * 100);
            learningProgress.quizScore = finalScore;
            learningProgress.quizBestScore = Math.max(Number(learningProgress.quizBestScore) || 0, finalScore);
            learningProgress.quizAttempts = (Number(learningProgress.quizAttempts) || 0) + 1;
            learningProgress.quiz = true;
            saveLearningProgress({ event: 'QUIZ_ATTEMPT', forceServer: true });
            let message = "";
            let icon = "";

            if (finalScore >= 80) {
                message = `Luar biasa, ${studentData.name}! Kamu menguasai siklus CPU dengan sangat baik.`;
                icon = "success";
            } else if (finalScore >= 60) {
                message = `Kerja bagus, ${studentData.name}! Kamu sudah paham konsep dasarnya, pelajari sedikit lagi ya.`;
                icon = "success";
            } else {
                message = `Jangan menyerah, ${studentData.name}! Coba baca lagi materi dan tonton videonya pelan-pelan.`;
                icon = "warning";
            }

            showModal(
                `Skor Kamu: ${finalScore}`,
                `${message} Setelah menutup pesan ini, kamu akan lanjut ke HOTS.`,
                icon,
                () => openTab('hots'),
                'Lanjut ke HOTS'
            );
        }

        function renderHots() {
            const container = document.getElementById("hotsContainer");
            container.innerHTML = ""; 

            hotsData.forEach((h, index) => {
                const hotsDiv = document.createElement("div");
                hotsDiv.className = "bg-white p-6 md:p-8 rounded-2xl shadow-md border-l-8 border-l-red-500 mb-6";
                
                const scenario = document.createElement("div");
                scenario.className = "bg-red-50 p-5 rounded-xl mb-6 text-xl text-red-900 border border-red-100";
                scenario.innerHTML = `<strong>Konteks:</strong> ${h.scenario}`;
                hotsDiv.appendChild(scenario);

                const qText = document.createElement("h3");
                qText.className = "text-2xl font-bold text-slate-800 mb-6 leading-relaxed";
                qText.innerHTML = `${index + 1}. ${h.q}`;
                hotsDiv.appendChild(qText);

                const optionsDiv = document.createElement("div");
                optionsDiv.className = "flex flex-col gap-4";
                
                h.options.forEach((opt, optIndex) => {
                    const label = document.createElement("label");
                    label.className = "relative cursor-pointer";
                    
                    const input = document.createElement("input");
                    input.type = "radio";
                    input.name = `hots_q${index}`;
                    input.value = optIndex;
                    input.className = "peer sr-only radio-custom";
                    
                    const optBox = document.createElement("div");
                    optBox.className = "p-5 border-2 border-slate-200 rounded-xl text-xl text-slate-700 hover:bg-slate-50 transition-colors peer-checked:bg-red-50 peer-checked:border-red-500 peer-checked:text-red-800 touch-target block";
                    
                    const letter = String.fromCharCode(65 + optIndex);
                    optBox.innerHTML = `<span class="font-bold mr-3 border-r-2 border-slate-300 pr-3">${letter}</span> ${opt}`;
                    
                    label.appendChild(input);
                    label.appendChild(optBox);
                    optionsDiv.appendChild(label);
                });

                hotsDiv.appendChild(optionsDiv);
                container.appendChild(hotsDiv);
            });
        }

        function submitHots() {
            let answered = 0;
            let correct = 0;
            hotsData.forEach((item, index) => {
                const selected = document.querySelector(`input[name="hots_q${index}"]:checked`);
                if (selected) {
                    answered++;
                    if (Number(selected.value) === item.ans) correct++;
                }
            });

            if (answered < hotsData.length) {
                showModal("Analisis Belum Lengkap!", "Ada kasus HOTS yang belum kamu pecahkan. Ayo coba analisis semua kasusnya!", "warning");
                return;
            }

            learningProgress.hotsScore = correct;
            learningProgress.hotsBestScore = Math.max(Number(learningProgress.hotsBestScore) || 0, correct);
            learningProgress.hotsAttempts = (Number(learningProgress.hotsAttempts) || 0) + 1;
            learningProgress.hots = true;
            saveLearningProgress({ event: 'HOTS_ATTEMPT', forceServer: true });
            showModal(
                "Analisis HOTS Selesai!",
                `${studentData.name}, kamu menjawab benar ${correct} dari ${hotsData.length} kasus. Setelah menutup pesan ini, kamu akan lanjut ke Refleksi.`,
                "success",
                () => openTab('refleksi'),
                'Lanjut ke Refleksi'
            );
        }

        function submitRefleksi() {
            const r1 = document.getElementById("refleksi1").value.trim();
            const r2 = document.getElementById("refleksi2").value.trim();
            const r3 = document.getElementById("refleksi3").value.trim();

            if (!r1 || !r2 || !r3) {
                showModal("Refleksi Belum Lengkap!", "Mohon isi semua pertanyaan refleksi agar kamu bisa melihat perkembangan belajarmu dengan maksimal.", "warning");
                return;
            }

            learningProgress.reflectionText = { r1, r2, r3 };
            learningProgress.reflection = true;
            saveLearningProgress({ event: 'REFLECTION_SUBMIT', forceServer: true });
            showModal(
                "Refleksi Selesai!",
                `Terima kasih ${studentData.name}. Semua tahap pembelajaran selesai. Setelah menutup pesan ini, CPU QUEST 3D akan dibuka.`,
                "success",
                () => openTab('game'),
                'Buka CPU QUEST 3D'
            );
        }


        /* === CPU CRISIS: Mission Control game engine === */
        const CPU_CRISIS_VERSION = 2;
        const cpuCrisisMissions = [
            { id: 1, type: 'cycle', title: 'M1: BOOT SEQUENCE', stage: 'TRAINING', objective: 'Jalankan dua instruksi pertama dengan siklus Fetch → Decode → Execute.', hint: 'Lihat Program Counter (PC). Saat Fetch, pilih alamat yang sama dengan PC. Setelah itu tafsirkan IR dan tentukan perubahan register.' },
            { id: 2, type: 'cycle', title: 'M2: MEMORY RUN', stage: 'PROGRAM', objective: 'Eksekusi program 4 instruksi sampai hasil tersimpan di MEM[08].', hint: 'Ikuti state dari atas ke bawah. LOAD mengisi register, ADD menjumlahkan melalui ALU, STORE menulis nilai register ke memori.' },
            { id: 3, type: 'glitch', title: 'M3: GLITCH HUNT', stage: 'DEBUG', objective: 'Temukan catatan siklus CPU yang salah pada tiga insiden sistem.', hint: 'Periksa konsistensi PC → IR, arti instruksi saat Decode, dan hasil operasi pada Execute.' },
            { id: 4, type: 'trace', title: 'M4: REGISTER CRISIS', stage: 'TRACE', objective: 'Telusuri program tanpa bantuan langkah-per-langkah dan tentukan state akhir CPU.', hint: 'Tuliskan nilai R1 dan R2 setelah setiap baris. STORE tidak mengubah nilai register; ia hanya menyalin nilai ke memori.' },
            { id: 5, type: 'boss', title: 'M5: CORE MELTDOWN', stage: 'BOSS', objective: 'Jalankan Boss Program 6 instruksi. Pertahankan integritas CPU sampai instruksi terakhir.', hint: 'Boss tetap memakai aturan yang sama. Jangan terburu-buru: PC menentukan Fetch, opcode menentukan Decode, dan state saat ini menentukan Execute.' }
        ];

        let currentCyberLevel = 1;
        let crisisRuntime = null;
        let glitchRound = 0;
        let traceRound = 0;

        const decodeMeanings = {
            LOAD: 'Memasukkan nilai operand ke register tujuan.',
            ADD: 'Menjumlahkan operand dengan nilai register tujuan melalui ALU.',
            SUB: 'Mengurangi nilai register tujuan dengan operand melalui ALU.',
            STORE: 'Menyalin nilai register sumber ke alamat memori tujuan.',
            COMPARE: 'Membandingkan dua nilai dan memperbarui status/flag CPU.'
        };

        function ensureCpuCrisisGameState() {
            if (!learningProgress.game || learningProgress.game.version !== CPU_CRISIS_VERSION) {
                learningProgress.game = { version: CPU_CRISIS_VERSION, score: 0, completedMissions: [], missionStars: {}, bestScore: 0, updatedAt: nowMs(), resetAt: 0 };
                saveLearningProgress({ skipServer: true });
            }
            if (!Array.isArray(learningProgress.game.completedMissions)) learningProgress.game.completedMissions = [];
            if (!learningProgress.game.missionStars) learningProgress.game.missionStars = {};
            if (typeof learningProgress.game.score !== 'number') learningProgress.game.score = 0;
            if (typeof learningProgress.game.bestScore !== 'number') learningProgress.game.bestScore = 0;
        }

        function renderGameGate() {
            const locked = document.getElementById('gameLockPanel');
            const app = document.getElementById('cyberGameApp');
            if (!locked || !app) return;
            if (isGameUnlocked()) {
                locked.classList.add('hide');
                app.classList.remove('hide');
                updateCpuQuestSummary();
            } else {
                app.classList.add('hide');
                locked.classList.remove('hide');
            }
        }

        function cpuQuestUrl() {
            const params = new URLSearchParams({
                name: studentData.name || '',
                code: studentData.studentId || '',
                class: studentData.class || 'IX-A'
            });
            return `game/cpu-quest-3d.html?${params.toString()}`;
        }

        function launchCpuQuest3D() {
            if (!isGameUnlocked()) { renderGameGate(); return; }
            const frame = document.getElementById('cpuQuestFrame');
            const intro = document.getElementById('cpuQuestIntro');
            const wrap = document.getElementById('cpuQuestFrameWrap');
            if (!frame || !wrap) return;
            const target = cpuQuestUrl();
            if (!frame.src || !frame.src.includes('cpu-quest-3d.html')) frame.src = target;
            if (intro) intro.classList.add('hide');
            wrap.classList.remove('hide');
            updateCpuQuestSummary();
            const area = document.getElementById('mainContentArea');
            if (area) area.scrollTop = 0;
        }

        function openCpuQuestNewTab() {
            if (!isGameUnlocked()) return;
            window.open(cpuQuestUrl(), '_blank', 'noopener');
        }

        function updateCpuQuestSummary(progress) {
            const el = document.getElementById('cpuQuestSummary');
            if (!el) return;
            const p = progress || learningProgress.game3d || null;
            if (!p) {
                el.innerHTML = '<strong>Belum dimainkan.</strong><br>Mulai game untuk mencatat XP dan misi.';
                return;
            }
            const stage = Number(p.stage || 0);
            const xp = Number(p.xp || 0);
            const done = !!p.completed;
            el.innerHTML = `<strong>${done ? '✅ CPU stabil' : `Misi ${Math.min(stage,6)}/6`}</strong><br>XP: ${xp} · Jawaban benar: ${Number(p.correctAnswers||0)}`;
        }

        window.addEventListener('message', (event) => {
            if (event.origin !== location.origin || !event.data) return;
            if (event.data.type !== 'CPU_QUEST_PROGRESS' && event.data.type !== 'CPU_QUEST_COMPLETE') return;
            const p = event.data.progress || {};
            learningProgress.game3d = {
                studentId: p.studentId || studentData.studentId,
                name: p.name || studentData.name,
                klass: p.klass || studentData.class,
                stage: Number(p.stage || 0),
                xp: Number(p.xp || 0),
                completed: !!p.completed,
                correctAnswers: Number(p.correctAnswers || 0),
                wrongAnswers: Number(p.wrongAnswers || 0),
                updatedAt: nowMs()
            };
            saveLearningProgress({ skipServer: true });
            updateCpuQuestSummary(learningProgress.game3d);
            if (event.data.type === 'CPU_QUEST_COMPLETE') {
                showModal('CPU QUEST Selesai!', `Hebat ${studentData.name}! Kamu berhasil menstabilkan siklus CPU di dunia 3D dengan ${learningProgress.game3d.xp} XP.`, 'success');
            }
        });

        function gameShowScreen(id) {
            document.querySelectorAll('#cyberGameApp .game-screen').forEach(el => el.classList.add('hide'));
            const target = document.getElementById(id);
            if (target) target.classList.remove('hide');
        }

        function updateGameFocusButton() {
            const btn = document.getElementById('gameFocusBtn');
            const mainApp = document.getElementById('mainApp');
            if (!btn || !mainApp) return;
            const active = mainApp.classList.contains('game-immersive');
            btn.innerHTML = active
                ? '<i class="fas fa-compress-arrows-alt mr-2"></i><span>KELUAR MODE FOKUS</span>'
                : '<i class="fas fa-expand-arrows-alt mr-2"></i><span>MODE FOKUS</span>';
            btn.title = active ? 'Kembali ke tampilan pembelajaran' : 'Perbesar area game';
        }

        function toggleGameFocusMode() {
            const mainApp = document.getElementById('mainApp');
            const gameApp = document.getElementById('cyberGameApp');
            if (!mainApp || !gameApp || gameApp.classList.contains('hide')) return;
            mainApp.classList.toggle('game-immersive');
            updateGameFocusButton();
            const area = document.getElementById('mainContentArea');
            if (area) area.scrollTop = 0;
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeMobileNav();
                const mainApp = document.getElementById('mainApp');
                if (mainApp && mainApp.classList.contains('game-immersive')) {
                    mainApp.classList.remove('game-immersive');
                    updateGameFocusButton();
                }
            }
        });

        document.addEventListener('click', (event) => {
            const nav = document.getElementById('mainNavbar');
            const panel = document.getElementById('mobileNavPanel');
            if (!nav || !panel || panel.classList.contains('hide')) return;
            if (!nav.contains(event.target)) closeMobileNav();
        });

        function getRuntimeIntegrity() { return crisisRuntime ? Math.max(0, Math.min(100, crisisRuntime.integrity)) : 100; }
        function updateGameHud() {
            updateCpuQuestSummary();
        }

        function startCpuCrisis() { gameShowMap(); }

        function gameShowMap() {
            ensureCpuCrisisGameState();
            crisisRuntime = null;
            gameShowScreen('game-screen-map');
            const map = document.getElementById('gameLevelMap');
            const best = document.getElementById('gameBestScore');
            if (best) best.textContent = learningProgress.game.bestScore || 0;
            if (!map) return;
            const done = learningProgress.game.completedMissions;
            const firstIncomplete = cpuCrisisMissions.find(m => !done.includes(m.id));
            currentCyberLevel = firstIncomplete ? firstIncomplete.id : cpuCrisisMissions.length;
            map.innerHTML = cpuCrisisMissions.map(m => {
                const completed = done.includes(m.id);
                const unlocked = m.id === 1 || done.includes(m.id - 1) || completed;
                const cls = completed ? 'done' : (unlocked ? 'ready' : 'locked');
                const stars = learningProgress.game.missionStars?.[m.id] || 0;
                const icon = completed ? '<i class="fas fa-circle-check text-green-300"></i>' : (unlocked ? '<i class="fas fa-play text-cyan-300"></i>' : '<i class="fas fa-lock text-slate-500"></i>');
                return `<button type="button" ${unlocked ? `onclick="startCyberLevel(${m.id})"` : 'disabled'} class="crisis-mission ${cls}">
                    <div class="flex items-start justify-between gap-3"><div><div class="text-xs font-black tracking-[.16em] ${completed ? 'text-green-300' : 'text-rose-300'}">${m.stage}</div><div class="cyber-font text-lg font-bold text-white mt-1">${m.title}</div></div><div class="text-2xl">${icon}</div></div>
                    <p class="text-sm text-slate-400 mt-3 leading-relaxed">${m.objective}</p>
                    <div class="text-yellow-300 mt-4 text-sm font-bold">${completed ? '★'.repeat(stars) + '☆'.repeat(3-stars) : (unlocked ? 'SIAP DIMULAI' : 'TERKUNCI')}</div>
                </button>`;
            }).join('');
            if (done.length >= cpuCrisisMissions.length) gameShowComplete();
            updateGameHud();
        }

        function makeCycleProgram(missionId) {
            if (missionId === 1) return [
                { addr:1, op:'LOAD', dest:'R1', value:5, text:'LOAD R1, 5' },
                { addr:2, op:'ADD', dest:'R1', value:3, text:'ADD R1, 3' }
            ];
            if (missionId === 2) return [
                { addr:1, op:'LOAD', dest:'R1', value:4, text:'LOAD R1, 4' },
                { addr:2, op:'LOAD', dest:'R2', value:6, text:'LOAD R2, 6' },
                { addr:3, op:'ADD', dest:'R1', src:'R2', text:'ADD R1, R2' },
                { addr:4, op:'STORE', src:'R1', mem:8, text:'STORE R1, 08' }
            ];
            // Boss dibuat berubah setiap kali dimainkan agar tidak sekadar menghafal jawaban.
            const a = 3 + Math.floor(Math.random() * 5); // 3..7
            const b = 2 + Math.floor(Math.random() * 4); // 2..5
            const sub = 1 + Math.floor(Math.random() * 2); // 1..2
            return [
                { addr:1, op:'LOAD', dest:'R1', value:a, text:`LOAD R1, ${a}` },
                { addr:2, op:'LOAD', dest:'R2', value:b, text:`LOAD R2, ${b}` },
                { addr:3, op:'ADD', dest:'R1', src:'R2', text:'ADD R1, R2' },
                { addr:4, op:'SUB', dest:'R1', value:sub, text:`SUB R1, ${sub}` },
                { addr:5, op:'STORE', src:'R1', mem:8, text:'STORE R1, 08' },
                { addr:6, op:'COMPARE', left:'R1', right:'R2', text:'COMPARE R1, R2' }
            ];
        }

        function newRuntime(program, integrity=100) {
            return { program, pc:1, ir:'—', regs:{R1:0,R2:0}, memory:{8:0}, flag:'—', index:0, phase:'FETCH', integrity, combo:0, mistakes:0, hintUsed:false };
        }

        function startCyberLevel(id) {
            ensureCpuCrisisGameState();
            const mission = cpuCrisisMissions.find(m => m.id === id);
            if (!mission) return;
            const done = learningProgress.game.completedMissions;
            if (id > 1 && !done.includes(id - 1) && !done.includes(id)) return;
            currentCyberLevel = id;
            gameShowScreen('game-screen-play');
            document.getElementById('gamePlayTag').textContent = `MISI ${id} • ${mission.stage}`;
            document.getElementById('gamePlayTitle').textContent = mission.title;
            document.getElementById('gamePlayObjective').textContent = mission.objective;
            if (mission.type === 'cycle') { crisisRuntime = newRuntime(makeCycleProgram(id), 100); renderCycleMission(); }
            if (mission.type === 'glitch') { crisisRuntime = { integrity:100, combo:0, mistakes:0, hintUsed:false }; glitchRound = 0; renderGlitchMission(); }
            if (mission.type === 'trace') { crisisRuntime = { integrity:100, combo:0, mistakes:0, hintUsed:false }; traceRound = 0; renderTraceMission(); }
            if (mission.type === 'boss') { crisisRuntime = newRuntime(makeCycleProgram(5), 100); renderCycleMission(true); }
            updateGameHud();
        }

        function gameShowHint() {
            const mission = cpuCrisisMissions.find(m => m.id === currentCyberLevel);
            if (!mission || !crisisRuntime) return;
            crisisRuntime.hintUsed = true;
            learningProgress.game.score = Math.max(0, learningProgress.game.score - 75);
            learningProgress.game.updatedAt = nowMs();
            saveLearningProgress({ skipServer: true });
            updateGameHud();
            showModal('Petunjuk Mission Control', mission.hint + ' (-75 skor)', 'warning');
        }

        function phaseStripHtml() {
            const phases = ['FETCH','DECODE','EXECUTE'];
            const current = crisisRuntime.phase;
            const idx = phases.indexOf(current);
            return `<div class="grid grid-cols-3 gap-2 mb-5">${phases.map((p,i)=>`<div class="crisis-phase ${i<idx?'done':(p===current?'active':'')}">${i+1}. ${p}</div>`).join('')}</div>`;
        }

        function statePanelHtml() {
            return `<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
                <div class="crisis-register"><span class="text-slate-500 text-xs">PC</span><strong>${String(crisisRuntime.pc).padStart(2,'0')}</strong></div>
                <div class="crisis-register"><span class="text-slate-500 text-xs">IR</span><strong class="crisis-code text-base break-words">${crisisRuntime.ir}</strong></div>
                <div class="crisis-register"><span class="text-slate-500 text-xs">R1</span><strong>${crisisRuntime.regs.R1}</strong></div>
                <div class="crisis-register"><span class="text-slate-500 text-xs">R2</span><strong>${crisisRuntime.regs.R2}</strong></div>
                <div class="crisis-register"><span class="text-slate-500 text-xs">MEM[08]</span><strong>${crisisRuntime.memory[8]}</strong></div>
                <div class="crisis-register"><span class="text-slate-500 text-xs">FLAG</span><strong class="text-base">${crisisRuntime.flag}</strong></div>
            </div>`;
        }

        function renderCycleMission(isBoss=false) {
            if (!crisisRuntime) return;
            const engine = document.getElementById('gameEngine');
            const instr = crisisRuntime.program[crisisRuntime.index];
            if (!instr) { completeCyberLevel(currentCyberLevel); return; }
            let actionHtml = '';
            if (crisisRuntime.phase === 'FETCH') actionHtml = renderFetchDecisionHtml(instr);
            if (crisisRuntime.phase === 'DECODE') actionHtml = renderDecodeDecisionHtml(instr);
            if (crisisRuntime.phase === 'EXECUTE') actionHtml = renderExecuteDecisionHtml(instr);
            engine.innerHTML = `<div class="grid xl:grid-cols-[.85fr_1.15fr] gap-5">
                <div>
                    <div class="flex items-center justify-between gap-3 mb-3"><div><div class="text-cyan-300 font-black tracking-widest">PROGRAM MEMORY</div><div class="text-xs text-slate-500 mt-1">${isBoss?'Boss Program diacak pada setiap permainan.':'PC menunjuk instruksi berikutnya.'}</div></div><span class="crisis-badge text-yellow-300">${crisisRuntime.index+1}/${crisisRuntime.program.length}</span></div>
                    <div class="space-y-2">${crisisRuntime.program.map(p=>`<div class="crisis-memory-row ${p.addr===crisisRuntime.pc?'current':''} ${crisisRuntime.ir===p.text?'fetched':''}"><span class="crisis-code text-cyan-300">${String(p.addr).padStart(2,'0')}</span><span class="crisis-code">${p.text}</span></div>`).join('')}</div>
                </div>
                <div>
                    ${phaseStripHtml()}
                    ${statePanelHtml()}
                    <div class="border-t border-slate-700 pt-5">${actionHtml}</div>
                </div>
            </div>`;
            updateGameHud();
        }

        function renderFetchDecisionHtml(instr) {
            const addrs = crisisRuntime.program.map(p=>p.addr);
            return `<div class="mb-3"><div class="text-cyan-300 font-bold">FETCH CHALLENGE</div><p class="text-slate-400 mt-1">PC = <strong class="text-white">${String(crisisRuntime.pc).padStart(2,'0')}</strong>. Instruksi mana yang harus diambil ke Instruction Register?</p></div>
                <div class="grid sm:grid-cols-2 gap-3">${addrs.map(a=>`<button class="crisis-choice" onclick="answerFetch(${a})"><span class="text-cyan-300 crisis-code">Alamat ${String(a).padStart(2,'0')}</span></button>`).join('')}</div>`;
        }

        function answerFetch(addr) {
            const instr = crisisRuntime.program[crisisRuntime.index];
            if (addr !== crisisRuntime.pc || addr !== instr.addr) { registerGameMistake('Fetch salah: alamat yang dipilih harus sama dengan nilai Program Counter (PC).'); return; }
            crisisRuntime.ir = instr.text;
            crisisRuntime.phase = 'DECODE';
            rewardCorrect(60);
            renderCycleMission(currentCyberLevel===5);
        }

        function shuffled(arr) { return arr.map(v=>({v,r:Math.random()})).sort((a,b)=>a.r-b.r).map(x=>x.v); }
        function renderDecodeDecisionHtml(instr) {
            const ops = shuffled(['LOAD','ADD','SUB','STORE','COMPARE'].filter((v,i,a)=>a.indexOf(v)===i));
            const selected = [instr.op, ...ops.filter(x=>x!==instr.op).slice(0,3)];
            const finalOps = shuffled(selected);
            return `<div class="mb-3"><div class="text-purple-300 font-bold">DECODE CHALLENGE</div><p class="text-slate-400 mt-1">IR berisi <strong class="text-white crisis-code">${instr.text}</strong>. Apa makna instruksi ini?</p></div>
                <div class="grid gap-3">${finalOps.map(op=>`<button class="crisis-choice" onclick="answerDecode('${op}')"><span class="text-purple-300 font-black mr-2">${op}</span>${decodeMeanings[op]}</button>`).join('')}</div>`;
        }

        function answerDecode(op) {
            const instr = crisisRuntime.program[crisisRuntime.index];
            if (op !== instr.op) { registerGameMistake('Decode belum tepat. Perhatikan opcode/kata operasi pada Instruction Register.'); return; }
            crisisRuntime.phase = 'EXECUTE';
            rewardCorrect(70);
            renderCycleMission(currentCyberLevel===5);
        }

        function expectedExecution(instr) {
            const r = crisisRuntime.regs;
            if (instr.op === 'LOAD') return { label:`${instr.dest} menjadi ${instr.value}`, apply:()=>{ r[instr.dest]=instr.value; } };
            if (instr.op === 'ADD') {
                const addVal = instr.src ? r[instr.src] : instr.value;
                const result = r[instr.dest] + addVal;
                return { label:`${instr.dest} menjadi ${result}`, apply:()=>{ r[instr.dest]=result; } };
            }
            if (instr.op === 'SUB') {
                const subVal = instr.src ? r[instr.src] : instr.value;
                const result = r[instr.dest] - subVal;
                return { label:`${instr.dest} menjadi ${result}`, apply:()=>{ r[instr.dest]=result; } };
            }
            if (instr.op === 'STORE') return { label:`MEM[08] menjadi ${r[instr.src]}`, apply:()=>{ crisisRuntime.memory[instr.mem]=r[instr.src]; } };
            if (instr.op === 'COMPARE') {
                const left=r[instr.left], right=r[instr.right];
                const flag = left===right?'EQUAL':(left>right?'GREATER':'LESS');
                return { label:`FLAG menjadi ${flag}`, apply:()=>{ crisisRuntime.flag=flag; } };
            }
            return { label:'Tidak ada perubahan', apply:()=>{} };
        }

        function renderExecuteDecisionHtml(instr) {
            const exp = expectedExecution(instr);
            let distractors = [];
            if (instr.op === 'LOAD') distractors = [`${instr.dest} menjadi ${instr.value+1}`, 'MEM[08] berubah', 'PC kembali ke 00'];
            else if (instr.op === 'ADD' || instr.op === 'SUB') distractors = [`${instr.dest} tetap ${crisisRuntime.regs[instr.dest]}`, `${instr.dest} menjadi ${Math.max(0, crisisRuntime.regs[instr.dest]-1)}`, 'IR dikosongkan tanpa operasi'];
            else if (instr.op === 'STORE') distractors = [`${instr.src} menjadi 0`, 'MEM[08] tetap 0', 'R2 menjadi nilai R1'];
            else distractors = ['FLAG menjadi EQUAL', 'R1 menjadi 0', 'MEM[08] berubah'];
            const opts = shuffled([exp.label, ...distractors].slice(0,4));
            return `<div class="mb-3"><div class="text-green-300 font-bold">EXECUTE CHALLENGE</div><p class="text-slate-400 mt-1">Jika instruksi dijalankan dengan state sekarang, perubahan mana yang benar?</p></div>
                <div class="grid sm:grid-cols-2 gap-3">${opts.map((o,i)=>`<button class="crisis-choice" onclick='answerExecute(${JSON.stringify(o)})'>${o}</button>`).join('')}</div>`;
        }

        function answerExecute(label) {
            const instr = crisisRuntime.program[crisisRuntime.index];
            const exp = expectedExecution(instr);
            if (label !== exp.label) { registerGameMistake('Hasil Execute tidak cocok dengan state CPU saat ini. Cek nilai register dan operand.'); return; }
            exp.apply();
            rewardCorrect(90);
            crisisRuntime.index += 1;
            crisisRuntime.pc += 1;
            crisisRuntime.ir = '—';
            crisisRuntime.phase = 'FETCH';
            if (crisisRuntime.index >= crisisRuntime.program.length) completeCyberLevel(currentCyberLevel);
            else renderCycleMission(currentCyberLevel===5);
        }

        const glitchCases = [
            {
                title:'INSIDEN A — PC/IR MISMATCH',
                logs:[
                    'FETCH: PC=03 mengambil instruksi dari alamat 03 ke IR.',
                    'DECODE: IR="ADD R1, R2" ditafsirkan sebagai penjumlahan.',
                    'EXECUTE: CPU menjalankan instruksi dari alamat 04 meskipun PC masih 03.'
                ], bad:2,
                explain:'Kesalahan ada pada Execute: CPU tidak boleh tiba-tiba menjalankan instruksi lain yang tidak sedang berada di IR.'
            },
            {
                title:'INSIDEN B — WRONG DECODE',
                logs:[
                    'FETCH: PC=02 mengambil "STORE R1, 08" ke IR.',
                    'DECODE: Control Unit menafsirkan STORE sebagai perintah menjumlahkan R1 dengan 08.',
                    'EXECUTE: Nilai R1 seharusnya disalin ke alamat memori 08.'
                ], bad:1,
                explain:'STORE adalah instruksi penyimpanan, bukan penjumlahan.'
            },
            {
                title:'INSIDEN C — ALU RESULT',
                logs:[
                    'FETCH: IR menerima "ADD R1, R2".',
                    'DECODE: ADD meminta ALU menjumlahkan R1 dan R2.',
                    'EXECUTE: R1=7 dan R2=4 menghasilkan R1=10.'
                ], bad:2,
                explain:'7 + 4 = 11, sehingga hasil ALU 10 menunjukkan glitch pada Execute.'
            }
        ];

        function renderGlitchMission() {
            const c = glitchCases[glitchRound];
            if (!c) { completeCyberLevel(3); return; }
            const engine = document.getElementById('gameEngine');
            engine.innerHTML = `<div class="max-w-4xl mx-auto"><div class="flex items-center justify-between gap-3 mb-5"><div><div class="text-rose-300 font-black">GLITCH HUNT ${glitchRound+1}/3</div><h4 class="cyber-font text-2xl text-white mt-1">${c.title}</h4></div><span class="crisis-badge text-amber-300">Pilih log yang salah</span></div><div class="space-y-3">${c.logs.map((l,i)=>`<button class="crisis-log w-full text-left" onclick="answerGlitch(${i})"><span class="text-slate-500 font-bold mr-2">LOG ${i+1}</span>${l}</button>`).join('')}</div><div class="mt-5 text-sm text-slate-500">Baca sebagai satu rangkaian. Cari bagian yang tidak konsisten dengan state CPU sebelumnya.</div></div>`;
            updateGameHud();
        }
        function answerGlitch(index) {
            const c = glitchCases[glitchRound];
            if (index !== c.bad) { registerGameMistake('Log itu masih konsisten. Cari bagian yang melanggar urutan atau state CPU.'); return; }
            rewardCorrect(140);
            showModal('Glitch Ditemukan!', c.explain, 'success');
            glitchRound += 1;
            if (glitchRound >= glitchCases.length) completeCyberLevel(3); else renderGlitchMission();
        }

        const traceCases = [
            { program:['LOAD R1, 7','LOAD R2, 2','ADD R1, R2','SUB R1, 1','STORE R1, 08'], answer:'R1=8 • R2=2 • MEM[08]=8', options:['R1=8 • R2=2 • MEM[08]=8','R1=9 • R2=2 • MEM[08]=9','R1=6 • R2=2 • MEM[08]=8','R1=8 • R2=1 • MEM[08]=0'] },
            { program:['LOAD R1, 3','LOAD R2, 5','ADD R1, R2','ADD R1, 2','STORE R1, 08'], answer:'R1=10 • R2=5 • MEM[08]=10', options:['R1=8 • R2=5 • MEM[08]=8','R1=10 • R2=5 • MEM[08]=10','R1=10 • R2=7 • MEM[08]=0','R1=5 • R2=3 • MEM[08]=10'] }
        ];
        function renderTraceMission() {
            const c = traceCases[traceRound];
            if (!c) { completeCyberLevel(4); return; }
            const engine = document.getElementById('gameEngine');
            engine.innerHTML = `<div class="grid lg:grid-cols-[.8fr_1.2fr] gap-6"><div><div class="text-yellow-300 font-black mb-3">PROGRAM TRACE ${traceRound+1}/2</div><div class="space-y-2">${c.program.map((p,i)=>`<div class="crisis-memory-row"><span class="crisis-code text-cyan-300">${String(i+1).padStart(2,'0')}</span><span class="crisis-code">${p}</span></div>`).join('')}</div></div><div><h4 class="cyber-font text-2xl text-white mb-3">TENTUKAN STATE AKHIR</h4><p class="text-slate-400 mb-5">Mulai dari R1=0, R2=0, MEM[08]=0. Jalankan seluruh instruksi di kepala atau di kertas, lalu pilih state akhir yang benar.</p><div class="space-y-3">${shuffled(c.options).map(o=>`<button class="crisis-choice" onclick='answerTrace(${JSON.stringify(o)})'>${o}</button>`).join('')}</div></div></div>`;
            updateGameHud();
        }
        function answerTrace(answer) {
            const c = traceCases[traceRound];
            if (answer !== c.answer) { registerGameMistake('State akhir belum tepat. Telusuri nilai register setelah setiap instruksi, bukan hanya operasi terakhir.'); return; }
            rewardCorrect(180);
            traceRound += 1;
            if (traceRound >= traceCases.length) completeCyberLevel(4); else renderTraceMission();
        }

        function rewardCorrect(base) {
            if (!crisisRuntime) return;
            crisisRuntime.combo = (crisisRuntime.combo || 0) + 1;
            const bonus = Math.min(100, (crisisRuntime.combo - 1) * 10);
            learningProgress.game.score += base + bonus;
            learningProgress.game.updatedAt = nowMs();
            saveLearningProgress({ skipServer: true });
            updateGameHud();
        }

        function registerGameMistake(message) {
            if (!crisisRuntime) return;
            crisisRuntime.mistakes = (crisisRuntime.mistakes || 0) + 1;
            crisisRuntime.combo = 0;
            crisisRuntime.integrity = Math.max(0, crisisRuntime.integrity - 15);
            learningProgress.game.score = Math.max(0, learningProgress.game.score - 40);
            learningProgress.game.updatedAt = nowMs();
            saveLearningProgress({ skipServer: true });
            updateGameHud();
            if (crisisRuntime.integrity <= 0) {
                showModal('Misi Gagal — Core Offline', 'Integritas CPU mencapai 0%. Misi akan diulang dari awal, tetapi progres pembelajaranmu tetap aman.', 'error');
                setTimeout(()=>startCyberLevel(currentCyberLevel), 350);
                return;
            }
            showModal('Sinyal Salah', `${message} Integritas tersisa ${crisisRuntime.integrity}%.`, 'warning');
        }

        function completeCyberLevel(id) {
            ensureCpuCrisisGameState();
            const completed = learningProgress.game.completedMissions;
            if (!completed.includes(id)) completed.push(id);
            learningProgress.game.completedMissions = completed.sort((a,b)=>a-b);
            let stars = 3;
            if (crisisRuntime?.hintUsed) stars -= 1;
            if ((crisisRuntime?.integrity ?? 100) < 80) stars -= 1;
            if ((crisisRuntime?.integrity ?? 100) < 50) stars = 1;
            stars = Math.max(1, stars);
            learningProgress.game.missionStars[id] = Math.max(learningProgress.game.missionStars[id] || 0, stars);
            learningProgress.game.score += 250 + stars * 75;
            learningProgress.game.bestScore = Math.max(learningProgress.game.bestScore || 0, learningProgress.game.score);
            learningProgress.game.updatedAt = nowMs();
            saveLearningProgress({ event: `GAME_MISSION_${id}_COMPLETE`, forceServer: true });
            if (id >= cpuCrisisMissions.length) gameShowComplete();
            else {
                showModal('Misi Berhasil!', `Mission ${id} selesai dengan ${stars} bintang. Mission berikutnya telah dibuka.`, 'success');
                gameShowMap();
            }
        }

        function gameShowComplete() {
            ensureCpuCrisisGameState();
            gameShowScreen('game-screen-complete');
            learningProgress.game.bestScore = Math.max(learningProgress.game.bestScore || 0, learningProgress.game.score || 0);
            learningProgress.game.updatedAt = nowMs();
            saveLearningProgress({ event: 'GAME_COMPLETE', forceServer: true });
            const f = document.getElementById('gameFinalScore');
            const rank = document.getElementById('gameFinalRank');
            if (f) f.textContent = learningProgress.game.score || 0;
            const s = learningProgress.game.score || 0;
            if (rank) rank.textContent = s >= 5000 ? 'CORE ARCHITECT' : (s >= 3500 ? 'SYSTEM ENGINEER' : (s >= 2200 ? 'CPU SPECIALIST' : 'CPU OPERATOR'));
            updateGameHud();
        }

        function resetCyberGame() {
            const best = learningProgress.game?.bestScore || 0;
            const resetAt = nowMs();
            learningProgress.game = { version: CPU_CRISIS_VERSION, score: 0, completedMissions: [], missionStars: {}, bestScore: best, updatedAt: resetAt, resetAt };
            saveLearningProgress({ event: 'GAME_RESET', forceServer: true });
            crisisRuntime = null;
            gameShowMap();
        }

        function showModal(title, message, type = "success", afterClose = null, actionLabel = 'Tutup & Lanjutkan') {
            const modal = document.getElementById("customModal");
            const modalTitle = document.getElementById("modalTitle");
            const modalMessage = document.getElementById("modalMessage");
            const modalIcon = document.getElementById("modalIcon");
            const modalContent = document.getElementById("modalContent");
            const modalActionButton = document.getElementById('modalActionButton');

            // Setiap modal menentukan sendiri apakah ada tindakan setelah ditutup.
            // Ini mencegah callback lama ikut terpanggil pada modal berikutnya.
            modalAfterCloseAction = typeof afterClose === 'function' ? afterClose : null;
            modalActionLabel = actionLabel || 'Tutup & Lanjutkan';

            modalTitle.innerText = title;
            modalMessage.innerText = message;
            if (modalActionButton) modalActionButton.innerHTML = `<i class="fas fa-arrow-right mr-2"></i>${modalActionLabel}`;

            if (type === "success") {
                modalIcon.innerHTML = `<i class="fas fa-check-circle text-green-500 drop-shadow-md"></i>`;
            } else if (type === "error") {
                modalIcon.innerHTML = `<i class="fas fa-times-circle text-red-500 drop-shadow-md"></i>`;
            } else {
                modalIcon.innerHTML = `<i class="fas fa-exclamation-triangle text-amber-500 drop-shadow-md"></i>`;
            }

            modal.classList.remove("hide");
            // Sedikit delay agar animasi CSS transition berjalan
            setTimeout(() => {
                modal.classList.remove("opacity-0");
                modalContent.classList.remove("scale-95");
                modalContent.classList.add("scale-100");
            }, 10);
        }

        window.addEventListener('beforeunload', () => {
            try { persistLocalProgress(); } catch (e) {}
        });

        function closeModal() {
            const modal = document.getElementById("customModal");
            const modalContent = document.getElementById("modalContent");
            const afterClose = modalAfterCloseAction;
            modalAfterCloseAction = null;
            
            modal.classList.add("opacity-0");
            modalContent.classList.remove("scale-100");
            modalContent.classList.add("scale-95");
            
            setTimeout(() => {
                modal.classList.add("hide");
                if (afterClose) {
                    try { afterClose(); } catch (err) { console.error('Gagal melanjutkan tahap pembelajaran:', err); }
                }
            }, 300); // Sinkron dengan durasi transition-opacity (300ms)
        }