import os
import sys
import io
import csv
import json
import zipfile
import httpx

API_BASE = "http://127.0.0.1:8000/api/v1"

def run_tests():
    print("=" * 60)
    print("RUNNING EXPORTS & ANIMATED ASSISTANT INTEGRATION TESTS")
    print("=" * 60)

    client = httpx.Client(timeout=30.0)

    # 1. Register & Login Test User
    email = f"test_export_assistant_{os.getpid()}@example.com"
    pwd = "SecurePassword123!"

    reg_resp = client.post(f"{API_BASE}/auth/register", json={
        "email": email,
        "password": pwd,
        "full_name": "Export Assistant Tester"
    })
    assert reg_resp.status_code in (200, 201), f"Register failed: {reg_resp.text}"

    # Dev token verify
    mail_resp = client.get(f"{API_BASE}/auth/dev/mailbox/latest")
    token = mail_resp.json().get("token")
    if token:
        v_resp = client.post(f"{API_BASE}/auth/verify-email", json={"token": token})
        assert v_resp.status_code == 200

    login_resp = client.post(f"{API_BASE}/auth/login", json={"email": email, "password": pwd})
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    auth_token = login_resp.json().get("session_token")
    headers = {
        "Authorization": f"Bearer {auth_token}",
        "X-Session-Token": auth_token
    }

    # 2. Create Project
    proj_resp = client.post(f"{API_BASE}/projects", json={
        "name": "Audit Export Test Project",
        "description": "Validating CSV, JSON exports and assistant responses"
    }, headers=headers)
    assert proj_resp.status_code in (200, 201), f"Create project failed: {proj_resp.text}"
    project = proj_resp.json()
    project_id = project["id"]
    print(f"[OK] Project created: {project_id}")

    # 3. Create Architecture with layered rules
    arch_payload = {
        "project_id": project_id,
        "name": "Strict Tiered Policy",
        "format": "json",
        "raw_content": json.dumps({
            "name": "Strict Tiered Policy",
            "version": "1.0",
            "components": [
                {"name": "presentation", "patterns": ["presentation/**"]},
                {"name": "domain", "patterns": ["domain/**"]},
                {"name": "infrastructure", "patterns": ["infrastructure/**"]}
            ],
            "rules": [
                {
                    "id": "rule_pres_to_dom",
                    "type": "layer_dependency",
                    "source": "presentation",
                    "target": "domain",
                    "severity": "critical"
                },
                {
                    "id": "rule_dom_no_pres",
                    "type": "forbidden_dependency",
                    "source": "domain",
                    "target": "presentation",
                    "severity": "critical"
                }
            ]
        })
    }
    arch_resp = client.post(f"{API_BASE}/architectures", json=arch_payload, headers=headers)
    assert arch_resp.status_code in (200, 201), f"Create arch failed: {arch_resp.text}"
    arch_id = arch_resp.json()["id"]
    client.patch(f"{API_BASE}/architectures/{arch_id}/activate", headers=headers)
    print(f"[OK] Architecture activated: {arch_id}")

    # 4. Upload ZIP with intentional drift: domain imports presentation
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("presentation/views.py", "from domain.models import Item\n")
        zf.writestr("domain/models.py", "class Item: pass\nfrom presentation.views import ItemView\n")
    zip_buf.seek(0)

    up_resp = client.post(
        f"{API_BASE}/projects/{project_id}/upload",
        files={"file": ("project.zip", zip_buf.getvalue(), "application/zip")},
        headers=headers
    )
    assert up_resp.status_code in (200, 201), f"Upload failed: {up_resp.text}"
    print("[OK] Project source code uploaded")

    # 5. Trigger Scan
    scan_resp = client.post(f"{API_BASE}/scans", json={"project_id": project_id}, headers=headers)
    assert scan_resp.status_code in (200, 201), f"Scan failed: {scan_resp.text}"
    scan = scan_resp.json()
    scan_id = scan["id"]
    print(f"[OK] Scan completed: id={scan_id}, findings={scan['total_findings']}, compliance={scan['compliance_percentage']}%")

    # 6. Test CSV Findings Export
    csv_resp = client.get(f"{API_BASE}/scans/{scan_id}/report/csv", headers=headers)
    assert csv_resp.status_code == 200, f"CSV export failed: {csv_resp.status_code}"
    assert "text/csv" in csv_resp.headers.get("content-type", "")
    assert "attachment" in csv_resp.headers.get("content-disposition", "")

    csv_bytes = csv_resp.content
    assert csv_bytes.startswith(b"\xef\xbb\xbf"), "CSV missing UTF-8 BOM"

    csv_text = csv_bytes.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(csv_text))
    rows = list(reader)
    assert len(rows) >= 2, "CSV should contain headers and at least one finding row"
    headers_row = rows[0]
    expected_headers = [
        "Finding ID", "Project Name", "Scan ID", "Scan Date", "Rule ID",
        "Finding Type", "Severity", "Title", "Description", "Source Module",
        "Target Module", "Source Component", "Target Component", "Source Layer",
        "Target Layer", "File Path", "Line Number", "Violation Status",
        "Evidence", "Recommended Action"
    ]
    for h in expected_headers:
        assert h in headers_row, f"Missing header in CSV: {h}"
    print(f"[OK] CSV Export verified: {len(headers_row)} columns, {len(rows)-1} finding row(s), UTF-8 BOM verified")

    # 7. Test JSON Scan Report Export
    json_resp = client.get(f"{API_BASE}/scans/{scan_id}/report/json", headers=headers)
    assert json_resp.status_code == 200
    report_data = json_resp.json()
    assert report_data.get("schema_version") == "1.0", f"Invalid schema version: {report_data.get('schema_version')}"
    assert "exported_at" in report_data
    assert report_data["project"]["id"] == project_id
    assert report_data["project"]["name"] == "Audit Export Test Project"
    assert report_data["scan"]["id"] == scan_id
    assert "compliance_score" in report_data["scan"]
    assert "summary" in report_data
    assert report_data["summary"]["total_findings"] >= 1
    assert len(report_data["findings"]) >= 1
    sample_finding = report_data["findings"][0]
    assert "id" in sample_finding
    assert "rule_id" in sample_finding
    assert "type" in sample_finding
    assert "severity" in sample_finding
    print(f"[OK] JSON Report Export verified: Schema 1.0, score={report_data['scan']['compliance_score']}%, findings={report_data['summary']['total_findings']}")

    # 8. Test Project History CSV & JSON Exports
    hist_csv_resp = client.get(f"{API_BASE}/projects/{project_id}/report/csv", headers=headers)
    assert hist_csv_resp.status_code == 200
    assert hist_csv_resp.content.startswith(b"\xef\xbb\xbf")
    hist_reader = csv.reader(io.StringIO(hist_csv_resp.content.decode("utf-8-sig")))
    hist_rows = list(hist_reader)
    assert len(hist_rows) >= 2
    assert "Scan ID" in hist_rows[0]
    assert any("compliance" in col.lower() for col in hist_rows[0])
    print(f"[OK] Project History CSV verified: {len(hist_rows)-1} scan run(s)")

    hist_json_resp = client.get(f"{API_BASE}/projects/{project_id}/report/json", headers=headers)
    assert hist_json_resp.status_code == 200
    hist_data = hist_json_resp.json()
    assert hist_data["report_type"] == "project_scan_history"
    assert len(hist_data["scans"]) >= 1
    print(f"[OK] Project History JSON verified: {len(hist_data['scans'])} scan record(s)")

    # 9. Test Assistant Chat API (Character A: Archee & Character B: Dex)
    # Test Archee (Guide)
    chat_resp_a = client.post(f"{API_BASE}/ai/assistant-chat", json={
        "question": "What is architecture drift?",
        "character": "guide",
        "project_id": project_id,
        "scan_id": scan_id,
        "page_context": "/overview"
    }, headers=headers)
    assert chat_resp_a.status_code == 200, f"Assistant chat failed: {chat_resp_a.text}"
    ans_a = chat_resp_a.json()
    assert ans_a["character"] == "guide"
    assert len(ans_a["answer"]) > 20
    assert "drift" in ans_a["answer"].lower()
    print(f"[OK] Archee (Guide) AI response verified: '{ans_a['answer'][:60]}...'")

    # Test Dex (Detective) with violation inquiry
    chat_resp_b = client.post(f"{API_BASE}/ai/assistant-chat", json={
        "question": "What does this violation mean and how do I fix it?",
        "character": "detective",
        "project_id": project_id,
        "scan_id": scan_id,
        "page_context": "/findings"
    }, headers=headers)
    assert chat_resp_b.status_code == 200, f"Assistant chat failed: {chat_resp_b.text}"
    ans_b = chat_resp_b.json()
    assert ans_b["character"] == "detective"
    assert len(ans_b["answer"]) > 20
    assert "suggested_actions" in ans_b
    print(f"[OK] Dex (Detective) AI response verified: '{ans_b['answer'][:60]}...'")

    # Test Circular Dependency inquiry
    chat_resp_c = client.post(f"{API_BASE}/ai/assistant-chat", json={
        "question": "How do I fix a circular dependency?",
        "character": "detective",
        "project_id": project_id
    }, headers=headers)
    assert chat_resp_c.status_code == 200
    ans_c = chat_resp_c.json()
    assert "circular" in ans_c["answer"].lower() or "cycle" in ans_c["answer"].lower()
    print(f"[OK] Circular dependency explanation verified")

    print("\n" + "=" * 60)
    print("ALL EXPORT & ASSISTANT TESTS PASSED SUCCESSFULLY (100% PASS RATE)")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
