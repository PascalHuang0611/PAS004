import os
from simulator_b import run_simulation as run_sim_b
from simulator_c import run_simulation as run_sim_c
from simulator_e import run_simulation as run_sim_e
from simulator_f import run_simulation as run_sim_f
from simulator_g import run_simulation as run_sim_g
from simulator_config import PLAYER_GROUPS_UNEQUAL, PLAYER_GROUPS_EQUAL

def batch_run():
    buffer_ranges = [
        (1, 3), (1, 10), (1, 20), (1, 40), (10, 20), (10, 30), (20, 40)
    ]
    pre_funds = [0.35, 0.65, 0.95]

    base_dir = os.path.dirname(os.path.abspath(__file__))
    reports_dir = os.path.join(base_dir, "reports")
    
    print("開始執行全參數批次模擬...")
    distributions = [
        ("unequal", PLAYER_GROUPS_UNEQUAL),
        ("equal", PLAYER_GROUPS_EQUAL)
    ]

    total = len(buffer_ranges) * len(pre_funds) * len(distributions)
    count = 1

    for dist_name, player_groups in distributions:
        for buf_min, buf_max in buffer_ranges:
            for pre_fund in pre_funds:
                pre_fund_pct = int(pre_fund * 100)
                dir_name = f"{dist_name}_buffer_{buf_min}_{buf_max}_pre_{pre_fund_pct}"
                
                os.makedirs(os.path.join(reports_dir, dir_name), exist_ok=True)
                
                output_b = os.path.join(reports_dir, dir_name, "simulation_b_log.json")
                output_c = os.path.join(reports_dir, dir_name, "simulation_c_log.json")
                output_e = os.path.join(reports_dir, dir_name, "simulation_e_log.json")
                output_f = os.path.join(reports_dir, dir_name, "simulation_f_log.json")
                output_g = os.path.join(reports_dir, dir_name, "simulation_g_log.json")
                
                print(f"\n[{count}/{total}] 執行設定: {dist_name} 分佈, Buffer {buf_min}~{buf_max}, Pre-fund {pre_fund_pct}%")
                
                run_sim_b(
                    buffer_min=buf_min, 
                    buffer_max=buf_max, 
                    pre_fund=pre_fund, 
                    output_path=output_b,
                    player_groups=player_groups
                )
                run_sim_c(
                    output_path=output_c,
                    player_groups=player_groups
                )
                run_sim_e(
                    buffer_min=buf_min, 
                    buffer_max=buf_max, 
                    pre_fund=pre_fund, 
                    output_path=output_e,
                    player_groups=player_groups
                )
                run_sim_f(
                    buffer_min=buf_min, 
                    buffer_max=buf_max, 
                    pre_fund=pre_fund, 
                    output_path=output_f,
                    player_groups=player_groups
                )
                run_sim_g(
                    buffer_min=buf_min, 
                    buffer_max=buf_max, 
                    pre_fund=pre_fund, 
                    output_path=output_g,
                    player_groups=player_groups
                )
                count += 1
            
    print("\n所有批次模擬完成！報表已存放於 reports/ 資料夾中。")

if __name__ == "__main__":
    batch_run()
