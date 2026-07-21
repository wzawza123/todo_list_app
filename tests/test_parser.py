from mdtask.parser import (
    Task,
    build_tree,
    indent_to_level,
    parse_lines,
    parse_task_body,
)

MIXED = """# 项目笔记

一些普通文本，不应被改动。

- [ ] 完成 SR 模型的 ablation 实验 ⏫ 🆔 k3x9ab 📅 2026-07-25
    - [ ] 准备 baseline checkpoint 🆔 m2p4qq
  - [ ] 两空格缩进的子任务 🆔 t2sp01
\t- [ ] tab 缩进 🆔 tab001
- [x] 写实验设计文档 🆔 a1b2c3 ✅ 2026-07-20

> 引用块
"""


def test_parse_body_tokens():
    p = parse_task_body("跑 4 组消融配置 🔺 🆔 n8r2ws ⛔ m2p4qq,x1y2z3 📅 2026-07-25 ✅ 2026-07-21")
    assert p["title"] == "跑 4 组消融配置"
    assert p["priority"] == "highest"
    assert p["id"] == "n8r2ws"
    assert p["depends_on"] == ["m2p4qq", "x1y2z3"]
    assert p["due"] == "2026-07-25"
    assert p["done_date"] == "2026-07-21"


def test_token_order_is_irrelevant():
    a = parse_task_body("标题 🆔 aaa111 ⏫ 📅 2026-01-01")
    b = parse_task_body("标题 📅 2026-01-01 ⏫ 🆔 aaa111")
    assert a == b


def test_emoji_inside_title_survives():
    p = parse_task_body("给 📅 日历模块 ⛔ 加锁 🆔 zz9999")
    assert p["title"] == "给 📅 日历模块 ⛔ 加锁"
    assert p["id"] == "zz9999"
    assert p["due"] is None
    assert p["depends_on"] == []


def test_indent_levels():
    assert indent_to_level("") == 1
    assert indent_to_level("  ") == 2  # 2 spaces round up
    assert indent_to_level("    ") == 2
    assert indent_to_level("\t") == 2
    assert indent_to_level("        ") == 3


def test_parse_mixed_indentation():
    tasks, _ = parse_lines(MIXED.splitlines(keepends=True), "a.md")
    assert [t.id for t in tasks] == ["k3x9ab", "m2p4qq", "t2sp01", "tab001", "a1b2c3"]
    assert [t.level for t in tasks] == [1, 2, 2, 2, 1]
    assert tasks[-1].status == "done"
    assert tasks[-1].done_date == "2026-07-20"


def test_fifth_level_is_merged_into_fourth():
    src = "\n".join(
        [
            "- [ ] L1 🆔 aaa001",
            "    - [ ] L2 🆔 aaa002",
            "        - [ ] L3 🆔 aaa003",
            "            - [ ] L4 🆔 aaa004",
            "                - [ ] L5 🆔 aaa005",
        ]
    )
    tasks, warnings = parse_lines(src.splitlines(), "deep.md")
    assert [t.level for t in tasks] == [1, 2, 3, 4, 4]
    assert any("4 级" in w for w in warnings)


def test_skipped_indent_clamped():
    tasks, warnings = parse_lines(["- [ ] A 🆔 aaa001", "            - [ ] B 🆔 aaa002"], "s.md")
    assert [t.level for t in tasks] == [1, 2]
    assert any("跳级" in w for w in warnings)


def test_duplicate_id_demoted():
    tasks, warnings = parse_lines(["- [ ] A 🆔 dup001", "- [ ] B 🆔 dup001"], "d.md")
    assert tasks[0].id == "dup001"
    assert tasks[1].id is None
    assert any("重复" in w for w in warnings)


def test_task_without_id_gets_no_id_on_read():
    tasks, _ = parse_lines(["- [ ] 裸任务 ⏫"], "n.md")
    assert tasks[0].id is None
    assert tasks[0].priority == "high"
    assert tasks[0].key == "n.md:0"


def test_serialize_token_order():
    t = Task(
        title="标题",
        priority="highest",
        id="k3x9ab",
        depends_on=["m2p4qq", "n8r2ws"],
        due="2026-07-25",
        done_date="2026-07-21",
        status="done",
        level=2,
    )
    assert t.to_line() == "    - [x] 标题 🔺 🆔 k3x9ab ⛔ m2p4qq,n8r2ws 📅 2026-07-25 ✅ 2026-07-21"


def test_roundtrip_is_byte_identical_for_canonical_lines():
    src = (
        "- [ ] 完成 SR 模型的 ablation 实验 ⏫ 🆔 k3x9ab 📅 2026-07-25\n"
        "    - [ ] 准备 baseline checkpoint 🆔 m2p4qq\n"
        "    - [ ] 跑 4 组消融配置 🆔 n8r2ws ⛔ m2p4qq\n"
        "- [x] 写实验设计文档 🆔 a1b2c3 ✅ 2026-07-20\n"
    )
    lines = src.splitlines(keepends=True)
    tasks, _ = parse_lines(lines, "rt.md")
    for t in tasks:
        lines[t.line] = t.to_line() + "\n"
    assert "".join(lines) == src


def test_build_tree():
    tasks, _ = parse_lines(MIXED.splitlines(keepends=True), "a.md")
    roots = build_tree(tasks)
    assert len(roots) == 2
    assert [c.id for c in roots[0].children] == ["m2p4qq", "t2sp01", "tab001"]
