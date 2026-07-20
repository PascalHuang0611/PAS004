let currentChart = null;
let currentRtpRoundChart = null;
let currentSummaryBarChart = null;
let currentRtpDistChart = null;
let currentMaxWinDistChart = null;
let currentMaxLossDistChart = null;
let globalData = [];
let rawData = []; // 未截斷的原始報表資料
let allReports = {};
let currentSortCol = null;
let currentSortAsc = false; // 預設降冪排序
let currentSystem = 'B';
let currentRoundLimit = 200; // 顯示前 N 局

const CHART_COLORS = {
    1: '#3b82f6',  // Blue
    5: '#10b981',  // Emerald Green
    10: '#f59e0b', // Amber/Orange
    2: '#8b5cf6',  // Purple
    20: '#ec4899', // Pink
    50: '#06b6d4'  // Cyan
};
const FALLBACK_COLORS = ['#ef4444', '#64748b', '#14b8a6', '#f43f5e'];

function getGroupColorHex(bet, fallbackIdx = 0) {
    if (CHART_COLORS[bet]) return CHART_COLORS[bet];
    return FALLBACK_COLORS[fallbackIdx % FALLBACK_COLORS.length];
}

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

document.addEventListener("DOMContentLoaded", () => {
    const fileInput = document.getElementById('file-upload');
    const fileNameDisplay = document.getElementById('file-name');
    
    // Modal logic
    const modal = document.getElementById('player-modal');
    const closeBtn = document.querySelector('.close-btn');
    if (closeBtn) {
        closeBtn.onclick = function() {
            modal.style.display = "none";
        }
    }
    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    }
    
    const uploadSection = document.getElementById('upload-section');
    const controlsSection = document.getElementById('controls-section');
    const sysBtns = document.querySelectorAll('.sys-btn[data-system]');
    
    let currentConfig = null; // e.g. "buffer_1_3_pre_40"
    let currentDist = 'unequal'; // "unequal" or "equal"
    let currentRun = 'run_1'; // "run_1", "run_2", "run_3"

    // 14種已知參數設定
    const bufferRanges = [[1, 3], [1, 10], [1, 20], [1, 40], [10, 20], [10, 30], [20, 40]];
    const preFunds = [35, 65, 95];
    const knownConfigs = [];
    bufferRanges.forEach(b => {
        preFunds.forEach(p => {
            knownConfigs.push(`buffer_${b[0]}_${b[1]}_pre_${p}`);
        });
    });

    // 盲測版:每次進入隨機起點 (隨機系統 × 隨機參數),避免所有人都從同一個系統看起的錨定效應
    if (window.BLIND_MODE) {
        const systems = ['B', 'C', 'D', 'E', 'F', 'G', 'H'];
        currentSystem = systems[Math.floor(Math.random() * systems.length)];
        currentConfig = knownConfigs[Math.floor(Math.random() * knownConfigs.length)];
        document.querySelectorAll('.sys-btn[data-system]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.system === currentSystem);
        });
    }

    // 各系統建議優先檢視的三組參數 (依玩家配置區分,不分名次)
    // 每個系統只跟自己的 21 組參數比較;來源:系統評比閱讀指南.md 的離線分析結果
    const TOP_CONFIGS = {
        unequal: {
            B: ['buffer_1_10_pre_95', 'buffer_1_10_pre_35', 'buffer_1_3_pre_65'],
            C: ['buffer_10_20_pre_65', 'buffer_1_10_pre_35', 'buffer_1_20_pre_95'],
            D: ['buffer_1_10_pre_65', 'buffer_1_3_pre_35', 'buffer_1_3_pre_65'],
            E: ['buffer_20_40_pre_95', 'buffer_1_3_pre_95', 'buffer_10_20_pre_95'],
            F: ['buffer_1_10_pre_65', 'buffer_1_3_pre_65', 'buffer_1_20_pre_65'],
            G: ['buffer_10_30_pre_65', 'buffer_1_3_pre_95', 'buffer_1_40_pre_35'],
            H: ['buffer_1_3_pre_35', 'buffer_1_3_pre_65', 'buffer_1_3_pre_95']
        },
        equal: {
            B: ['buffer_1_10_pre_95', 'buffer_1_10_pre_35', 'buffer_1_10_pre_65'],
            C: ['buffer_1_3_pre_65', 'buffer_1_10_pre_35', 'buffer_1_10_pre_65'],
            D: ['buffer_1_10_pre_65', 'buffer_1_3_pre_35', 'buffer_1_3_pre_65'],
            E: ['buffer_1_20_pre_95', 'buffer_1_10_pre_35', 'buffer_10_30_pre_95'],
            F: ['buffer_1_20_pre_65', 'buffer_1_3_pre_65', 'buffer_10_20_pre_95'],
            G: ['buffer_1_20_pre_65', 'buffer_20_40_pre_65', 'buffer_1_40_pre_65'],
            H: ['buffer_1_3_pre_35', 'buffer_1_3_pre_65', 'buffer_1_10_pre_65']
        }
    };

    // 讀取比對工具頁儲存的自訂權重結果 (無或無效則回傳 null → 使用預設)
    function getCustomTopConfigs() {
        try {
            const raw = localStorage.getItem('pas004_custom_weights');
            if (!raw) return null;
            const stored = JSON.parse(raw);
            return (stored && stored.topConfigs) ? stored.topConfigs : null;
        } catch (e) {
            return null;
        }
    }

    // 依目前的系統與玩家配置,標出建議優先檢視的參數 (三組不分名次,統一同色)
    // 有本地自訂權重時採用自訂結果,否則用預設;右上角同步標示來源
    function applyRankHighlight() {
        const custom = getCustomTopConfigs();
        const source = custom || TOP_CONFIGS;
        const picks = (source[currentDist] || {})[currentSystem] || [];
        const tip = custom ? '本系統建議優先檢視的參數組合 (自訂權重)' : '本系統建議優先檢視的參數組合 (預設權重)';

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('rank-pick');
            btn.removeAttribute('title');
        });
        picks.forEach(cfg => {
            const btn = document.querySelector(`.tab-btn[data-config="${cfg}"]`);
            if (btn) {
                btn.classList.add('rank-pick');
                btn.title = tip;
            }
        });

        // 右上角來源標示
        let badge = document.getElementById('rec-source-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'rec-source-badge';
            document.body.appendChild(badge);
        }
        badge.textContent = custom ? '⭐ 推薦標記:自訂權重' : '⭐ 推薦標記:預設權重';
        badge.classList.toggle('custom', !!custom);
    }

    // 比對工具頁在其他分頁修改自訂權重時,即時同步標記
    window.addEventListener('storage', (e) => {
        if (e.key === 'pas004_custom_weights') applyRankHighlight();
    });

    // 改為按需載入 (Lazy Load) 以避免一次抓取 294 份巨大報表導致瀏覽器當機
    async function tryAutoLoad() {
        fileNameDisplay.textContent = '嘗試自動連線並讀取報表...';
        allReports = {};
        
        try {
            // 先測試是否能成功 fetch 第一份檔案 (確認伺服器環境/CORS沒問題)
            const testPath = `reports/run_1/unequal_${knownConfigs[0]}/simulation_b_log.json`;
            const res = await fetch(testPath, { method: 'HEAD' });
            if (!res.ok) throw new Error("HTTP error");
            
            // 測試成功，進入自動按需加載模式
            fileNameDisplay.textContent = '系統就緒，點擊下方分頁載入對應報表';
            setupUIAfterLoad();
        } catch (e) {
            // 測試失敗 (可能是在本地直接打開 file:/// 的環境)
            // 不啟動自動 UI，保留手動上傳按鈕
            fileNameDisplay.textContent = '本地環境無法自動讀取，請手動選擇 Reports 資料夾上傳';
        }
    }

    // 建立頁籤與切換邏輯
    function setupUIAfterLoad() {
        uploadSection.style.display = 'none';
        controlsSection.style.display = 'flex';
        
        const tabs35 = document.getElementById('tabs-container-35');
        const tabs65 = document.getElementById('tabs-container-65');
        const tabs95 = document.getElementById('tabs-container-95');
        tabs35.innerHTML = '';
        tabs65.innerHTML = '';
        tabs95.innerHTML = '';
        
        currentConfig = currentConfig || knownConfigs[0];

        initFloatingPanel();

        knownConfigs.forEach(config => {
            // 由於改為按需載入，我們預設所有已知配置都存在報表
            const btn = document.createElement('button');
            btn.className = `tab-btn ${config === currentConfig ? 'active' : ''}`;
            btn.dataset.config = config;

            // 格式化名稱顯示
            const parts = config.split('_');
            const name = `Buffer ${parts[1]}~${parts[2]}`;
            btn.textContent = name;
            
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentConfig = config;
                loadCurrentSelection();
            });
            
            if (config.includes('pre_35')) {
                tabs35.appendChild(btn);
            } else if (config.includes('pre_65')) {
                tabs65.appendChild(btn);
            } else {
                tabs95.appendChild(btn);
            }
        });

        loadCurrentSelection();
    }

    // 根據目前的 system, dist 與 config 載入資料 (改為按需 fetch)
    async function loadCurrentSelection() {
        if (!currentConfig) return;
        applyRankHighlight();
        const path = `reports/${currentRun}/${currentDist}_${currentConfig}/simulation_${currentSystem.toLowerCase()}_log.json`;
        
        fileNameDisplay.textContent = `正在讀取報表: ${path} ...`;
        
        // 如果已經在暫存中就直接用
        if (allReports[path]) {
            renderData(allReports[path]);
            fileNameDisplay.textContent = `目前顯示: ${path}`;
            return;
        }

        try {
            const res = await fetch(path);
            if (!res.ok) throw new Error("HTTP error " + res.status);
            const data = await res.json();
            
            // 快取起來
            allReports[path] = data;
            renderData(data);
            fileNameDisplay.textContent = `目前顯示: ${path}`;
        } catch (error) {
            alert(`找不到 ${currentSystem} 系統在 ${currentConfig} 的數據，或載入失敗。`);
            fileNameDisplay.textContent = `載入失敗: ${path}`;
        }
    }

    function renderData(data) {
        rawData = data;
        applyRoundLimit();
    }

    // 依 currentRoundLimit 將原始資料截斷成「前 N 局視圖」
    // rtp/maxWin/maxLoss 等統計欄位一律由 processData 從截斷後的 history 重算,此處不預算
    function applyRoundLimit() {
        const N = currentRoundLimit;
        globalData = rawData.map(p => {
            const hist = p.history.slice(0, N);
            return {
                ...p,
                history: hist,
                totalPlays: hist.length,
                // balanceAfter 是累計值,截斷後的損益直接取最後一筆
                finalBalance: hist.length ? hist[hist.length - 1].balanceAfter : 0
            };
        });
        // 重設排序狀態
        currentSortCol = null;
        currentSortAsc = false;
        document.querySelectorAll("th.sortable").forEach(h => {
            h.classList.remove('asc', 'desc');
        });
        processData(globalData);
    }

    // 系統切換器
    sysBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            sysBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentSystem = e.target.dataset.system;
            loadCurrentSelection();
        });
    });

    // 模擬批次切換器
    const runBtns = document.querySelectorAll('.run-btn');
    runBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            runBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentRun = e.target.dataset.run;
            loadCurrentSelection();
        });
    });

    // 顯示局數切換器 (純前端截斷,不需重新抓資料)
    const roundsBtns = document.querySelectorAll('.rounds-btn');
    roundsBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            roundsBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentRoundLimit = parseInt(e.target.dataset.rounds);
            if (rawData.length > 0) applyRoundLimit();
        });
    });

    // 玩家配置切換器
    const distBtns = document.querySelectorAll('.dist-btn');
    distBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            distBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentDist = e.target.dataset.dist;
            // 可能某些配置沒資料，重整分頁鈕
            setupUIAfterLoad(); 
        });
    });

    // 保留手動上傳邏輯
    if (fileInput) {
        fileInput.addEventListener('change', async (event) => {
            const files = event.target.files;
            if (!files || files.length === 0) return;

            fileNameDisplay.textContent = '讀取中...';
            allReports = {};

            const jsonFiles = Array.from(files).filter(f => f.name.endsWith('.json'));
            const totalFiles = jsonFiles.length;
            let loadedCount = 0;

            for (let i = 0; i < jsonFiles.length; i++) {
                const file = jsonFiles[i];
                loadedCount++;
                if (loadedCount % 5 === 0 || loadedCount === totalFiles) {
                    fileNameDisplay.textContent = `讀取中... (${loadedCount}/${totalFiles})`;
                }
                
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                        // 嘗試從路徑中重組 "reports/buffer_1_3_pre_40/simulation_b_log.json" 的格式
                        // 避免使用者上傳的資料夾名稱不叫 reports
                        let pathName = file.webkitRelativePath || file.name;
                        
                        // 我們強制將路徑正規化為我們認識的格式，以配合頁籤邏輯
                        let system = 'b';
                        if (pathName.includes('_c_log')) system = 'c';
                        if (pathName.includes('_d_log')) system = 'd';
                        if (pathName.includes('_e_log')) system = 'e';
                        if (pathName.includes('_f_log')) system = 'f';
                        if (pathName.includes('_g_log')) system = 'g';
                        if (pathName.includes('_h_log')) system = 'h';
                        let configMatch = pathName.match(/buffer_\d+_\d+_pre_\d+/);
                        let distMatch = pathName.match(/(unequal|equal)_buffer/);
                        let runMatch = pathName.match(/run_[1-3]/);
                        if (configMatch && distMatch) {
                            let dist = distMatch[1];
                            let run = runMatch ? runMatch[0] : 'run_1';
                            allReports[`reports/${run}/${dist}_${configMatch[0]}/simulation_${system}_log.json`] = data;
                        } else {
                            // 若無正規格式，就直接存起來 (此情況下頁籤可能不會正常顯示，但這是一個 fallback)
                            allReports[pathName] = data;
                        }
                    } catch (error) {
                        console.error("Error parsing JSON:", error);
                    }
            }

            if (Object.keys(allReports).length > 0) {
                setupUIAfterLoad();
            } else {
                fileNameDisplay.textContent = '資料夾內沒有找到 JSON 報告';
            }
        });
    }

    // ==========================================
    // 懸浮快速切換面板
    // 所有操作都代理點擊頁首的原始按鈕,狀態單一來源
    // ==========================================
    function initFloatingPanel() {
        if (document.getElementById('fp-fab')) {
            syncFloatingPanel();
            return;
        }

        const fab = document.createElement('button');
        fab.id = 'fp-fab';
        fab.title = '快速切換選項';
        fab.textContent = '🎛';
        document.body.appendChild(fab);

        const panel = document.createElement('div');
        panel.id = 'floating-switcher';
        panel.innerHTML = `
            <div class="fp-title"><span>快速切換</span><span id="fp-close" title="收合">&times;</span></div>
            <div class="fp-row"><label>批次</label><select id="fp-run" class="fp-select">
                <option value="run_1">Run 1</option>
                <option value="run_2">Run 2</option>
                <option value="run_3">Run 3</option>
            </select></div>
            <div class="fp-row"><label>配置</label><select id="fp-dist" class="fp-select">
                <option value="unequal">不均等 (100/10/2)</option>
                <option value="equal">均等 (每BET 100人)</option>
            </select></div>
            <div class="fp-row"><label>系統</label><div class="fp-sys" id="fp-sys"></div></div>
            <div class="fp-row"><label>預墊</label><select id="fp-pre" class="fp-select">
                <option value="35">35%</option>
                <option value="65">65%</option>
                <option value="95">95%</option>
            </select></div>
            <div class="fp-row"><label>Buffer</label><select id="fp-buffer" class="fp-select">
                ${bufferRanges.map(b => `<option value="${b[0]}_${b[1]}">Buffer ${b[0]}~${b[1]}</option>`).join('')}
            </select></div>
            <div class="fp-row"><label>局數</label><select id="fp-rounds" class="fp-select">
                ${[5, 10, 15, 20, 50, 100, 200].map(n => `<option value="${n}">前 ${n} 局</option>`).join('')}
            </select></div>
        `;
        document.body.appendChild(panel);

        // 系統 B~H 小按鈕
        const fpSys = panel.querySelector('#fp-sys');
        document.querySelectorAll('.sys-btn[data-system]').forEach(srcBtn => {
            const b = document.createElement('button');
            b.textContent = srcBtn.dataset.system;
            b.dataset.system = srcBtn.dataset.system;
            b.addEventListener('click', () => {
                document.querySelector(`.sys-btn[data-system="${b.dataset.system}"]`).click();
            });
            fpSys.appendChild(b);
        });

        panel.querySelector('#fp-run').addEventListener('change', (e) => {
            document.querySelector(`.run-btn[data-run="${e.target.value}"]`).click();
        });
        panel.querySelector('#fp-dist').addEventListener('change', (e) => {
            document.querySelector(`.dist-btn[data-dist="${e.target.value}"]`).click();
        });

        // 預墊/Buffer 變更 → 點擊對應的頁籤按鈕
        function clickConfigTab() {
            const pre = panel.querySelector('#fp-pre').value;
            const buf = panel.querySelector('#fp-buffer').value.replace('_', '~');
            const container = document.getElementById(`tabs-container-${pre}`);
            if (!container) return;
            const target = [...container.querySelectorAll('.tab-btn')]
                .find(btn => btn.textContent.trim() === `Buffer ${buf}`);
            if (target) target.click();
        }
        panel.querySelector('#fp-pre').addEventListener('change', clickConfigTab);
        panel.querySelector('#fp-buffer').addEventListener('change', clickConfigTab);

        panel.querySelector('#fp-rounds').addEventListener('change', (e) => {
            const target = document.querySelector(`.rounds-btn[data-rounds="${e.target.value}"]`);
            if (target) target.click();
        });

        fab.addEventListener('click', () => {
            const opening = panel.style.display !== 'block';
            panel.style.display = opening ? 'block' : 'none';
            if (opening) syncFloatingPanel();
        });
        panel.querySelector('#fp-close').addEventListener('click', () => {
            panel.style.display = 'none';
        });

        // 頁首控制區在畫面內時,隱藏懸浮按鈕與面板
        function updateFabVisibility() {
            const rect = controlsSection.getBoundingClientRect();
            const headerVisible = rect.bottom > 0 && rect.top < window.innerHeight;
            fab.style.display = headerVisible ? 'none' : 'flex';
            if (headerVisible) panel.style.display = 'none';
        }
        window.addEventListener('scroll', updateFabVisibility, { passive: true });
        window.addEventListener('resize', updateFabVisibility, { passive: true });
        updateFabVisibility();

        // 使用者直接點頁首按鈕時,同步面板顯示狀態
        document.addEventListener('click', (e) => {
            if (e.target.closest('.sys-btn, .tab-btn')) {
                setTimeout(syncFloatingPanel, 0);
            }
        });

        syncFloatingPanel();
    }

    function syncFloatingPanel() {
        const panel = document.getElementById('floating-switcher');
        if (!panel) return;

        const activeRun = document.querySelector('.run-btn.active');
        if (activeRun) panel.querySelector('#fp-run').value = activeRun.dataset.run;

        const activeDist = document.querySelector('.dist-btn.active');
        if (activeDist) panel.querySelector('#fp-dist').value = activeDist.dataset.dist;

        const activeSys = document.querySelector('.sys-btn.active[data-system]');
        panel.querySelectorAll('#fp-sys button').forEach(b => {
            b.classList.toggle('active', !!activeSys && b.dataset.system === activeSys.dataset.system);
        });

        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab) {
            const pre = activeTab.parentElement.id.replace('tabs-container-', '');
            panel.querySelector('#fp-pre').value = pre;
            const m = activeTab.textContent.match(/Buffer (\d+)~(\d+)/);
            if (m) panel.querySelector('#fp-buffer').value = `${m[1]}_${m[2]}`;
        }

        const activeRounds = document.querySelector('.rounds-btn.active');
        if (activeRounds) panel.querySelector('#fp-rounds').value = activeRounds.dataset.rounds;
    }

    // 網頁載入時立刻嘗試自動讀取
    tryAutoLoad();

    // 監聽 RTP 分佈圖顆粒度變更
    const binSizeSelect = document.getElementById('rtp-bin-size');
    if (binSizeSelect) {
        binSizeSelect.addEventListener('change', () => {
            if (globalData && globalData.length > 0) {
                drawRtpDistributionChart(globalData);
            }
        });
    }
});

function processData(data) {
    let totalBetAll = 0;
    let totalReturnAll = 0;
    
    // 用來記錄全域改判佔比
    window.globalTotalChanged = 0;
    window.globalTotalPlays = 0;
    window.systemHasChangedOutcomes = false;
    
    // 用於圖表：依據 betAmount 分組記錄每一局的勝負
    const betGroups = {};
    
    data.forEach(player => {
        // 計算這名玩家的總下注金額與總回報
        const totalBet = player.betAmount * player.totalPlays;
        const totalReturn = totalBet + player.finalBalance;
        
        totalBetAll += totalBet;
        totalReturnAll += totalReturn;
        
        // 該玩家 RTP
        player.rtp = (totalReturn / totalBet) * 100;
        
        // 預先計算每個人的最大連贏與最大連輸
        let maxWinStreak = 0;
        let currentWinStreak = 0;
        let maxLossStreak = 0;
        let currentLossStreak = 0;

        player.history.forEach(round => {
            if (round.result === "Win") {
                currentWinStreak++;
                currentLossStreak = 0;
                if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
            } else {
                currentLossStreak++;
                currentWinStreak = 0;
                if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
            }
            
            if (round.wasChanged) {
                window.globalTotalChanged++;
                window.systemHasChangedOutcomes = true;
            }
        });
        
        window.globalTotalPlays += player.totalPlays;
        
        player.maxWin = maxWinStreak;
        player.maxLoss = maxLossStreak;

        // 統計各 BET 群組的勝率與 RTP
        if (!betGroups[player.betAmount]) {
            betGroups[player.betAmount] = {
                players: 0,
                totalBet: 0,
                totalReturn: 0,
                rounds: []
            };
        }
        
        betGroups[player.betAmount].players++;
        betGroups[player.betAmount].totalBet += totalBet;
        betGroups[player.betAmount].totalReturn += totalReturn;
        
        player.history.forEach(roundData => {
            const rIdx = roundData.round - 1; // Array is 0-indexed
            if (!betGroups[player.betAmount].rounds[rIdx]) {
                betGroups[player.betAmount].rounds[rIdx] = { wins: 0, total: 0, totalChange: 0 };
            }
            if (roundData.result === "Win") {
                betGroups[player.betAmount].rounds[rIdx].wins++;
            }
            betGroups[player.betAmount].rounds[rIdx].total++;
            betGroups[player.betAmount].rounds[rIdx].totalChange += roundData.change;
        });
    });
    
    // 更新上方的 Summary 卡片
    document.getElementById("total-players").textContent = data.length;
    const overallRtp = (totalReturnAll / totalBetAll) * 100;
    document.getElementById("overall-rtp").textContent = overallRtp.toFixed(2) + "%";
    
    // 渲染全域改判佔比
    const changedRateEl = document.getElementById('global-changed-rate');
    if (changedRateEl) {
        if (window.systemHasChangedOutcomes && window.globalTotalPlays > 0) {
            const rate = (window.globalTotalChanged / window.globalTotalPlays * 100).toFixed(2);
            changedRateEl.textContent = `(全體平均被改判佔比: ${rate}%)`;
            changedRateEl.style.display = 'inline';
        } else {
            changedRateEl.style.display = 'none';
        }
    }
    
    // 渲染表格與設定排序
    renderTable();
    setupSorting();
    
    // 準備 Chart.js 所需資料
    let maxRounds = 0;
    for (const bet in betGroups) {
        if (betGroups[bet].rounds.length > maxRounds) {
            maxRounds = betGroups[bet].rounds.length;
        }
    }
    
    const labels = Array.from({length: maxRounds}, (_, i) => `局數 ${i + 1}`);
    
    // chart variables
    const winRateDatasets = [];
    const rtpRoundDatasets = [];
    
    // summary variables
    const summaryLabels = [];
    const summaryWinRates = [];
    const summaryRtps = [];
    const summaryBgColors1 = [];
    const summaryBorderColors1 = [];
    const summaryBgColors2 = [];
    const summaryBorderColors2 = [];
    
    // overall variables for line charts
    const overallRounds = [];
    let overallTotalWins = 0;
    let overallTotalPlays = 0;

    let colorIdx = 0;

    for (const betStr in betGroups) {
        const bet = parseFloat(betStr);
        const group = betGroups[bet];
        
        let groupTotalWins = 0;
        let groupTotalPlays = 0;
        
        const winRateDataPoints = [];
        const rtpRoundDataPoints = [];
        
        group.rounds.forEach((r, idx) => {
            if (!overallRounds[idx]) overallRounds[idx] = { wins: 0, total: 0, totalChange: 0, totalBet: 0 };
            if (r) {
                overallRounds[idx].wins += r.wins;
                overallRounds[idx].total += r.total;
                overallRounds[idx].totalChange += r.totalChange;
                overallRounds[idx].totalBet += (r.total * bet);
                
                groupTotalWins += r.wins;
                groupTotalPlays += r.total;
                
                winRateDataPoints.push(r.total > 0 ? (r.wins / r.total) * 100 : 0);
                
                const roundTotalBet = r.total * bet;
                const roundTotalReturn = roundTotalBet + r.totalChange;
                rtpRoundDataPoints.push(roundTotalBet > 0 ? (roundTotalReturn / roundTotalBet) * 100 : 0);
            } else {
                winRateDataPoints.push(0);
                rtpRoundDataPoints.push(0);
            }
        });
        
        overallTotalWins += groupTotalWins;
        overallTotalPlays += groupTotalPlays;
        
        const color = getGroupColorHex(bet, colorIdx);
        
        winRateDatasets.push({
            label: `Bet $${bet} (${group.players}人)`,
            data: winRateDataPoints,
            borderColor: color,
            backgroundColor: color + '33',
            borderWidth: 2,
            pointRadius: 2,
            fill: false,
            tension: 0.3
        });
        
        rtpRoundDatasets.push({
            label: `Bet $${bet} (${group.players}人)`,
            data: rtpRoundDataPoints,
            borderColor: color,
            backgroundColor: color + '33',
            borderWidth: 2,
            pointRadius: 2,
            fill: false,
            tension: 0.3
        });
        
        const groupRtp = (group.totalReturn / group.totalBet) * 100;
        const groupWinRate = groupTotalPlays > 0 ? (groupTotalWins / groupTotalPlays) * 100 : 0;
        
        summaryLabels.push(`Bet $${bet}`);
        summaryWinRates.push(groupWinRate);
        summaryRtps.push(groupRtp);
        
        summaryBgColors1.push(color + '88');
        summaryBorderColors1.push(color);
        summaryBgColors2.push(color + 'CC');
        summaryBorderColors2.push(color);
        
        colorIdx++;
    }
    
    // Overall Summary
    summaryLabels.push('所有 BET 總計');
    const grandWinRate = overallTotalPlays > 0 ? (overallTotalWins / overallTotalPlays) * 100 : 0;
    summaryWinRates.push(grandWinRate);
    summaryRtps.push(overallRtp); // from outer scope
    
    summaryBgColors1.push('rgba(255, 255, 255, 0.4)');
    summaryBorderColors1.push('#ffffff');
    summaryBgColors2.push('rgba(255, 255, 255, 0.8)');
    summaryBorderColors2.push('#ffffff');
    
    if (currentChart) currentChart.destroy();
    if (currentRtpRoundChart) currentRtpRoundChart.destroy();
    if (currentSummaryBarChart) currentSummaryBarChart.destroy();

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            tooltip: { callbacks: { label: function(context) { return context.dataset.label + ': ' + context.parsed.y.toFixed(2) + '%'; } } },
            legend: { labels: { color: '#f8fafc', font: { family: 'Inter', size: 13 } } }
        },
        scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', callback: function(value) { return value + '%'; } } }
        }
    };

    // 1. 繪製勝率折線圖
    const ctxWin = document.getElementById('winRateChart').getContext('2d');
    currentChart = new Chart(ctxWin, {
        type: 'line',
        data: { labels: labels, datasets: winRateDatasets },
        options: chartOptions
    });

    // 2. 繪製每局 RTP 折線圖
    const ctxRtpRound = document.getElementById('rtpRoundChart').getContext('2d');
    currentRtpRoundChart = new Chart(ctxRtpRound, {
        type: 'line',
        data: { labels: labels, datasets: rtpRoundDatasets },
        options: chartOptions
    });

    // 3. 繪製總體平均勝率 與 平均 RTP (長條圖)
    const ctxSummary = document.getElementById('summaryBarChart').getContext('2d');
    currentSummaryBarChart = new Chart(ctxSummary, {
        type: 'bar',
        data: {
            labels: summaryLabels,
            datasets: [
                {
                    label: '平均勝率 (%)',
                    data: summaryWinRates,
                    backgroundColor: summaryBgColors1,
                    borderColor: summaryBorderColors1,
                    borderWidth: 2,
                    borderRadius: 4
                },
                {
                    label: '平均 RTP (%)',
                    data: summaryRtps,
                    backgroundColor: summaryBgColors2,
                    borderColor: summaryBorderColors2,
                    borderWidth: 2,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#f8fafc' } },
                tooltip: { callbacks: { label: function(context) { return context.dataset.label + ': ' + context.raw.toFixed(2) + '%'; } } }
            },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', callback: function(value) { return value + '%'; } } }
            }
        }
    });

    // 4. 繪製最終玩家 RTP 分布圖
    drawRtpDistributionChart(data);
    
    // 5. 繪製最終連贏連輸分布圖
    drawStreakDistributionCharts(data);

    // 6. 渲染表格
    renderTable();
}

function drawStreakDistributionCharts(data) {
    if (currentMaxWinDistChart) {
        currentMaxWinDistChart.destroy();
        currentMaxWinDistChart = null;
    }
    if (currentMaxLossDistChart) {
        currentMaxLossDistChart.destroy();
        currentMaxLossDistChart = null;
    }

    const validData = data.filter(p => !isNaN(p.maxWin) && !isNaN(p.maxLoss));
    if (validData.length === 0) return;

    // 找出整體最大連贏與最大連輸數值，決定圖表 X 軸長度
    const globalMaxWin = Math.max(...validData.map(p => p.maxWin), 0);
    const globalMaxLoss = Math.max(...validData.map(p => p.maxLoss), 0);

    const winLabels = Array.from({length: globalMaxWin + 1}, (_, i) => `${i}局`);
    const lossLabels = Array.from({length: globalMaxLoss + 1}, (_, i) => `${i}局`);

    const betGroups = {};
    validData.forEach(p => {
        if (!betGroups[p.betAmount]) {
            betGroups[p.betAmount] = {
                players: 0,
                winBins: Array(globalMaxWin + 1).fill(0),
                lossBins: Array(globalMaxLoss + 1).fill(0)
            };
        }
        betGroups[p.betAmount].players++;
        betGroups[p.betAmount].winBins[p.maxWin]++;
        betGroups[p.betAmount].lossBins[p.maxLoss]++;
    });

    const totalPlayers = validData.length;
    const winDatasets = [];
    const lossDatasets = [];
    let colorIdx = 0;

    for (const betStr in betGroups) {
        const bet = parseFloat(betStr);
        const group = betGroups[bet];
        
        const winPercentages = group.winBins.map(count => (count / totalPlayers) * 100);
        const lossPercentages = group.lossBins.map(count => (count / totalPlayers) * 100);
        
        const hexColor = getGroupColorHex(bet, colorIdx);
        const bgRgba = hexToRgba(hexColor, 0.7);
        const borderRgba = hexToRgba(hexColor, 1.0);
        
        winDatasets.push({
            label: `Bet $${bet} (${group.players}人)`,
            data: winPercentages,
            backgroundColor: bgRgba,
            borderColor: borderRgba,
            borderWidth: 1,
            stack: 'Stack 0',
            _rawCounts: group.winBins
        });

        lossDatasets.push({
            label: `Bet $${bet} (${group.players}人)`,
            data: lossPercentages,
            backgroundColor: bgRgba,
            borderColor: borderRgba,
            borderWidth: 1,
            stack: 'Stack 0',
            _rawCounts: group.lossBins
        });
        
        colorIdx++;
    }

    const winCtx = document.getElementById('maxWinDistributionChart');
    if (winCtx) {
        currentMaxWinDistChart = new Chart(winCtx.getContext('2d'), {
            type: 'bar',
            data: { labels: winLabels, datasets: winDatasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#94a3b8' },
                        title: { display: true, text: '總佔比 (%)', color: '#94a3b8' }
                    },
                    x: {
                        stacked: true,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#94a3b8' },
                        title: { display: true, text: '最大連贏局數', color: '#94a3b8' }
                    }
                },
                plugins: {
                    legend: { labels: { color: '#f8fafc' } },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const count = context.dataset._rawCounts[context.dataIndex];
                                return `${context.dataset.label.split(' ')[0]} ${context.dataset.label.split(' ')[1]}: 佔比 ${context.parsed.y.toFixed(2)}% (${count}人)`;
                            }
                        }
                    }
                }
            }
        });
    }

    const lossCtx = document.getElementById('maxLossDistributionChart');
    if (lossCtx) {
        currentMaxLossDistChart = new Chart(lossCtx.getContext('2d'), {
            type: 'bar',
            data: { labels: lossLabels, datasets: lossDatasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#94a3b8' },
                        title: { display: true, text: '總佔比 (%)', color: '#94a3b8' }
                    },
                    x: {
                        stacked: true,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#94a3b8' },
                        title: { display: true, text: '最大連輸局數', color: '#94a3b8' }
                    }
                },
                plugins: {
                    legend: { labels: { color: '#f8fafc' } },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const count = context.dataset._rawCounts[context.dataIndex];
                                return `${context.dataset.label.split(' ')[0]} ${context.dataset.label.split(' ')[1]}: 佔比 ${context.parsed.y.toFixed(2)}% (${count}人)`;
                            }
                        }
                    }
                }
            }
        });
    }
}

function drawRtpDistributionChart(data) {
    if (currentRtpDistChart) {
        currentRtpDistChart.destroy();
        currentRtpDistChart = null;
    }

    const binSizeSelect = document.getElementById('rtp-bin-size');
    const binSize = binSizeSelect ? parseFloat(binSizeSelect.value) : 1;

    const validData = data.filter(p => !isNaN(p.rtp) && isFinite(p.rtp));
    if (validData.length === 0) return;

    const rtps = validData.map(p => p.rtp);
    const minRtp = Math.floor(Math.min(...rtps) / binSize) * binSize;
    const maxRtp = Math.ceil(Math.max(...rtps) / binSize) * binSize;

    const numBins = Math.ceil((maxRtp - minRtp) / binSize) + 1;
    const binLabels = [];
    for (let current = minRtp; current <= maxRtp; current += binSize) {
        binLabels.push(`${current.toFixed(1)}~${(current + binSize).toFixed(1)}%`);
    }

    const betGroups = {};
    validData.forEach(p => {
        if (!betGroups[p.betAmount]) {
            betGroups[p.betAmount] = { players: 0, bins: Array(numBins).fill(0) };
        }
        betGroups[p.betAmount].players++;
        
        let index = Math.floor((p.rtp - minRtp) / binSize);
        if (index >= numBins) index = numBins - 1;
        if (index < 0) index = 0;
        betGroups[p.betAmount].bins[index]++;
    });

    const totalPlayers = validData.length;
    const datasets = [];
    let colorIdx = 0;

    for (const betStr in betGroups) {
        const bet = parseFloat(betStr);
        const group = betGroups[bet];
        const percentages = group.bins.map(count => (count / totalPlayers) * 100);
        
        const hexColor = getGroupColorHex(bet, colorIdx);
        const bgRgba = hexToRgba(hexColor, 0.7);
        const borderRgba = hexToRgba(hexColor, 1.0);
        
        datasets.push({
            label: `Bet $${bet} (${group.players}人)`,
            data: percentages,
            backgroundColor: bgRgba,
            borderColor: borderRgba,
            borderWidth: 1,
            stack: 'Stack 0',
            _rawCounts: group.bins
        });
        colorIdx++;
    }

    const ctx = document.getElementById('rtpDistributionChart');
    if (!ctx) return;

    currentRtpDistChart = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: binLabels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    stacked: true,
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#94a3b8' },
                    title: { display: true, text: '總佔比 (%)', color: '#94a3b8' }
                },
                x: {
                    stacked: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#94a3b8' },
                    title: { display: true, text: 'RTP 區間', color: '#94a3b8' }
                }
            },
            plugins: {
                legend: { labels: { color: '#f8fafc' } },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const count = context.dataset._rawCounts[context.dataIndex];
                            return `${context.dataset.label.split(' ')[0]} ${context.dataset.label.split(' ')[1]}: 佔比 ${context.parsed.y.toFixed(2)}% (${count}人)`;
                        }
                    }
                }
            }
        }
    });
}

function renderTable() {
    const tbody = document.querySelector("#rtp-table tbody");
    tbody.innerHTML = ''; // 清除舊的表格資料
    
    globalData.forEach(player => {
        const tr = document.createElement("tr");
        const balanceClass = player.finalBalance > 0 ? 'positive' : (player.finalBalance < 0 ? 'negative' : '');
        
        tr.onclick = () => showPlayerDetails(player.playerId);
        
        tr.innerHTML = `
            <td>${player.playerId}</td>
            <td>$${player.betAmount}</td>
            <td>${player.totalPlays}</td>
            <td class="${balanceClass}">$${player.finalBalance > 0 ? '+' : ''}${player.finalBalance}</td>
            <td>${player.rtp.toFixed(2)}%</td>
            <td class="positive">${player.maxWin}</td>
            <td class="negative">${player.maxLoss}</td>
        `;
        tbody.appendChild(tr);
    });
}

function setupSorting() {
    const headers = document.querySelectorAll("th.sortable");
    headers.forEach(th => {
        // Remove old event listeners by cloning
        const newTh = th.cloneNode(true);
        th.parentNode.replaceChild(newTh, th);
        
        newTh.addEventListener('click', () => {
            const col = newTh.dataset.sort;
            
            if (currentSortCol === col) {
                currentSortAsc = !currentSortAsc;
            } else {
                currentSortCol = col;
                currentSortAsc = false; // 切換新欄位時預設降冪
            }
            
            // 更新 UI 箭頭
            document.querySelectorAll("th.sortable").forEach(h => {
                h.classList.remove('asc', 'desc');
            });
            newTh.classList.add(currentSortAsc ? 'asc' : 'desc');
            
            // 執行排序
            globalData.sort((a, b) => {
                let valA = a[col];
                let valB = b[col];

                // Player ID 特殊處理（自然排序，讓 G1_2 排在 G1_10 前面）
                if (col === 'playerId') {
                    const cmp = a.playerId.localeCompare(b.playerId, undefined, { numeric: true });
                    return currentSortAsc ? cmp : -cmp;
                }

                if (valA < valB) return currentSortAsc ? -1 : 1;
                if (valA > valB) return currentSortAsc ? 1 : -1;
                return 0;
            });
            
            // 重新渲染表格
            renderTable();
        });
    });
}

function showPlayerDetails(playerId) {
    const player = globalData.find(p => p.playerId === playerId);
    if (!player) return;

    // 填寫 Modal 內的摘要資訊
    document.getElementById('modal-player-name').textContent = `玩家歷程: ${player.playerId}`;
    document.getElementById('modal-max-win').textContent = `${player.maxWin} 局`;
    document.getElementById('modal-max-loss').textContent = `${player.maxLoss} 局`;

    // 處理改判佔比的顯示
    let changedCount = 0;
    player.history.forEach(round => {
        if (round.wasChanged) changedCount++;
    });
    
    const changedBox = document.getElementById('modal-changed-box');
    const changedRateEl = document.getElementById('modal-changed-rate');
    if (changedBox && changedRateEl) {
        if (window.systemHasChangedOutcomes) {
            const rate = player.totalPlays > 0 ? (changedCount / player.totalPlays * 100).toFixed(2) : 0;
            changedRateEl.textContent = `${rate}%`;
            changedBox.style.display = 'flex';
        } else {
            changedBox.style.display = 'none';
        }
    }

    // 清空並產生歷史紀錄表格
    const tbody = document.querySelector("#history-table tbody");
    tbody.innerHTML = '';

    player.history.forEach(round => {
        const tr = document.createElement('tr');
        const changeClass = round.change > 0 ? 'positive' : (round.change < 0 ? 'negative' : '');
        const changeText = round.change > 0 ? `+$${round.change}` : `-$${Math.abs(round.change)}`;

        // 盲測模式：只顯示乾淨的結果數據，不透露任何機制相關欄位
        if (window.BLIND_MODE) {
            tr.innerHTML = `
                <td>${round.globalId || '-'}</td>
                <td>${round.round}</td>
                <td class="${changeClass}">${changeText}</td>
                <td>$${round.balanceAfter}</td>
                <td>${round.result === "Win" ? "贏" : "輸"}</td>
            `;
            tbody.appendChild(tr);
            return;
        }

        let changedTag = '';
        if (round.wasChanged) {
            changedTag = `<span style="color: #ef4444; font-weight: bold;">是 (改判)</span>`;
        } else {
            changedTag = `<span style="color: #10b981;">否</span>`;
        }
        
        // Ensure backwards compatibility with old logs
        let poolBalanceText = "-";
        let poolSourceText = "-";
        
        if (currentSystem === 'h' || currentSystem === 'H') {
            poolBalanceText = `(個)${round.personalPoolBalance} | (全)${round.globalPoolBalance}`;
            if (round.poolType === 'Global') poolSourceText = "🌐 全域池";
            else if (round.poolType === 'Personal') poolSourceText = "👤 個人池";
            else poolSourceText = "-";
        } else {
            poolBalanceText = round.poolBalance !== undefined ? `$${round.poolBalance}` : "-";
        }
        
        const flipText = round.flip === "Heads" ? "正面" : (round.flip === "Tails" ? "反面" : "-");

        tr.innerHTML = `
            <td>${round.globalId || '-'}</td>
            <td>${round.round}</td>
            <td>${flipText}</td>
            <td class="${changeClass}">${changeText}</td>
            <td>$${round.balanceAfter}</td>
            <td>${poolBalanceText}</td>
            <td>${changedTag}</td>
            <td>${round.result === "Win" ? "贏" : "輸"}</td>
            <td>${poolSourceText}</td>
        `;
        tbody.appendChild(tr);
    });

    // 顯示 Modal
    document.getElementById('player-modal').style.display = 'block';
}
