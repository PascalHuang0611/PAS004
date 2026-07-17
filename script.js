let currentChart = null;
let currentRtpRoundChart = null;
let currentSummaryBarChart = null;
let globalData = [];
let allReports = {};
let currentSortCol = null;
let currentSortAsc = false; // 預設降冪排序

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
    const sysBtns = document.querySelectorAll('.sys-btn');
    
    let currentSystem = 'B';
    let currentConfig = null; // e.g. "buffer_1_3_pre_40"

    // 14種已知參數設定
    const bufferRanges = [[1, 3], [1, 10], [1, 20], [1, 40], [10, 20], [10, 30], [20, 40]];
    const preFunds = [35, 65, 95];
    const knownConfigs = [];
    bufferRanges.forEach(b => {
        preFunds.forEach(p => {
            knownConfigs.push(`buffer_${b[0]}_${b[1]}_pre_${p}`);
        });
    });

    // 嘗試自動載入所有報表
    async function tryAutoLoad() {
        fileNameDisplay.textContent = '嘗試自動讀取報告...';
        allReports = {};
        
        let successCount = 0;
        const fetchPromises = [];

        knownConfigs.forEach(config => {
            ['b', 'c', 'e', 'f', 'g'].forEach(sys => {
                const path = `reports/${config}/simulation_${sys}_log.json`;
                const p = fetch(path)
                    .then(res => {
                        if (!res.ok) throw new Error("HTTP error " + res.status);
                        return res.json();
                    })
                    .then(data => {
                        allReports[path] = data;
                        successCount++;
                    })
                    .catch(() => { /* 忽略失敗，可能是 CORS 或檔案不存在 */ });
                fetchPromises.push(p);
            });
        });

        await Promise.all(fetchPromises);

        if (successCount > 0) {
            setupUIAfterLoad();
        } else {
            fileNameDisplay.textContent = '自動讀取失敗 (請使用手動上傳或設定 Server)';
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

        knownConfigs.forEach(config => {
            // 檢查該設定是否至少有一份資料
            const hasData = allReports[`reports/${config}/simulation_b_log.json`] || allReports[`reports/${config}/simulation_c_log.json`];
            if (!hasData) return;

            const btn = document.createElement('button');
            btn.className = `tab-btn ${config === currentConfig ? 'active' : ''}`;
            
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

    // 根據目前的 system 與 config 載入資料
    function loadCurrentSelection() {
        if (!currentConfig) return;
        const path = `reports/${currentConfig}/simulation_${currentSystem.toLowerCase()}_log.json`;
        
        if (allReports[path]) {
            globalData = allReports[path];
            // 重設排序狀態
            currentSortCol = null;
            currentSortAsc = false;
            document.querySelectorAll("th.sortable").forEach(h => {
                h.classList.remove('asc', 'desc');
            });
            processData(globalData);
        } else {
            alert(`找不到 ${currentSystem} 系統在 ${currentConfig} 的數據。`);
        }
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

    // 保留手動上傳邏輯
    if (fileInput) {
        fileInput.addEventListener('change', async (event) => {
            const files = event.target.files;
            if (!files || files.length === 0) return;

            fileNameDisplay.textContent = '讀取中...';
            allReports = {};

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (file.name.endsWith('.json')) {
                    try {
                        const text = await file.text();
                        const data = JSON.parse(text);
                        // 嘗試從路徑中重組 "reports/buffer_1_3_pre_40/simulation_b_log.json" 的格式
                        // 避免使用者上傳的資料夾名稱不叫 reports
                        let pathName = file.webkitRelativePath || file.name;
                        
                        // 我們強制將路徑正規化為我們認識的格式，以配合頁籤邏輯
                        let system = 'b';
                        if (pathName.includes('_c_log')) system = 'c';
                        if (pathName.includes('_e_log')) system = 'e';
                        if (pathName.includes('_f_log')) system = 'f';
                        if (pathName.includes('_g_log')) system = 'g';
                        let configMatch = pathName.match(/buffer_\d+_\d+_pre_\d+/);
                        if (configMatch) {
                            allReports[`reports/${configMatch[0]}/simulation_${system}_log.json`] = data;
                        } else {
                            // 若無正規格式，就直接存起來 (此情況下頁籤可能不會正常顯示，但這是一個 fallback)
                            allReports[pathName] = data;
                        }
                    } catch (error) {
                        console.error("Error parsing JSON:", error);
                    }
                }
            }

            if (Object.keys(allReports).length > 0) {
                setupUIAfterLoad();
            } else {
                fileNameDisplay.textContent = '資料夾內沒有找到 JSON 報告';
            }
        });
    }

    // 網頁載入時立刻嘗試自動讀取
    tryAutoLoad();
});

function processData(data) {
    let totalBetAll = 0;
    let totalReturnAll = 0;
    
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
        });
        
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

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
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
        
        const color = colors[colorIdx % colors.length];
        
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
                
                // Player ID 特殊處理（轉成數字排序）
                if (col === 'playerId') {
                    valA = parseInt(a.playerId.replace('Player_', ''));
                    valB = parseInt(b.playerId.replace('Player_', ''));
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

    // 清空並產生歷史紀錄表格
    const tbody = document.querySelector("#history-table tbody");
    tbody.innerHTML = '';

    player.history.forEach(round => {
        const tr = document.createElement('tr');
        const changeClass = round.change > 0 ? 'positive' : (round.change < 0 ? 'negative' : '');
        const changeText = round.change > 0 ? `+$${round.change}` : `-$${Math.abs(round.change)}`;
        
        let changedTag = '';
        if (round.wasChanged) {
            changedTag = `<span style="color: #ef4444; font-weight: bold;">是 (改判)</span>`;
        } else {
            changedTag = `<span style="color: #10b981;">否</span>`;
        }
        
        // Ensure backwards compatibility with old logs that don't have poolBalance
        const poolBalanceText = round.poolBalance !== undefined ? `$${round.poolBalance}` : "-";
        
        // Ensure backwards compatibility with old logs
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
        `;
        tbody.appendChild(tr);
    });

    // 顯示 Modal
    document.getElementById('player-modal').style.display = 'block';
}
