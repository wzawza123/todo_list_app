import datetime as dt
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient

from mdtask.server import create_app

SRC = "# 笔记\n\n- [ ] 任务甲 ⏫ 🆔 api001\n    - [ ] 子任务 🆔 api002\n- [ ] 任务乙 🆔 api003\n\n结尾。\n"


@pytest.fixture()
def client(tmp_path):
    (tmp_path / "p.md").write_text(SRC, encoding="utf-8")
    app = create_app(tmp_path, serve_static=False, watch=False)
    with TestClient(app) as c:
        c.vault_root = tmp_path  # type: ignore[attr-defined]
        yield c


def test_get_tasks_tree(client):
    data = client.get("/api/tasks").json()
    roots = data["files"]["p.md"]
    assert [r["id"] for r in roots] == ["api001", "api003"]
    assert roots[0]["children"][0]["id"] == "api002"


def test_create_and_patch(client):
    created = client.post("/api/tasks", json={"title": "买牛奶 !2"}).json()
    assert created["priority"] == "high"
    patched = client.patch(f"/api/tasks/{created['id']}", json={"status": "done"}).json()
    assert patched["done_date"] == dt.date.today().isoformat()


def test_cycle_returns_409(client):
    client.patch("/api/tasks/api001", json={"depends_on": ["api003"]})
    res = client.patch("/api/tasks/api003", json={"depends_on": ["api001"]})
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "CYCLE_DETECTED"
    assert set(res.json()["error"]["detail"]) == {"api001", "api003"}


def test_indent_endpoints(client):
    res = client.post("/api/tasks/api003/indent", json={"direction": "in"})
    assert res.json()["level"] == 2
    res = client.post("/api/tasks/api003/indent", json={"direction": "out"})
    assert res.json()["level"] == 1


def test_move_endpoint(client):
    res = client.post("/api/tasks/api003/move", json={"parent_id": "api001"})
    assert res.status_code == 200
    assert res.json()["level"] == 2
    roots = client.get("/api/tasks").json()["files"]["p.md"]
    assert [r["id"] for r in roots] == ["api001"]
    assert [c["id"] for c in roots[0]["children"]] == ["api002", "api003"]

    bad = client.post("/api/tasks/api001/move", json={"parent_id": "api002"})
    assert bad.status_code == 400
    assert bad.json()["error"]["code"] == "BAD_TARGET"


def test_move_endpoint_across_files(client):
    created = client.post("/api/tasks", json={"title": "从 Inbox 拖走"}).json()
    moved = client.post(f"/api/tasks/{created['id']}/move", json={"parent_id": "api001"}).json()
    assert moved["file"] == "p.md" and moved["level"] == 2

    files = client.get("/api/tasks").json()["files"]
    assert files.get("Inbox.md", []) == []
    assert [c["id"] for c in files["p.md"][0]["children"]] == ["api002", created["id"]]


def test_today_flow(client):
    client.post("/api/today/toggle", json={"task_id": "api001"})
    client.post("/api/today/toggle", json={"task_id": "api003"})
    payload = client.get("/api/today").json()
    assert [i["id"] for i in payload["items"]] == ["api001", "api003"]

    payload = client.put("/api/today", json={"task_ids": ["api003", "api001"]}).json()
    assert [i["id"] for i in payload["items"]] == ["api003", "api001"]

    client.patch("/api/tasks/api003", json={"status": "done"})
    payload = client.get("/api/today").json()
    assert payload["done"] == 1 and payload["total"] == 2

    # toggling off removes it
    client.post("/api/today/toggle", json={"task_id": "api003"})
    assert [i["id"] for i in client.get("/api/today").json()["items"]] == ["api001"]


def test_delete_cleans_today_and_deps(client):
    client.post("/api/today/toggle", json={"task_id": "api002"})
    client.patch("/api/tasks/api003", json={"depends_on": ["api002"]})
    res = client.delete("/api/tasks/api001").json()
    assert set(res["removed"]) == {"api001", "api002"}
    assert client.get("/api/today").json()["items"] == []
    assert client.get("/api/tasks").json()["files"]["p.md"][0]["depends_on"] == []


def test_files_endpoint_hides_today_dir(client):
    data = client.get("/api/files").json()
    assert all(not f["path"].startswith("Today/") for f in data["files"])
    assert data["inbox"] == "Inbox.md"


def test_projects_endpoint_returns_dashboard_summaries(client):
    root = client.vault_root
    (root / "empty.md").write_text("# Empty project\n", encoding="utf-8")
    (root / "projects").mkdir()
    (root / "projects" / "release.md").write_text(
        "- [x] First \U0001f194 rel001\n"
        "- [ ] Second \U0001f194 rel002\n"
        "- [x] Third \U0001f194 rel003\n"
        "- [ ] Fourth \U0001f194 rel004\n"
        "- [x] Fifth \U0001f194 rel005\n"
        "- [ ] Sixth \U0001f194 rel006\n",
        encoding="utf-8",
    )
    (root / "Today" / "2026-08-03.md").write_text(
        "- [[rel001]]\n", encoding="utf-8"
    )
    client.post("/api/tasks", json={"title": "Inbox is not a project"})
    client.patch("/api/tasks/api002", json={"status": "done"})

    response = client.get("/api/projects")

    assert response.status_code == 200
    projects = response.json()["projects"]
    assert [project["path"] for project in projects] == [
        "empty.md",
        "p.md",
        "projects/release.md",
    ]

    empty = projects[0]
    assert empty == {
        "path": "empty.md",
        "name": "empty",
        "total_tasks": 0,
        "completed_tasks": 0,
        "progress": 0,
        "latest_tasks": [],
    }

    project = projects[1]
    assert project["name"] == "p"
    assert project["total_tasks"] == 3
    assert project["completed_tasks"] == 1
    assert project["progress"] == 33
    assert [task["id"] for task in project["latest_tasks"]] == [
        "api003",
        "api002",
        "api001",
    ]
    assert all(task["children"] == [] for task in project["latest_tasks"])

    release = projects[2]
    assert release["name"] == "release"
    assert release["total_tasks"] == 6
    assert release["completed_tasks"] == 3
    assert release["progress"] == 50
    assert [task["id"] for task in release["latest_tasks"]] == [
        "rel006",
        "rel005",
        "rel004",
        "rel003",
        "rel002",
    ]
    assert all("blocked" in task and "key" in task for task in release["latest_tasks"])


def _project_url(path: str) -> str:
    return "/api/projects/" + quote(path, safe="/")


def test_project_create_and_rename_preserves_directory_and_content(client):
    created = client.post("/api/projects", json={"name": "中文项目.md"})

    assert created.status_code == 201
    assert created.json() == {
        "path": "projects/中文项目.md",
        "name": "中文项目",
        "total_tasks": 0,
        "completed_tasks": 0,
        "progress": 0,
        "latest_tasks": [],
    }
    source = client.vault_root / "projects" / "中文项目.md"
    assert source.read_text(encoding="utf-8") == ""
    content = "项目说明，不应随重命名改变。\n\n- [ ] 第一项 🆔 zh0001\n"
    source.write_text(content, encoding="utf-8")

    renamed = client.patch(_project_url("projects/中文项目.md"), json={"name": "发布计划"})

    assert renamed.status_code == 200
    assert renamed.json()["path"] == "projects/发布计划.md"
    target = client.vault_root / "projects" / "发布计划.md"
    assert not source.exists()
    assert target.read_text(encoding="utf-8") == content
    paths = [p["path"] for p in client.get("/api/projects").json()["projects"]]
    assert "projects/发布计划.md" in paths


@pytest.mark.parametrize(
    "name",
    [
        "",
        "../逃逸",
        "a/b",
        r"a\b",
        "CON",
        "nul.md",
        "COM1.txt",
        "bad:name",
        "?",
        "bad.",
        "bad ",
    ],
)
def test_project_create_rejects_unsafe_names(client, name):
    response = client.post("/api/projects", json={"name": name})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "BAD_PROJECT_NAME"
    assert not (client.vault_root.parent / "逃逸.md").exists()


def test_project_names_and_source_paths_are_case_insensitive(client):
    assert client.post("/api/projects", json={"name": "Foo"}).status_code == 201

    duplicate = client.post("/api/projects", json={"name": "foo.md"})
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "PROJECT_EXISTS"

    renamed = client.patch(_project_url("PROJECTS/foo.md"), json={"name": "Bar"})
    assert renamed.status_code == 200
    assert renamed.json()["path"] == "projects/Bar.md"

    for reserved in ["inbox.md", "today/2026-08-03.md"]:
        response = client.delete(_project_url(reserved))
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "BAD_PROJECT_PATH"


def test_project_rename_rejects_same_directory_collision(client):
    root = client.vault_root
    (root / "one.md").write_text("one", encoding="utf-8")
    (root / "Two.md").write_text("two", encoding="utf-8")

    response = client.patch(_project_url("one.md"), json={"name": "two"})

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PROJECT_EXISTS"
    assert (root / "one.md").read_text(encoding="utf-8") == "one"
    assert (root / "Two.md").read_text(encoding="utf-8") == "two"


def test_project_rename_response_recomputes_blocked_state(client):
    client.patch("/api/tasks/api003", json={"depends_on": ["api001"]})

    response = client.patch(_project_url("p.md"), json={"name": "renamed"})

    latest = {task["id"]: task for task in response.json()["latest_tasks"]}
    assert latest["api003"]["blocked"] is True


def test_project_delete_moves_to_trash_and_cleans_dependencies_and_today(client):
    root = client.vault_root
    (root / "projects").mkdir()
    source = root / "projects" / "doomed.md"
    original = "- [ ] Parent 🆔 gone01\n    - [ ] Child 🆔 gone02\n"
    source.write_text(original, encoding="utf-8")
    client.patch("/api/tasks/api003", json={"depends_on": ["gone01", "gone02"]})
    for date in ["2026-08-02", "2026-08-03"]:
        client.put("/api/today", json={"date": date, "task_ids": ["gone01", "api003"]})

    response = client.delete(_project_url("projects/doomed.md"))

    assert response.status_code == 200
    result = response.json()
    assert result["deleted"] == "projects/doomed.md"
    assert result["removed_task_ids"] == ["gone01", "gone02"]
    assert result["trashed_to"].startswith(".trash/mdtask-projects/")
    assert not source.exists()
    assert (root / result["trashed_to"]).read_text(encoding="utf-8") == original
    task = next(
        task
        for task in client.get("/api/tasks").json()["files"]["p.md"]
        if task["id"] == "api003"
    )
    assert task["depends_on"] == []
    for date in ["2026-08-02", "2026-08-03"]:
        ids = [item["id"] for item in client.get("/api/today", params={"date": date}).json()["items"]]
        assert ids == ["api003"]


def test_project_delete_keeps_existing_trash_copy(client):
    root = client.vault_root
    projects = root / "projects"
    projects.mkdir()
    source = projects / "repeat.md"
    source.write_text("first", encoding="utf-8")
    first = client.delete(_project_url("projects/repeat.md")).json()
    source.write_text("second", encoding="utf-8")

    second = client.delete(_project_url("projects/repeat.md")).json()

    assert first["trashed_to"] != second["trashed_to"]
    assert (root / first["trashed_to"]).read_text(encoding="utf-8") == "first"
    assert (root / second["trashed_to"]).read_text(encoding="utf-8") == "second"


def test_project_delete_does_not_purge_id_reowned_after_deduplication(client):
    root = client.vault_root
    (root / "a-doomed.md").write_text("- [ ] Old owner 🆔 dup001\n", encoding="utf-8")
    (root / "z-survivor.md").write_text("- [ ] New owner 🆔 dup001\n", encoding="utf-8")
    client.patch("/api/tasks/api003", json={"depends_on": ["dup001"]})
    client.put("/api/today", json={"date": "2026-08-03", "task_ids": ["dup001"]})

    result = client.delete(_project_url("a-doomed.md")).json()

    assert result["removed_task_ids"] == []
    survivor = client.get("/api/tasks").json()["files"]["z-survivor.md"][0]
    assert survivor["id"] == "dup001"
    api003 = next(
        task
        for task in client.get("/api/tasks").json()["files"]["p.md"]
        if task["id"] == "api003"
    )
    assert api003["depends_on"] == ["dup001"]
    items = client.get("/api/today", params={"date": "2026-08-03"}).json()["items"]
    assert [item["id"] for item in items] == ["dup001"]


def test_prose_preserved_after_edits(client):
    client.patch("/api/tasks/api001", json={"priority": "highest", "title": "任务甲改名"})
    text = (client.vault_root / "p.md").read_text(encoding="utf-8")
    assert text.startswith("# 笔记\n\n")
    assert text.endswith("\n结尾。\n")
    assert "- [ ] 任务甲改名 🔺 🆔 api001" in text
