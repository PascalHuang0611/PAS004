import json
import random
import os
from simulator_config import POOL_BUFFER_MIN, POOL_BUFFER_MAX, PRE_FUND_RATIO, WIN_PROFIT_MULTIPLIER, PLAYER_GROUPS_UNEQUAL
import simulator_config

def run_simulation(buffer_min=None, buffer_max=None, pre_fund=None, output_path=None, player_groups=None):
    if player_groups is None:
        player_groups = PLAYER_GROUPS_UNEQUAL
    # 如果有帶參數，就使用參數，否則使用預設 Config
    buf_min = buffer_min if buffer_min is not None else simulator_config.POOL_BUFFER_MIN
    buf_max = buffer_max if buffer_max is not None else simulator_config.POOL_BUFFER_MAX
    pre_ratio = pre_fund if pre_fund is not None else simulator_config.PRE_FUND_RATIO

    # 準備全域水池 (以「單位」計算)
    pool_balance_units = buf_max * pre_ratio
    current_threshold_units = random.randint(buf_min, buf_max)
    
    # 計算每次中獎所需的單位數 (本金1單位 + 獲利單位)
    payout_units = 1 + WIN_PROFIT_MULTIPLIER
    
    # 建立所有玩家實體與他們的行動列表
    players_data = {}
    actions = [] # 儲存每次遊玩的玩家 ID
    
    total_rounds_simulated = 0
    group_idx = 1
    
    for group in player_groups:
        for i in range(group["count"]):
            player_id = f"Player_G{group_idx}_{i+1}"
            players_data[player_id] = {
                "playerId": player_id,
                "betAmount": group["betAmount"],
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
        
        # 1. 玩家下注進入水池 (永遠只進入 1 單位)
        pool_balance_units += 1
        
        # 2. 正常機率骰硬幣
        is_heads = random.random() < 0.5
        was_changed = False
        
        # 3. 根據水池水位控制獎項
        if is_heads:
            # 原本贏，檢查水位與門檻 (以單位計算)
            if pool_balance_units >= current_threshold_units and pool_balance_units >= payout_units:
                # 可以出獎
                result = "Win"
            else:
                # 水位不足或未達門檻，強制改為反面
                result = "Lose"
                was_changed = True
        else:
            # 原本輸，檢查是否超過 BUFFER_MAX (以單位計算)
            if pool_balance_units >= buf_max and pool_balance_units >= payout_units:
                # 水位過高，強制吐水，改為正面
                result = "Win"
                was_changed = True
            else:
                result = "Lose"
                
        # 4. 結算 (水池扣單位，玩家金幣變動真實金額)
        if result == "Win":
            pool_balance_units -= payout_units
            # 出獎後，重新骰新的門檻
            current_threshold_units = random.randint(buf_min, buf_max)
            change = bet * WIN_PROFIT_MULTIPLIER
        else:
            change = -bet
            
        player["finalBalance"] += change
        
        # 記錄歷史
        round_num = len(player["history"]) + 1
        player["history"].append({
            "globalId": global_idx,
            "round": round_num,
            "flip": "Heads" if is_heads else "Tails",
            "result": result,
            "change": change,
            "balanceAfter": player["finalBalance"],
            "poolBalance": round(pool_balance_units, 2), # 紀錄此局結束後的水位(單位)
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

if __name__ == "__main__":
    run_simulation()
