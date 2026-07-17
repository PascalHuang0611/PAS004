import json
import random
import os

from simulator_config import WIN_PROFIT_MULTIPLIER, PLAYER_GROUPS_UNEQUAL

def run_simulation(output_path=None, player_groups=None):
    if player_groups is None:
        player_groups = PLAYER_GROUPS_UNEQUAL
    players_data = {}
    actions = []
    total_rounds_simulated = 0

    print("開始進行模擬...")

    group_idx = 1
    for group in player_groups:
        bet = group["betAmount"]
        for i in range(group["count"]):
            # 跟其他系統保持一致的 ID 格式
            player_id = f"Player_G{group_idx}_{i+1}"
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

    # 打亂所有動作
    random.shuffle(actions)
    
    # 開始逐局處理
    for global_idx, player_id in enumerate(actions, start=1):
        player = players_data[player_id]
        
        # 投硬幣：random.random() < 0.5 代表 50% 機率是正面
        is_heads = random.random() < 0.5
        
        if is_heads:
            # 正面玩家贏
            change = player["betAmount"] * WIN_PROFIT_MULTIPLIER
            result = "Win"
        else:
            # 反面莊家贏：玩家失去下注金額
            change = -player["betAmount"]
            result = "Lose"

        player["finalBalance"] += change

        round_num = len(player["history"]) + 1
        player["history"].append({
            "globalId": global_idx,
            "round": round_num,
            "flip": "Heads" if is_heads else "Tails",
            "result": result,
            "change": change,
            "balanceAfter": player["finalBalance"]
        })

    log_data = list(players_data.values())

    # ==========================================
    # 輸出 LOG 檔案 (供網頁前端讀取使用)
    # ==========================================
    
    if output_path is None:
        # 如果沒帶參數，寫在同層
        current_dir = os.path.dirname(os.path.abspath(__file__))
        json_path = os.path.join(current_dir, 'simulation_c_log.json')
    else:
        # 寫入指定的路徑
        json_path = output_path
        os.makedirs(os.path.dirname(json_path), exist_ok=True)
    
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(log_data, f, ensure_ascii=False, indent=2)

    print(f"[{json_path}] 模擬完成！")

if __name__ == "__main__":
    run_simulation()
