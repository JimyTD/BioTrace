"""一次性：看演示库里九条观察的状态 / 错误码 / notes，用于演示老数据（notes 为空）的样子。

用法：
  python scripts/.tmp-obs.py                 # 列出
  python scripts/.tmp-obs.py clear <obsId>   # 把该条的 notes 清空（演示老数据），返回原值
  python scripts/.tmp-obs.py restore <obsId> <原值>
"""
import sqlite3
import sys
from pathlib import Path

DB = Path(__file__).resolve().parents[1] / "data/biotrace.db"


def main() -> None:
    conn = sqlite3.connect(DB)
    args = sys.argv[1:]
    if args and args[0] == "clear":
        obs_id = args[1]
        row = conn.execute("select notes from observations where id like ?", (obs_id + "%",)).fetchone()
        print("原值:", repr(row[0]) if row else "没找到")
        conn.execute("update observations set notes = '' where id like ?", (obs_id + "%",))
        conn.commit()
        print("已清空")
        return
    if args and args[0] == "restore":
        obs_id, value = args[1], args[2]
        conn.execute("update observations set notes = ? where id like ?", (value, obs_id + "%"))
        conn.commit()
        print("已恢复")
        return

    rows = conn.execute(
        "select substr(id,1,8), status, coalesce(error,''), length(coalesce(notes,'')), "
        "substr(coalesce(notes,''),1,26) from observations order by created_at"
    ).fetchall()
    for r in rows:
        print(f"{r[0]}  {r[1]:<14} {r[2]:<22} notes={r[3]:<4} {r[4]}")
    if args and args[0] == "keepsake":
        # 演示用：把某条改成留影档，并写入给定的 notes（空串＝老数据的样子）
        obs_id, notes = args[1], (args[2] if len(args) > 2 else "")
        full = conn.execute("select id from observations where id like ?", (obs_id + "%",)).fetchone()
        if not full:
            print("没找到", obs_id)
            return
        conn.execute("update observations set error = 'identify_keepsake', notes = ? where id = ?", (notes, full[0]))
        conn.commit()
        print("已改为留影档:", full[0], "| notes 长度:", len(notes))
    if args and args[0] == "settled":
        obs_id = args[1]
        conn.execute(
            "update observations set error = null, notes = '' where id like ?", (obs_id + "%",)
        )
        conn.commit()
        print("已还原为普通已收录")


if __name__ == "__main__":
    main()
