import json
import random
import os
from simulator_config import WIN_PROFIT_MULTIPLIER, PLAYER_GROUPS_UNEQUAL
import simulator_config

def run_simulation(buffer_min=None, buffer_max=None, pre_fund=None, output_path=None, player_groups=None):
    if player_groups is None:
        player_groups = PLAYER_GROUPS_UNEQUAL
    # 如果有帶參數，就使用參數，否則使用預設 Config
    base_buf_min = buffer_min if buffer_min is not None else simulator_config.POOL_BUFFER_MIN
    base_buf_max = buffer_max if buffer_max is not None else simulator_config.POOL_BUFFER_MAX
    pre_ratio = pre_fund if pre_fund is not None else simulator_config.PRE_FUND_RATIO

    # 建立所有玩家實體與他們的行動列表
    players_data = {}
    actions = [] # 儲存每次遊玩的玩家 ID
    
    # 準備個人獨立水池
    pool_balances = {}
    current_thresholds = {}
    buf_mins = {}
    buf_maxs = {}
    
    total_rounds_simulated = 0
    group_idx = 1
    
    for group in player_groups:
        bet = group["betAmount"]
            
        for i in range(group["count"]):
            player_id = f"Player_G{group_idx}_{i+1}"
            
            # 初始化該玩家的個人獨立水池
            buf_mins[player_id] = base_buf_min * bet
            buf_maxs[player_id] = base_buf_max * bet
            pool_balances[player_id] = buf_maxs[player_id] * pre_ratio
            current_thresholds[player_id] = random.randint(buf_mins[player_id], buf_maxs[player_id])
            
            players_data[player_id] = {
                "playerId": player_id,
                "betAmount": bet,
                "totalPlays": group["plays"],
                "history": [],
                "finalBalance": 0
            }
            # 將該玩家的每一局都加入動作列表
            for _ in range(group["plays"]):
                actions.append(player_id)
                total_rounds_simulated += 1
        group_idx += 1
        
    # 打亂所有動作，達到完全隨機交替遊玩的營運現況
    random.shuffle(actions)
    
    # 開始逐局處理
    for global_idx, player_id in enumerate(actions, start=1):
        player = players_data[player_id]
        bet = player["betAmount"]
        
        # 1. 玩家下注進入專屬於自己的水池
        pool_balances[player_id] += bet
        
        was_changed = False
        
        # 計算若中獎，水池需要支付的金額 = 退還本金 + 淨利潤
        payout = bet + (bet * WIN_PROFIT_MULTIPLIER)
        
        # 2. 系統 G 專屬邏輯：無機率骰硬幣，純看個人水位門檻
        if pool_balances[player_id] >= current_thresholds[player_id] and pool_balances[player_id] >= payout:
            result = "Win"
        else:
            result = "Lose"
                
        # 3. 結算
        if result == "Win":
            pool_balances[player_id] -= payout
            # 出獎後，重新骰該玩家個人水池的新門檻
            current_thresholds[player_id] = random.randint(buf_mins[player_id], buf_maxs[player_id])
            change = bet * WIN_PROFIT_MULTIPLIER
        else:
            change = -bet
            
        player["finalBalance"] += change
        
        # 記錄歷史
        round_num = len(player["history"]) + 1
        player["history"].append({
            "globalId": global_idx,
            "round": round_num,
            "flip": "N/A", # 系統 G 沒有機率判定
            "result": result,
            "change": change,
            "balanceAfter": player["finalBalance"],
            "poolBalance": round(pool_balances[player_id], 2), # 紀錄此局結束後的個人水位
            "wasChanged": was_changed
        })
        
    # 將 dict 轉成陣列
    log_data = list(players_data.values())

    # 輸出成 JSON 檔案
    if output_path is None:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        json_path = os.path.join(current_dir, 'simulation_g_log.json')
    else:
        json_path = output_path
        os.makedirs(os.path.dirname(json_path), exist_ok=True)
    
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(log_data, f, ensure_ascii=False, indent=2)

    print(f"[{json_path}] 模擬完成！")
    print(f"系統G設定: Base Buffer {base_buf_min}~{base_buf_max}, Pre-fund: {pre_ratio*100}%")

if __name__ == "__main__":
    run_simulation()
