# ==========================================
# 共用參數表設定 (Shared Game Parameters)
# ==========================================

# 賠率設定
# 假設「正面賠2」是指贏了淨賺 2 倍的下注金額 (例如下注1元，淨賺2元，連本帶利拿回3元)
# 如果你的「賠2」是指「連本帶利拿回2元」 (等於淨賺1倍)，請將此值改為 1。
WIN_PROFIT_MULTIPLIER = 1

# 玩家群組設定 - 不均等分佈
PLAYER_GROUPS_UNEQUAL = [
    {"count": 100, "plays": 200, "betAmount": 1},
    {"count": 10,  "plays": 200, "betAmount": 5},
    {"count": 2,   "plays": 200, "betAmount": 10}
]

# 玩家群組設定 - 均等分佈 (每個BET都是100人)
PLAYER_GROUPS_EQUAL = [
    {"count": 100, "plays": 200, "betAmount": 1},
    {"count": 100, "plays": 200, "betAmount": 5},
    {"count": 100, "plays": 200, "betAmount": 10}
]

# ==========================================
# 全域水池設定 (Pool Parameters - for simulator_b)
# ==========================================
POOL_BUFFER_MIN = 1
POOL_BUFFER_MAX = 10
PRE_FUND_RATIO = 0.4 # 預填比例 (例如 BUFFER_MAX 為 10，預填 40% 就是 4)
