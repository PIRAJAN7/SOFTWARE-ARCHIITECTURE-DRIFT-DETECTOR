import io
import json
import zipfile
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from backend.app.core.config import settings
from backend.app.core.security import hash_password
from backend.app.models.user import User
from backend.app.services.auth_service import AuthService

import uuid

@pytest.fixture(autouse=True)
def setup_auth(client, db_session):
    uid = str(uuid.uuid4())
    user = User(
        id=uid,
        email=f"api.tester.{uid[:8]}@drift.local",
        password_hash=hash_password("Password123!"),
        full_name="API Tester",
        is_verified=True
    )
    db_session.add(user)
    db_session.commit()
    token, _, _ = AuthService.create_session(db_session, user)
    client.cookies.set(settings.SESSION_COOKIE_NAME, token)
    yield
    client.cookies.clear()

def test_health_check(client: TestClient):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("healthy", "degraded")
    assert data["database"] == "healthy"
    assert data["version"] == "1.0.0"

def test_project_crud(client: TestClient):
    # 1. Create project
    create_payload = {
        "name": "E-Commerce Core",
        "description": "Enterprise ordering backend",
        "repository_type": "local_zip",
        "primary_language": "python",
        "source_dirs": "app",
        "exclude_dirs": ".venv,__pycache__,tests"
    }
    res = client.post("/api/v1/projects", json=create_payload)
    assert res.status_code == 201
    proj_data = res.json()
    proj_id = proj_data["id"]
    assert proj_data["name"] == "E-Commerce Core"

    # 2. List projects
    list_res = client.get("/api/v1/projects")
    assert list_res.status_code == 200
    assert any(p["id"] == proj_id for p in list_res.json())

    # 3. Get single project
    get_res = client.get(f"/api/v1/projects/{proj_id}")
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "E-Commerce Core"

    # 4. Update project
    update_res = client.put(f"/api/v1/projects/{proj_id}", json={"name": "E-Commerce Core v2"})
    assert update_res.status_code == 200
    assert update_res.json()["name"] == "E-Commerce Core v2"

    # 5. Delete project
    del_res = client.delete(f"/api/v1/projects/{proj_id}")
    assert del_res.status_code == 204

    # Verify not found
    get_del = client.get(f"/api/v1/projects/{proj_id}")
    assert get_del.status_code == 404

def test_architecture_validation_and_creation(client: TestClient):
    # Create project first
    p_res = client.post("/api/v1/projects", json={"name": "Arch Project"})
    proj_id = p_res.json()["id"]

    # Test validation with invalid JSON
    bad_val = client.post("/api/v1/architectures/validate", json={"raw_content": "{bad json}", "format": "json"})
    assert bad_val.status_code == 200
    assert bad_val.json()["is_valid"] is False

    # Test valid definition
    valid_content = {
        "name": "Standard Layered Architecture",
        "description": "4-layer architecture",
        "version": 1,
        "components": [
            {"name": "presentation", "layer": 1, "path_patterns": ["presentation/**"]},
            {"name": "application", "layer": 2, "path_patterns": ["application/**"]},
            {"name": "domain", "layer": 3, "path_patterns": ["domain/**"]},
            {"name": "infrastructure", "layer": 4, "path_patterns": ["infrastructure/**"]}
        ],
        "rules": [
            {
                "id": "LAYER-001",
                "type": "layer_direction",
                "description": "Dependencies must flow downward.",
                "severity": "high",
                "layer_direction": "downward_only"
            },
            {
                "id": "FORBIDDEN-001",
                "type": "forbidden_dependency",
                "description": "Domain cannot depend on presentation",
                "severity": "critical",
                "from_component": "domain",
                "to_component": "presentation"
            }
        ]
    }
    raw_str = json.dumps(valid_content)
    val_res = client.post("/api/v1/architectures/validate", json={"raw_content": raw_str, "format": "json"})
    assert val_res.status_code == 200
    assert val_res.json()["is_valid"] is True

    # Create architecture
    create_res = client.post(
        "/api/v1/architectures",
        json={
            "project_id": proj_id,
            "name": "Standard Layered Architecture",
            "format": "json",
            "raw_content": raw_str
        }
    )
    assert create_res.status_code == 201
    arch_data = create_res.json()
    assert arch_data["name"] == "Standard Layered Architecture"
    assert len(arch_data["components"]) == 4

def test_zip_traversal_rejection(client: TestClient):
    # Create project
    p_res = client.post("/api/v1/projects", json={"name": "Zip Security Test"})
    proj_id = p_res.json()["id"]

    # Create an in-memory zip containing malicious path traversal entry
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w") as zf:
        zf.writestr("../../evil.txt", "exploit")
    zip_buffer.seek(0)

    upload_res = client.post(
        f"/api/v1/projects/{proj_id}/upload",
        files={"file": ("malicious.zip", zip_buffer, "application/zip")}
    )
    # Must reject traversal!
    assert upload_res.status_code == 400
    assert "Unsafe path detected" in upload_res.json()["detail"] or "traversal" in upload_res.json()["detail"].lower()

def test_full_workflow_sample_project_violation(client: TestClient):
    """
    End-to-end integration test:
    1. Create project
    2. Upload sample-project.zip
    3. Import Layered architecture definition
    4. Run scan
    5. Verify deliberate architecture violation is detected
    6. Verify graph, reports, and status updates
    """
    # 1. Create project
    proj_res = client.post("/api/v1/projects", json={
        "name": "Sample Order System",
        "description": "Demonstration project with intentional architecture drift",
        "primary_language": "python",
        "source_dirs": "app",
        "exclude_dirs": ".venv,__pycache__,tests"
    })
    assert proj_res.status_code == 201
    proj_id = proj_res.json()["id"]

    # 2. Upload sample-project.zip
    zip_path = Path(__file__).resolve().parent.parent.parent / "sample-project.zip"
    assert zip_path.exists(), "sample-project.zip must exist"

    with open(zip_path, "rb") as f:
        upload_res = client.post(
            f"/api/v1/projects/{proj_id}/upload",
            files={"file": ("sample-project.zip", f, "application/zip")}
        )
    assert upload_res.status_code == 200

    # 3. Import architecture definition from architecture-examples/layered.json
    arch_file = Path(__file__).resolve().parent.parent.parent / "architecture-examples" / "layered.json"
    with open(arch_file, "r") as f:
        arch_raw = f.read()

    arch_res = client.post("/api/v1/architectures", json={
        "project_id": proj_id,
        "name": "Standard Layered Architecture",
        "format": "json",
        "raw_content": arch_raw
    })
    assert arch_res.status_code == 201
    arch_id = arch_res.json()["id"]

    # 4. Trigger Scan
    scan_res = client.post("/api/v1/scans", json={
        "project_id": proj_id,
        "architecture_id": arch_id,
        "source_version": "v1.0.0"
    })
    assert scan_res.status_code == 201
    scan_data = scan_res.json()
    assert scan_data["status"] == "completed"
    assert scan_data["files_analyzed"] >= 4
    assert scan_data["total_findings"] > 0
    scan_id = scan_data["id"]

    # 5. Verify Findings
    findings_res = client.get(f"/api/v1/scans/{scan_id}/findings")
    assert findings_res.status_code == 200
    findings = findings_res.json()

    # Confirm deliberate violation was captured
    # The domain model improperly imports presentation routes format_currency_response
    domain_to_presentation = [
        f for f in findings
        if (
            (f["source_component"] == "domain" and f["target_component"] == "presentation") or
            ("domain" in (f["source_module"] or "") and "presentation" in (f["target_module"] or "")) or
            f["rule_type"] == "forbidden_dependency"
        )
        and f.get("line_number") is not None
    ]
    assert len(domain_to_presentation) > 0, "Deliberate domain -> presentation violation was not detected!"

    violation = domain_to_presentation[0]
    assert violation["line_number"] is not None
    assert "format_currency_response" in (violation["evidence"] or "") or "routes" in (violation["evidence"] or "")
    assert violation["severity"] in ("critical", "high")

    # 6. Verify Dependency Graph
    graph_res = client.get(f"/api/v1/scans/{scan_id}/graph")
    assert graph_res.status_code == 200
    graph_data = graph_res.json()
    assert len(graph_data["nodes"]) >= 4
    assert len(graph_data["edges"]) >= 3
    # Check that at least one edge is marked as a violation
    violation_edges = [e for e in graph_data["edges"] if e["is_violation"]]
    assert len(violation_edges) > 0, "No violation edges highlighted in dependency graph!"

    # 7. Update finding status to accepted_exception (requires reason)
    finding_id = violation["id"]
    # Fail if reason missing
    bad_update = client.patch(f"/api/v1/findings/{finding_id}/status", json={"status": "accepted_exception", "reason": ""})
    assert bad_update.status_code == 400

    # Succeed with documented reason
    good_update = client.patch(
        f"/api/v1/findings/{finding_id}/status",
        json={"status": "accepted_exception", "reason": "Approved temporary exception pending Sprint 4 refactoring."}
    )
    assert good_update.status_code == 200
    assert good_update.json()["status"] == "accepted_exception"
    assert len(good_update.json()["audit_logs"]) >= 1

    # 8. Check Reports: JSON and CSV
    json_rep = client.get(f"/api/v1/scans/{scan_id}/report/json")
    assert json_rep.status_code == 200
    assert json_rep.json()["scan"]["id"] == scan_id

    csv_rep = client.get(f"/api/v1/scans/{scan_id}/report/csv")
    assert csv_rep.status_code == 200
    assert "Finding ID" in csv_rep.text and "Project Name" in csv_rep.text and "Rule ID" in csv_rep.text

    # 9. Run a second scan to test Scan Comparison
    scan_2_res = client.post("/api/v1/scans", json={
        "project_id": proj_id,
        "architecture_id": arch_id,
        "source_version": "v1.0.1"
    })
    assert scan_2_res.status_code == 201
    scan_2_id = scan_2_res.json()["id"]

    comp_res = client.get(f"/api/v1/scans/{scan_id}/compare/{scan_2_id}")
    assert comp_res.status_code == 200
    comp_data = comp_res.json()
    assert "persistent_findings" in comp_data
    assert len(comp_data["persistent_findings"]) > 0

    # 10. Test AI explanation fallback
    ai_res = client.post("/api/v1/ai/explain-finding", json={
        "rule_type": violation["rule_type"],
        "title": violation["title"],
        "explanation": violation["explanation"],
        "source_component": violation["source_component"],
        "target_component": violation["target_component"],
        "evidence": violation["evidence"]
    })
    assert ai_res.status_code == 200
    assert "ai_explanation" in ai_res.json()
    assert "architectural_remediation" in ai_res.json()

def test_architecture_definition_persistence_and_scan_errors(client: TestClient):
    # 1. Create two separate projects
    p1 = client.post("/api/v1/projects", json={"name": "Project Alpha"}).json()
    p2 = client.post("/api/v1/projects", json={"name": "Project Beta"}).json()

    # 2. Scanning Project Alpha without architecture definition must return 400
    scan_no_arch = client.post("/api/v1/scans", json={"project_id": p1["id"]})
    assert scan_no_arch.status_code == 400
    assert "No architecture definition found" in scan_no_arch.json()["detail"]

    # 3. Create architecture for Project Alpha with forbidden_import rule
    arch_payload = {
        "project_name": "Alpha Architecture",
        "layers": [
            {"name": "presentation", "path": "src/presentation", "may_depend_on": ["domain"]},
            {"name": "domain", "path": "src/domain", "may_depend_on": []}
        ],
        "rules": [
            {
                "id": "FORBID-REQUESTS",
                "type": "forbidden_import",
                "target": "requests",
                "severity": "high"
            }
        ]
    }
    raw_content = json.dumps(arch_payload)
    val_res = client.post("/api/v1/architectures/validate", json={"raw_content": raw_content, "format": "json"})
    assert val_res.status_code == 200
    assert val_res.json()["is_valid"] is True

    create_res = client.post("/api/v1/architectures", json={
        "project_id": p1["id"],
        "name": "Alpha Policy",
        "format": "json",
        "raw_content": raw_content
    })
    assert create_res.status_code == 201
    arch_p1 = create_res.json()
    assert arch_p1["project_id"] == p1["id"]
    assert arch_p1["is_active"] is True
    assert arch_p1["version"] == 1

    # 4. Try scanning Project Beta using Project Alpha's architecture_id -> must be rejected
    scan_mismatch = client.post("/api/v1/scans", json={
        "project_id": p2["id"],
        "architecture_id": arch_p1["id"]
    })
    assert scan_mismatch.status_code == 400
    assert "belongs to another project" in scan_mismatch.json()["detail"]

    # 5. Try scanning Project Beta using a nonexistent architecture_id -> must be rejected
    scan_nonexistent = client.post("/api/v1/scans", json={
        "project_id": p2["id"],
        "architecture_id": "00000000-0000-0000-0000-000000000000"
    })
    assert scan_nonexistent.status_code == 400
    assert "was not found" in scan_nonexistent.json()["detail"]

    # 6. Verify Project Alpha list includes the saved definition
    list_p1 = client.get(f"/api/v1/architectures/project/{p1['id']}")
    assert list_p1.status_code == 200
    assert len(list_p1.json()) == 1
    assert list_p1.json()[0]["id"] == arch_p1["id"]

    # 7. Verify Project Beta list is empty
    list_p2 = client.get(f"/api/v1/architectures/project/{p2['id']}")
    assert list_p2.status_code == 200
    assert len(list_p2.json()) == 0

    # 8. Create a second version for Project Alpha
    v2_payload = dict(arch_payload)
    v2_payload["project_name"] = "Alpha Architecture v2"
    create_v2 = client.post("/api/v1/architectures", json={
        "project_id": p1["id"],
        "name": "Alpha Policy v2",
        "format": "json",
        "raw_content": json.dumps(v2_payload)
    })
    assert create_v2.status_code == 201
    arch_v2 = create_v2.json()
    assert arch_v2["version"] == 2
    assert arch_v2["is_active"] is True

    # Check that previous version was deactivated
    list_p1_updated = client.get(f"/api/v1/architectures/project/{p1['id']}").json()
    assert len(list_p1_updated) == 2
    v1_rechecked = next(a for a in list_p1_updated if a["id"] == arch_p1["id"])
    assert v1_rechecked["is_active"] is False

    # 9. Test activating v1 again
    act_res = client.patch(f"/api/v1/architectures/{arch_p1['id']}/activate")
    assert act_res.status_code == 200
    assert act_res.json()["is_active"] is True

    # 10. Test deleting v2
    del_res = client.delete(f"/api/v1/architectures/{arch_v2['id']}")
    assert del_res.status_code == 204
    list_after_del = client.get(f"/api/v1/architectures/project/{p1['id']}").json()
    assert len(list_after_del) == 1

