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
    
    # 準備個人獨立水池與全域分BET水池
    personal_pools = {}
    personal_thresholds = {}
    personal_buf_mins = {}
    personal_buf_maxs = {}
    
    global_pools = {}
    global_thresholds = {}
    global_buf_mins = {}
    global_buf_maxs = {}
    
    total_rounds_simulated = 0
    group_idx = 1
    
    for group in player_groups:
        bet = group["betAmount"]
        
        # 初始化該 BET 的全域獨立水池
        if bet not in global_pools:
            global_buf_mins[bet] = base_buf_min * bet
            global_buf_maxs[bet] = base_buf_max * bet
            global_pools[bet] = round(global_buf_maxs[bet] * pre_ratio, 2)
            global_thresholds[bet] = random.randint(global_buf_mins[bet], global_buf_maxs[bet])
            
        for i in range(group["count"]):
            player_id = f"Player_H{group_idx}_{i+1}"
            
            # 初始化該玩家的個人獨立水池
            personal_buf_mins[player_id] = base_buf_min * bet
            personal_buf_maxs[player_id] = base_buf_max * bet
            personal_pools[player_id] = round(personal_buf_maxs[player_id] * pre_ratio, 2)
            personal_thresholds[player_id] = random.randint(personal_buf_mins[player_id], personal_buf_maxs[player_id])
            
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
        
        # 1. 玩家下注進入水池 (依照 82% 個人 / 18% 全域 分配)
        personal_add = round(bet * 0.82, 2)
        global_add = round(bet * 0.18, 2)
        
        personal_pools[player_id] = round(personal_pools[player_id] + personal_add, 2)
        global_pools[bet] = round(global_pools[bet] + global_add, 2)
        
        was_changed = False
        
        # 計算若中獎，水池需要支付的金額 = 退還本金 + 淨利潤
        payout = bet + (bet * WIN_PROFIT_MULTIPLIER)
        
        # 2. 系統 H 混合邏輯判定
        # 檢查兩個水池是否滿足派發條件
        global_ready = (global_pools[bet] >= global_thresholds[bet]) and (global_pools[bet] >= payout)
        personal_ready = (personal_pools[player_id] >= personal_thresholds[player_id]) and (personal_pools[player_id] >= payout)
        
        pool_type_used = "N/A"
        
        # 優先扣除全域水池
        if global_ready:
            result = "Win"
            global_pools[bet] = round(global_pools[bet] - payout, 2)
            global_thresholds[bet] = random.randint(global_buf_mins[bet], global_buf_maxs[bet])
            pool_type_used = "Global"
        elif personal_ready:
            result = "Win"
            personal_pools[player_id] = round(personal_pools[player_id] - payout, 2)
            personal_thresholds[player_id] = random.randint(personal_buf_mins[player_id], personal_buf_maxs[player_id])
            pool_type_used = "Personal"
        else:
            result = "Lose"
                
        # 3. 結算給玩家
        if result == "Win":
            change = bet * WIN_PROFIT_MULTIPLIER
        else:
            change = -bet
            
        player["finalBalance"] = round(player["finalBalance"] + change, 2)
        
        # 記錄歷史
        round_num = len(player["history"]) + 1
        player["history"].append({
            "globalId": global_idx,
            "round": round_num,
            "flip": "N/A", # 系統 H 沒有硬幣機率判定
            "result": result,
            "change": change,
            "balanceAfter": player["finalBalance"],
            "poolType": pool_type_used,
            "personalPoolBalance": personal_pools[player_id],
            "globalPoolBalance": global_pools[bet],
            "wasChanged": was_changed
        })
        
    # 將 dict 轉成陣列
    log_data = list(players_data.values())

    # 輸出成 JSON 檔案
    if output_path is None:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        json_path = os.path.join(current_dir, 'simulation_h_log.json')
    else:
        json_path = output_path
        os.makedirs(os.path.dirname(json_path), exist_ok=True)
    
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(log_data, f, ensure_ascii=False, indent=2)

    print(f"[{json_path}] 模擬完成！")

if __name__ == "__main__":
    run_simulation()
