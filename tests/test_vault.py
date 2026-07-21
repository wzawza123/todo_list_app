import datetime as dt

import pytest

from mdtask import today as today_mod
from mdtask.vault import Vault, VaultError

PROJECT = """# 项目 A

前言段落，不能被改动。

- [ ] 根任务一 ⏫ 🆔 aaa001
    - [ ] 子任务 🆔 aaa002
- [ ] 根任务二 🆔 aaa003

结尾段落。
"""


@pytest.fixture()
def vault(tmp_path):
    (tmp_path / "projects").mkdir()
    (tmp_path / "projects" / "a.md").write_text(PROJECT, encoding="utf-8")
    return Vault(tmp_path)


def test_bootstrap_creates_inbox_and_today(tmp_path):
    Vault(tmp_path)
    assert (tmp_path / "Inbox.md").exists()
    assert (tmp_path / "Today").is_dir()


def test_non_task_lines_untouched(vault):
    vault.update_task("aaa001", {"priority": "highest"})
    text = (vault.root / "projects" / "a.md").read_text(encoding="utf-8")
    assert text.startswith("# 项目 A\n\n前言段落，不能被改动。\n")
    assert text.endswith("结尾段落。\n")
    assert "- [ ] 根任务一 🔺 🆔 aaa001" in text


def test_create_appends_to_inbox_with_id(vault):
    task = vault.create_task("买咖啡 !1")
    assert task.priority == "highest"
    assert task.title == "买咖啡"
    text = (vault.root / "Inbox.md").read_text(encoding="utf-8")
    assert text.strip() == f"- [ ] 买咖啡 🔺 🆔 {task.id}"


def test_create_child_inserted_after_subtree(vault):
    child = vault.create_task("新子任务", parent_id="aaa001")
    lines = (vault.root / "projects" / "a.md").read_text(encoding="utf-8").splitlines()
    idx = next(i for i, l in enumerate(lines) if child.id in l)
    assert lines[idx].startswith("    - [ ] 新子任务")
    assert "aaa003" in lines[idx + 1]


def test_status_writes_done_date(vault):
    task = vault.update_task("aaa002", {"status": "done"})
    assert task.status == "done"
    assert task.done_date == dt.date.today().isoformat()
    assert "✅" in (vault.root / "projects" / "a.md").read_text(encoding="utf-8")


def test_indent_and_max_depth(vault):
    vault.update_task("aaa003", {})
    vault.indent_task("aaa003", "in")
    doc, task = vault.find("aaa003")
    assert task.level == 2
    with pytest.raises(VaultError):
        vault.indent_task("aaa001", "out")


def test_indent_respects_four_levels(tmp_path):
    (tmp_path / "d.md").write_text(
        "- [ ] L1 🆔 bbb001\n"
        "    - [ ] L2 🆔 bbb002\n"
        "        - [ ] L3 🆔 bbb003\n"
        "        - [ ] L3b 🆔 bbb004\n"
        "            - [ ] L4 🆔 bbb005\n",
        encoding="utf-8",
    )
    v = Vault(tmp_path)
    with pytest.raises(VaultError) as exc:
        v.indent_task("bbb004", "in")
    assert exc.value.code == "MAX_DEPTH"


def test_cycle_detection_rejects_and_leaves_file_untouched(tmp_path):
    (tmp_path / "c.md").write_text(
        "- [ ] A 🆔 ccc001\n- [ ] B 🆔 ccc002\n- [ ] C 🆔 ccc003\n", encoding="utf-8"
    )
    v = Vault(tmp_path)
    v.update_task("ccc001", {"depends_on": ["ccc002"]})
    v.update_task("ccc002", {"depends_on": ["ccc003"]})
    before = (tmp_path / "c.md").read_text(encoding="utf-8")
    with pytest.raises(VaultError) as exc:
        v.update_task("ccc003", {"depends_on": ["ccc001"]})
    assert exc.value.code == "CYCLE_DETECTED"
    assert (tmp_path / "c.md").read_text(encoding="utf-8") == before


def test_blocked_is_derived(tmp_path):
    (tmp_path / "c.md").write_text(
        "- [ ] A 🆔 ddd001 ⛔ ddd002\n- [ ] B 🆔 ddd002\n", encoding="utf-8"
    )
    v = Vault(tmp_path)
    tasks = v.all_tasks()
    v.compute_blocked(tasks)
    assert v.index()["ddd001"].blocked is True
    v.update_task("ddd002", {"status": "done"})
    tasks = v.all_tasks()
    v.compute_blocked(tasks)
    assert v.index()["ddd001"].blocked is False


def test_dangling_dependency_is_not_blocking(tmp_path):
    (tmp_path / "c.md").write_text("- [ ] A 🆔 eee001 ⛔ nope99\n", encoding="utf-8")
    v = Vault(tmp_path)
    tasks = v.all_tasks()
    v.compute_blocked(tasks)
    assert v.index()["eee001"].blocked is False
    assert any("nope99" in w for w in v.dangling_dep_warnings())


def test_delete_removes_subtree_and_dependencies(vault):
    vault.update_task("aaa003", {"depends_on": ["aaa002"]})
    removed = vault.delete_task("aaa001")
    assert set(removed) == {"aaa001", "aaa002"}
    text = (vault.root / "projects" / "a.md").read_text(encoding="utf-8")
    assert "aaa001" not in text and "aaa002" not in text
    assert "⛔" not in text
    assert "结尾段落。" in text


def test_non_utf8_file_is_skipped_with_warning(tmp_path):
    (tmp_path / "bad.md").write_bytes("- [ ] 乱码\n".encode("gbk"))
    v = Vault(tmp_path)
    assert any("UTF-8" in w for w in v.warnings)
    # A skipped file must not make the vault look permanently stale.
    assert v.refresh_if_stale() is False


def test_refresh_if_stale_picks_up_external_changes(vault):
    assert vault.refresh_if_stale() is False

    new = vault.root / "projects" / "b.md"
    new.write_text("- [ ] 外部新建 🆔 ext001\n", encoding="utf-8")
    assert vault.refresh_if_stale() is True
    assert vault.find("ext001")[1].title == "外部新建"

    # find() rescans on a miss even if nothing called refresh first.
    new.write_text("- [ ] 外部新建 🆔 ext001\n- [ ] 又一条 🆔 ext002\n", encoding="utf-8")
    assert vault.find("ext002")[1].title == "又一条"

    new.unlink()
    vault.refresh_if_stale()
    with pytest.raises(VaultError):
        vault.find("ext001")


def test_our_own_writes_do_not_look_stale(vault):
    vault.update_task("aaa001", {"priority": "high"})
    assert vault.refresh_if_stale() is False


def test_today_roundtrip_and_dedupe(vault):
    date = "2026-07-21"
    today_mod.write_ids(vault, date, ["aaa001", "aaa003", "aaa001"])
    assert today_mod.read_ids(vault, date) == ["aaa001", "aaa003"]
    text = (vault.root / "Today" / f"{date}.md").read_text(encoding="utf-8")
    assert text == "---\ndate: 2026-07-21\n---\n\n- [[aaa001]]\n- [[aaa003]]\n"


def test_today_completion_writes_to_source_file_only(vault):
    date = dt.date.today().isoformat()
    today_mod.write_ids(vault, date, ["aaa001"])
    before = (vault.root / "Today" / f"{date}.md").read_text(encoding="utf-8")
    vault.update_task("aaa001", {"status": "done"})
    assert (vault.root / "Today" / f"{date}.md").read_text(encoding="utf-8") == before
    assert "- [x] 根任务一" in (vault.root / "projects" / "a.md").read_text(encoding="utf-8")


def test_carry_over(vault):
    today = dt.date.today()
    yesterday = (today - dt.timedelta(days=1)).isoformat()
    today_mod.write_ids(vault, yesterday, ["aaa001", "aaa002"])
    vault.update_task("aaa002", {"status": "done"})
    pending = today_mod.pending_carry_over(vault)["pending"]
    assert [p["id"] for p in pending] == ["aaa001"]
    today_mod.carry_over(vault)
    assert today_mod.read_ids(vault, today.isoformat()) == ["aaa001"]
    # history file untouched
    assert today_mod.read_ids(vault, yesterday) == ["aaa001", "aaa002"]


def test_stale_today_reference(vault):
    date = dt.date.today().isoformat()
    today_mod.write_ids(vault, date, ["aaa001", "ghost1"])
    payload = today_mod.expand(vault, date)
    assert payload["items"][1]["stale"] is True
    today_mod.clean_stale(vault, date)
    assert today_mod.read_ids(vault, date) == ["aaa001"]
