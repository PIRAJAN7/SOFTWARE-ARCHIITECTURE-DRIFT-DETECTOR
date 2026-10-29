import os
import sys
import zipfile
import io
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, os.path.abspath("."))

from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.core.database import SessionLocal
from backend.app.models.project import Project
from backend.app.models.user import User

from backend.app.services.auth_service import AuthService
from backend.app.core.config import settings

def test_zip_upload_and_scan():
    client = TestClient(app)
    db = SessionLocal()
    try:
        # Find test user
        user = db.query(User).filter(User.email == "architect@enterprise.com").first()
        if not user:
            user = db.query(User).first()
        assert user is not None, "No test user found!"

        token, _, _ = AuthService.create_session(db, user)
        client.cookies.set(settings.SESSION_COOKIE_NAME, token)
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create a test project for ZIP upload
        proj_res = client.post("/api/v1/projects", json={
            "name": "ZIP Test Project",
            "description": "Project created to test safe ZIP archive upload and extraction",
            "primary_language": "python",
            "source_dirs": "src",
            "exclude_dirs": ".git,__pycache__"
        }, headers=headers)
        assert proj_res.status_code == 201, f"Failed to create project: {proj_res.text}"
        proj_data = proj_res.json()
        proj_id = proj_data["id"]
        print(f"[OK] Created test project '{proj_data['name']}' (id: {proj_id})")

        # 2. Build in-memory ZIP archive with sample python files
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("src/presentation/__init__.py", "")
            zf.writestr("src/presentation/controller.py", "from src.service.core import do_work\n\ndef run():\n    return do_work()\n")
            zf.writestr("src/service/__init__.py", "")
            zf.writestr("src/service/core.py", "def do_work():\n    return 'done'\n")
        zip_buffer.seek(0)

        # 3. Upload ZIP file
        upload_res = client.post(
            f"/api/v1/projects/{proj_id}/upload",
            files={"file": ("test_archive.zip", zip_buffer, "application/zip")},
            headers=headers
        )
        assert upload_res.status_code == 200, f"Upload failed: {upload_res.text}"
        upload_data = upload_res.json()
        print(f"[OK] ZIP uploaded successfully: {upload_data['message']}")
        repo_path = upload_data["repository_path"]
        assert os.path.exists(repo_path), f"Extracted repository path does not exist: {repo_path}"
        assert os.path.exists(os.path.join(repo_path, "src", "presentation", "controller.py"))
        assert os.path.exists(os.path.join(repo_path, "src", "service", "core.py"))
        print(f"[OK] Verified extracted files in: {repo_path}")

        # 4. Create layered architecture for the project
        arch_res = client.post("/api/v1/architectures", json={
            "project_id": proj_id,
            "name": "Layered ZIP Policy",
            "format": "json",
            "raw_content": json.dumps({
                "name": "Layered ZIP Policy",
                "components": [
                    {"name": "presentation", "layer": 1, "path_patterns": ["src/presentation/**"], "allowed_dependencies": ["service"]},
                    {"name": "service", "layer": 2, "path_patterns": ["src/service/**"], "allowed_dependencies": []}
                ],
                "rules": [
                    {"id": "RULE-LAYER", "type": "layer_direction", "layer_direction": "downward_only", "severity": "high", "description": "Downward only"}
                ]
            })
        }, headers=headers)
        assert arch_res.status_code == 201, f"Failed to save architecture: {arch_res.text}"
        arch_id = arch_res.json()["id"]
        print(f"[OK] Architecture created: {arch_id}")

        # 5. Scan the project
        scan_res = client.post("/api/v1/scans", json={
            "project_id": proj_id,
            "architecture_id": arch_id
        }, headers=headers)
        assert scan_res.status_code == 201, f"Scan failed: {scan_res.text}"
        scan_data = scan_res.json()
        assert scan_data["status"] == "completed"
        assert scan_data["files_analyzed"] >= 2
        print(f"[OK] Scan completed successfully on uploaded ZIP code! Compliance: {scan_data['compliance_percentage']}%")

        # 6. Cleanup test project
        del_res = client.delete(f"/api/v1/projects/{proj_id}", headers=headers)
        assert del_res.status_code == 204
        print(f"[OK] Cleaned up test project {proj_id}")

        print("\nAll ZIP upload tests passed successfully!")
    finally:
        db.close()

if __name__ == "__main__":
    import json
    test_zip_upload_and_scan()
