// 參數比對工具:載入 compare_data.json,提供篩選與排序
let cmpData = [];
let cmpDist = 'unequal';
let cmpSystems = new Set(['B', 'C', 'D', 'E', 'F', 'G', 'H']);
let cmpOnlyRec = false;
let cmpOnlySel = false;
let cmpSelected = new Set(); // 逐列勾選,鍵為 dist|system|buffer|pre,跨篩選保留
let cmpSortKey = '_score';
let cmpSortAsc = true; // 綜合評分越低越好,預設升冪

function rowKey(r) {
    return `${r.dist}|${r.system}|${r.buffer}|${r.pre}`;
}

// ==========================================
// 綜合評分:權重可由使用者調整,即時重算
// ==========================================
const WEIGHT_DEFS = [
    { id: 'w_rtp',    def: 2.0, label: '|整體RTP − 100|',            hint: '長期回報率貼近 100%' },
    { id: 'w_gap',    def: 1.0, label: '跨BET之RTP差距',             hint: '不同下注額的玩家回報一致' },
    { id: 'w_spread', def: 1.0, label: '三次Run間RTP波動',           hint: '換一批亂數結果依然相近' },
    { id: 'w_wr5',    def: 1.0, label: '|勝率@第5局 − 50|',          hint: '入場初期不冷場也不放水' },
    { id: 'w_wr10',   def: 0.7, label: '|勝率@第10局 − 50|',         hint: '同上' },
    { id: 'w_wr20',   def: 0.7, label: '|勝率@第20局 − 50|',         hint: '同上' },
    { id: 'w_ge8',    def: 0.4, label: '曾連輸≥8局玩家占比',          hint: '連輸太深的玩家越少越好' },
    { id: 'w_ge10',   def: 0.6, label: '曾連輸≥10局玩家占比',         hint: '同上,更深者權重更高' },
    { id: 'w_fw',     def: 3.0, label: 'max(0, 首勝平均局數 − 2.2)',  hint: '理論值2.0+抽樣容忍0.2(純隨機實測1.87~2.20),僅懲罰超出部分' },
    { id: 'w_nw10',   def: 0.5, label: '10局仍未贏玩家占比',          hint: '開局久輸的玩家越少越好' },
    { id: 'w_p5',     def: 0.3, label: '輸贏規律性(5局窗)',           hint: '短規律玩家最容易當場察覺' },
    { id: 'w_p10',    def: 0.2, label: '輸贏規律性(10局窗)',          hint: '抓較長週期的循環規律' },
];
let cmpWeights = Object.fromEntries(WEIGHT_DEFS.map(w => [w.id, w.def]));

// 自訂權重的本地儲存 (與儀表板共用同一把 key)
const CUSTOM_STORAGE_KEY = 'pas004_custom_weights';

function loadStoredCustom() {
    try {
        const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
        if (!raw) return null;
        const stored = JSON.parse(raw);
        return (stored && stored.weights) ? stored : null;
    } catch (e) {
        return null;
    }
}

function saveCustom() {
    // 依目前權重算出的各系統前三名,存成儀表板可直接使用的格式
    const topConfigs = { unequal: {}, equal: {} };
    for (const dist of ['unequal', 'equal']) {
        for (const sys of ['B', 'C', 'D', 'E', 'F', 'G', 'H']) {
            topConfigs[dist][sys] = cmpData
                .filter(r => r.dist === dist && r.system === sys && r._rec)
                .sort((a, b) => a._score - b._score)
                .map(r => `buffer_${r.buffer.replace('~', '_')}_pre_${r.pre}`);
        }
    }
    try {
        localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify({
            weights: { ...cmpWeights },
            topConfigs: topConfigs
        }));
        return true;
    } catch (e) {
        return false;
    }
}

function clearCustom() {
    try { localStorage.removeItem(CUSTOM_STORAGE_KEY); } catch (e) {}
}

function computeScore(r) {
    const W = cmpWeights;
    let s = 0;
    s += Math.abs(r.overall_rtp - 100) * W.w_rtp;
    s += r.rtp_gap_bets * W.w_gap;
    s += r.rtp_spread_runs * W.w_spread;
    s += Math.abs(r.winrate_r5 - 50) * W.w_wr5;
    s += Math.abs(r.winrate_r10 - 50) * W.w_wr10;
    s += Math.abs(r.winrate_r20 - 50) * W.w_wr20;
    s += r.pct_loss_ge8 * W.w_ge8;
    s += r.pct_loss_ge10 * W.w_ge10;
    s += Math.max(0, r.avg_first_win - 2.2) * W.w_fw;
    s += r.pct_no_win_by10 * W.w_nw10;
    s += r.pattern5 * W.w_p5;
    s += r.pattern10 * W.w_p10;
    return s;
}

// 依目前權重重算每一列的評分,並重新標記各系統(每 dist)評分最低的三組為推薦
function recomputeScores() {
    const groups = {};
    cmpData.forEach(r => {
        r._score = computeScore(r);
        const g = `${r.dist}|${r.system}`;
        (groups[g] = groups[g] || []).push(r);
    });
    Object.values(groups).forEach(g => {
        g.slice().sort((a, b) => a._score - b._score).forEach((r, i) => { r._rec = i < 3; });
    });
}

function weightsAreDefault() {
    return WEIGHT_DEFS.every(w => cmpWeights[w.id] === w.def);
}

function bufferSortValue(b) {
    const [lo, hi] = b.split('~').map(Number);
    return lo * 1000 + hi;
}

// 欄位定義:label 顯示名稱, fmt 格式化, sortVal 取排序值
const CMP_COLUMNS = [
    { key: '_sel', label: '勾選', isCheckbox: true },
    { key: '_rec', label: '⭐', fmt: v => v ? '⭐' : '', sortVal: v => v ? 0 : 1 },
    { key: 'system', label: '系統', fmt: v => v },
    { key: 'buffer', label: 'Buffer', fmt: v => v, sortVal: bufferSortValue },
    { key: 'pre', label: '預墊%', fmt: v => v },
    { key: '_score', label: '綜合評分(低=佳)', fmt: v => v.toFixed(1) },
    { key: 'overall_rtp', label: '整體RTP%', fmt: v => v.toFixed(2) },
    { key: 'rtp_spread_runs', label: 'Run間波動%', fmt: v => v.toFixed(2) },
    { key: 'rtp_gap_bets', label: '跨BET差距%', fmt: v => v.toFixed(2) },
    { key: 'winrate_r5', label: '勝率@5局%', fmt: v => v.toFixed(1) },
    { key: 'winrate_r10', label: '勝率@10局%', fmt: v => v.toFixed(1) },
    { key: 'winrate_r15', label: '勝率@15局%', fmt: v => v.toFixed(1) },
    { key: 'winrate_r20', label: '勝率@20局%', fmt: v => v.toFixed(1) },
    { key: 'rtp_at_r20', label: 'RTP@20局%', fmt: v => v.toFixed(1) },
    { key: 'avg_first_win', label: '首勝平均局數', fmt: v => v.toFixed(1) },
    { key: 'pct_no_win_by5', label: '5局未贏%', fmt: v => v.toFixed(1) },
    { key: 'pct_no_win_by10', label: '10局未贏%', fmt: v => v.toFixed(1) },
    { key: 'pct_no_win_by15', label: '15局未贏%', fmt: v => v.toFixed(1) },
    { key: 'pct_no_win_by20', label: '20局未贏%', fmt: v => v.toFixed(1) },
    { key: 'pct_loss_ge6', label: '連輸≥6局%', fmt: v => v.toFixed(1) },
    { key: 'pct_loss_ge8', label: '連輸≥8局%', fmt: v => v.toFixed(1) },
    { key: 'pct_loss_ge10', label: '連輸≥10局%', fmt: v => v.toFixed(1) },
    { key: 'avg_max_loss_first20', label: '前20局最大連輸', fmt: v => v.toFixed(2) },
    { key: 'avg_max_loss', label: '全程最大連輸', fmt: v => v.toFixed(2) },
    { key: 'avg_max_win_streak', label: '全程最大連贏', fmt: v => v.toFixed(2) },
    { key: 'p_win_after_win', label: 'P(贏｜前局贏)%', fmt: v => v.toFixed(1) },
    { key: 'pattern5', label: '規律性5局窗%', fmt: v => v.toFixed(1) },
    { key: 'pattern10', label: '規律性10局窗%', fmt: v => v.toFixed(1) },
    { key: 'player_rtp_std', label: '玩家RTP標準差', fmt: v => v.toFixed(2) },
    { key: 'player_rtp_min', label: '最低玩家RTP%', fmt: v => v.toFixed(1) },
    { key: 'player_rtp_max', label: '最高玩家RTP%', fmt: v => v.toFixed(1) },
];

function renderCmpTable() {
    const col = CMP_COLUMNS.find(c => c.key === cmpSortKey) || CMP_COLUMNS.find(c => c.key === '_score');
    const getVal = row => {
        if (col.key === '_sel') return cmpSelected.has(rowKey(row)) ? 0 : 1;
        return col.sortVal ? col.sortVal(row[col.key]) : row[col.key];
    };

    let rows = cmpData.filter(r =>
        r.dist === cmpDist &&
        cmpSystems.has(r.system) &&
        (!cmpOnlyRec || r._rec) &&
        (!cmpOnlySel || cmpSelected.has(rowKey(r)))
    );
    rows.sort((a, b) => {
        const va = getVal(a), vb = getVal(b);
        if (va < vb) return cmpSortAsc ? -1 : 1;
        if (va > vb) return cmpSortAsc ? 1 : -1;
        // 同分時固定用 系統/Buffer/預墊 排,結果穩定
        return (a.system + a.buffer + a.pre).localeCompare(b.system + b.buffer + b.pre, undefined, { numeric: true });
    });

    const thead = document.querySelector('#cmp-table thead');
    thead.innerHTML = '<tr>' + CMP_COLUMNS.map(c => {
        const arrow = c.key === cmpSortKey ? (cmpSortAsc ? ' ↑' : ' ↓') : '';
        return `<th class="sortable cmp-th" data-key="${c.key}" title="點擊改用「${c.label}」排序,再點一次反向(預設依綜合評分由佳至次)">${c.label}${arrow}</th>`;
    }).join('') + '</tr>';
    thead.querySelectorAll('th').forEach(th => {
        th.addEventListener('click', () => {
            const key = th.dataset.key;
            if (cmpSortKey === key) {
                cmpSortAsc = !cmpSortAsc;
            } else {
                cmpSortKey = key;
                cmpSortAsc = true;
            }
            renderCmpTable();
        });
    });

    const tbody = document.querySelector('#cmp-table tbody');
    tbody.innerHTML = rows.map(r => {
        const key = rowKey(r);
        return `<tr class="${r._rec ? 'rec-row' : ''}">` +
            CMP_COLUMNS.map(c => {
                if (c.isCheckbox) {
                    return `<td><input type="checkbox" class="cmp-row-check" data-key="${key}" ${cmpSelected.has(key) ? 'checked' : ''}></td>`;
                }
                return `<td>${c.fmt(r[c.key])}</td>`;
            }).join('') +
            '</tr>';
    }).join('');

    const selNote = cmpSelected.size > 0 ? `(已勾選 ${cmpSelected.size} 組)` : '';
    document.getElementById('cmp-row-count').textContent = `顯示 ${rows.length} 組參數${selNote}`;
}

function initWeightEditor() {
    const box = document.getElementById('cmp-weights');
    box.innerHTML = WEIGHT_DEFS.map(w => `
        <div style="display: flex; align-items: center; gap: 0.6rem; padding: 0.15rem 0;">
            <input type="number" id="${w.id}" class="fp-select" style="flex: none; width: 70px;" min="0" step="0.1" value="${w.def}">
            <span style="min-width: 220px;">${w.label}</span>
            <span style="opacity: 0.7;">${w.hint}</span>
        </div>`).join('');

    const status = document.getElementById('cmp-weights-status');
    const applyBtn = document.getElementById('cmp-apply-weights');
    const resetBtn = document.getElementById('cmp-reset-weights');

    function setStatus(text, warn) {
        status.textContent = text;
        status.style.color = warn ? '#fbbf24' : '';
    }

    function readInput(id) {
        const v = parseFloat(document.getElementById(id).value);
        return isFinite(v) && v >= 0 ? v : 0;
    }

    // 按鈕依狀態顯示:有未套用的改動才出現「套用」,套用中的權重非預設才出現「恢復預設」
    function updateButtons() {
        const pending = WEIGHT_DEFS.some(w => readInput(w.id) !== cmpWeights[w.id]);
        applyBtn.style.display = pending ? '' : 'none';
        resetBtn.style.display = weightsAreDefault() ? 'none' : '';
        if (pending) {
            setStatus('✎ 權重已修改,按「✔ 套用並儲存」後生效', true);
        } else if (!weightsAreDefault()) {
            setStatus('✔ 使用自訂權重中(已儲存,儀表板同步採用)', true);
        } else {
            setStatus('(目前為預設權重)', false);
        }
    }

    // 若本地已有自訂權重,載入並套用
    const stored = loadStoredCustom();
    if (stored) {
        WEIGHT_DEFS.forEach(w => {
            if (typeof stored.weights[w.id] === 'number') {
                cmpWeights[w.id] = stored.weights[w.id];
                document.getElementById(w.id).value = stored.weights[w.id];
            }
        });
    }
    updateButtons();

    // 修改輸入框:僅更新按鈕狀態,不立即重算
    WEIGHT_DEFS.forEach(w => {
        document.getElementById(w.id).addEventListener('input', updateButtons);
    });

    // 套用並儲存:重算 + 寫入本地
    applyBtn.addEventListener('click', () => {
        WEIGHT_DEFS.forEach(w => {
            cmpWeights[w.id] = readInput(w.id);
            document.getElementById(w.id).value = cmpWeights[w.id];
        });
        recomputeScores();
        renderCmpTable();
        if (weightsAreDefault()) {
            // 套用的就是預設值 → 視同恢復預設,清除本地紀錄
            clearCustom();
        } else if (!saveCustom()) {
            updateButtons();
            setStatus('⚠ 已套用,但此環境無法儲存(儀表板仍用預設)', true);
            return;
        }
        updateButtons();
    });

    // 恢復預設:還原輸入框 + 清除本地紀錄
    resetBtn.addEventListener('click', () => {
        WEIGHT_DEFS.forEach(w => {
            cmpWeights[w.id] = w.def;
            document.getElementById(w.id).value = w.def;
        });
        clearCustom();
        recomputeScores();
        renderCmpTable();
        updateButtons();
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    initWeightEditor();
    // 玩家配置切換 (單選)
    document.querySelectorAll('.cmp-dist-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cmp-dist-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            cmpDist = btn.dataset.dist;
            renderCmpTable();
        });
    });

    // 系統篩選 (多選,至少留一個)
    document.querySelectorAll('.cmp-sys-btn').forEach(btn => {
        btn.title = `點擊隱藏/顯示系統 ${btn.dataset.system} 的資料列`;
        btn.addEventListener('click', () => {
            const s = btn.dataset.system;
            if (cmpSystems.has(s)) {
                if (cmpSystems.size === 1) return; // 不允許全部關掉
                cmpSystems.delete(s);
                btn.classList.remove('active');
            } else {
                cmpSystems.add(s);
                btn.classList.add('active');
            }
            renderCmpTable();
        });
    });

    // 只顯示建議參數
    const onlyRecBtn = document.getElementById('cmp-only-rec');
    onlyRecBtn.addEventListener('click', () => {
        cmpOnlyRec = !cmpOnlyRec;
        onlyRecBtn.classList.toggle('active', cmpOnlyRec);
        renderCmpTable();
    });

    // 逐列勾選 (事件委派在 tbody 上,重繪不失效)
    document.querySelector('#cmp-table tbody').addEventListener('change', (e) => {
        if (!e.target.classList.contains('cmp-row-check')) return;
        if (e.target.checked) {
            cmpSelected.add(e.target.dataset.key);
        } else {
            cmpSelected.delete(e.target.dataset.key);
        }
        renderCmpTable();
    });

    // 只顯示勾選的參數
    const onlySelBtn = document.getElementById('cmp-only-sel');
    onlySelBtn.addEventListener('click', () => {
        cmpOnlySel = !cmpOnlySel;
        onlySelBtn.classList.toggle('active', cmpOnlySel);
        renderCmpTable();
    });

    // 清除勾選 (同時關閉「只顯示勾選」避免顯示空表)
    document.getElementById('cmp-clear-sel').addEventListener('click', () => {
        cmpSelected.clear();
        cmpOnlySel = false;
        onlySelBtn.classList.remove('active');
        renderCmpTable();
    });

    // 手動選檔備援 (file:// 等無法自動 fetch 的環境)
    const uploadSection = document.getElementById('cmp-upload-section');
    const fileInput = document.getElementById('cmp-file-upload');
    fileInput.addEventListener('change', async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        try {
            cmpData = JSON.parse(await file.text());
            recomputeScores();
            uploadSection.style.display = 'none';
            renderCmpTable();
        } catch (e) {
            document.getElementById('cmp-upload-hint').textContent = '檔案解析失敗,請確認選擇的是 compare_data.json';
        }
    });

    try {
        const res = await fetch('compare_data.json');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        cmpData = await res.json();
        recomputeScores();
        renderCmpTable();
    } catch (e) {
        // 自動抓取失敗 → 顯示手動選檔
        uploadSection.style.display = 'flex';
        document.getElementById('cmp-row-count').textContent = '等待手動選擇資料檔...';
    }
});
