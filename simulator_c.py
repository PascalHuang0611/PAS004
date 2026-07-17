import json
import random
import os

from simulator_config import WIN_PROFIT_MULTIPLIER, PLAYER_GROUPS

def run_simulation(output_path=None):
    log_data = []
    player_id_count = 1
    total_rounds_simulated = 0

    print("開始進行模擬...")

    for group in PLAYER_GROUPS:
        for _ in range(group["count"]):
            player_id = f"Player_{player_id_count}"
            player_id_count += 1

            current_balance = 0
            player_log = {
                "playerId": player_id,
                "betAmount": group["betAmount"],
                "totalPlays": group["plays"],
                "history": [],
                "finalBalance": 0
            }

            for round_num in range(1, group["plays"] + 1):
                # 投硬幣：random.random() < 0.5 代表 50% 機率是正面
                is_heads = random.random() < 0.5
                
                if is_heads:
                    # 正面玩家贏
                    change = group["betAmount"] * WIN_PROFIT_MULTIPLIER
                    result = "Win"
                else:
                    # 反面莊家贏：玩家失去下注金額
                    change = -group["betAmount"]
                    result = "Lose"

                current_balance += change

                player_log["history"].append({
                    "round": round_num,
                    "flip": "Heads" if is_heads else "Tails",
                    "result": result,
                    "change": change,
                    "balanceAfter": current_balance
                })
                
                total_rounds_simulated += 1
            
            player_log["finalBalance"] = current_balance
            log_data.append(player_log)

    # ==========================================
    # 輸出 LOG 檔案 (供網頁前端讀取使用)
    # ==========================================
    
    # 網頁最容易讀取的格式是 JSON，我們輸出一個結構乾淨的 JSON 檔案
    # 這樣網頁未來透過 fetch('simulation_log.json') 就能輕易呈現所有圖表與資料
    # 輸出成 JSON 檔案
    if output_path is None:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        json_path = os.path.join(current_dir, 'simulation_c_log.json')
    else:
        json_path = output_path
        os.makedirs(os.path.dirname(json_path), exist_ok=True)
        
    with open(json_path, 'w', encoding='utf-8') as f:
        # 使用 indent=2 讓 JSON 有漂亮的縮排，且 ensure_ascii=False 以便保留可能的中文字
        json.dump(log_data, f, ensure_ascii=False, indent=2)

    if output_path is None:
        print(f"模擬完成！")
        print(f"總共模擬了 {len(log_data)} 位玩家，共計 {total_rounds_simulated} 局。")
        print(f"網頁專用的 JSON 格式結果已存入：\n- {json_path}")
    else:
        print(f"[{json_path}] 產生完畢！")

if __name__ == "__main__":
    run_simulation()
