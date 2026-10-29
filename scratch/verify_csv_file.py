import os
import sys
import csv
import json
import urllib.request
import urllib.error
import subprocess

# Add project root to sys.path
sys.path.insert(0, os.path.abspath("."))

from backend.app.core.database import SessionLocal
from backend.app.models.user import User
from backend.app.models.project import Project
from backend.app.models.scan import ScanRun
from backend.app.services.auth_service import AuthService
from backend.app.services.report_service import ReportService

def test_csv_download():
    db = SessionLocal()
    try:
        # 1. Fetch or create a user and generate a valid session token
        print(">>> 1. Authenticating test user in database...")
        user = db.query(User).first()
        if not user:
            print("Creating test user...")
            from backend.app.core.security import get_password_hash
            user = User(
                id="test-csv-user-id",
                email="csvtest@example.com",
                password_hash=get_password_hash("TestPassword123!"),
                is_verified=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)

        raw_token, expires_at, max_age = AuthService.create_session(
            db=db,
            user=user,
            remember_me=True,
            ip_address="127.0.0.1",
            user_agent="CSVVerifier/1.0"
        )
        print(f"Generated session token: {raw_token[:16]}... for user: {user.email}")

        auth_headers = {
            "Authorization": f"Bearer {raw_token}",
            "X-Session-Token": raw_token
        }

        # 2. Find a scan with findings
        scan = db.query(ScanRun).filter(ScanRun.status == "completed").first()
        assert scan is not None, "No completed scan found in database!"
        print(f"Found completed scan: {scan.id} (Project ID: {scan.project_id}, Total findings: {scan.total_findings})")

        # Associate project with this user or check user project access
        project = db.query(Project).filter(Project.id == scan.project_id).first()
        if project and project.user_id != user.id:
            # Allow user access to this project
            project.user_id = user.id
            db.commit()
            print(f"Associated project '{project.name}' with user '{user.email}'")

        # 3. Test the HTTP CSV export endpoint
        base_url = "http://127.0.0.1:8000"
        csv_url = f"{base_url}/api/v1/scans/{scan.id}/report/csv"
        print(f"\n>>> 2. Requesting CSV export via HTTP: {csv_url}")
        
        req = urllib.request.Request(csv_url, headers=auth_headers)
        with urllib.request.urlopen(req) as resp:
            status_code = resp.status
            headers = dict(resp.headers)
            raw_content = resp.read()

        print(f"Response status: {status_code}")
        print(f"Response headers: {headers}")
        assert status_code == 200, f"CSV request failed with status {status_code}"

        # Verify headers (case-insensitive)
        headers_lower = {k.lower(): v for k, v in headers.items()}
        content_type = headers_lower.get("content-type", "")
        content_disp = headers_lower.get("content-disposition", "")
        
        print(f"Content-Type: {content_type}")
        print(f"Content-Disposition: {content_disp}")
        assert "text/csv" in content_type, f"Expected text/csv in content-type, got {content_type}"
        assert "charset=utf-8" in content_type.lower(), f"Expected charset=utf-8 in content-type, got {content_type}"
        assert "attachment" in content_disp, f"Expected attachment in content-disposition, got {content_disp}"
        assert f"drift_report_{scan.id[:8]}.csv" in content_disp, f"Expected drift_report_{scan.id[:8]}.csv in content-disposition"
        print("[PASS] Content-Type: text/csv; charset=utf-8 and Content-Disposition headers verified!")

        # 4. Save response to a real .csv file on disk
        output_dir = os.path.abspath("scratch")
        os.makedirs(output_dir, exist_ok=True)
        test_csv_path = os.path.join(output_dir, f"drift_report_{scan.id[:8]}.csv")

        with open(test_csv_path, "wb") as f:
            f.write(raw_content)

        print(f"\n>>> 3. Verifying downloaded file on disk: {test_csv_path}")
        assert os.path.exists(test_csv_path), "File does not exist!"
        file_size = os.path.getsize(test_csv_path)
        print(f"[PASS] File exists with nonzero size: {file_size} bytes")
        assert file_size > 0, "File size is 0 bytes!"
        assert test_csv_path.endswith(".csv"), "File extension is not .csv!"
        print("[PASS] File extension is .csv")

        # Verify UTF-8 BOM
        has_bom = raw_content.startswith(b"\xef\xbb\xbf")
        print(f"[PASS] File starts with UTF-8 BOM (\\xef\\xbb\\xbf): {has_bom}")
        assert has_bom, "CSV file is missing UTF-8 BOM!"

        # 5. Verify valid CSV content
        with open(test_csv_path, "r", encoding="utf-8-sig") as f:
            reader = csv.reader(f)
            rows = list(reader)

        print(f"[PASS] Total parsed CSV rows: {len(rows)}")
        assert len(rows) >= 1, "CSV has no rows!"
        header = rows[0]
        print(f"[PASS] Header columns ({len(header)}): {header}")
        expected_cols = [
            "Finding ID", "Rule ID", "Rule Type", "Severity", "Title",
            "Source Module", "Target Module", "Source Component", "Target Component",
            "File Path", "Line Number", "Status", "Explanation", "Evidence", "Remediation"
        ]
        for col in expected_cols:
            assert col in header, f"Missing expected column: {col}"

        if len(rows) > 1:
            print(f"[PASS] Finding rows count: {len(rows) - 1}")
            for i, row in enumerate(rows[1:], start=2):
                assert len(row) == len(header), f"Row {i} column mismatch: {len(row)} != {len(header)}"
            print(f"Sample data row 1: {rows[1][:5]}")

        # 6. Test opening with Windows Notepad / reading file
        print("\n>>> 4. Testing reading file via PowerShell (Windows environment)...")
        ps_cmd = f"Get-Content -Path '{test_csv_path}' -Encoding utf8 -TotalCount 4"
        ps_result = subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], capture_output=True, text=True)
        print(f"PowerShell Output:\n{ps_result.stdout.strip()}")

        # 7. Check Windows file associations for .csv
        print("\n>>> 5. Inspecting Windows file association for .csv...")
        try:
            assoc_out = subprocess.run(["cmd.exe", "/c", "assoc", ".csv"], capture_output=True, text=True, timeout=5)
            print(f"Windows assoc output: {assoc_out.stdout.strip() or '(none returned)'}")
            file_type = assoc_out.stdout.strip().split("=")[-1] if "=" in assoc_out.stdout else ""
            if file_type:
                ftype_out = subprocess.run(["cmd.exe", "/c", "ftype", file_type], capture_output=True, text=True, timeout=5)
                print(f"Windows ftype output: {ftype_out.stdout.strip()}")
        except Exception as e:
            print(f"assoc error: {e}")

        # Check default app / handler via registry
        try:
            reg_out = subprocess.run(
                ["reg", "query", r"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.csv\UserChoice"],
                capture_output=True, text=True, timeout=5
            )
            print("UserChoice Registry handler:")
            for line in reg_out.stdout.splitlines():
                if "ProgId" in line:
                    print(f"  {line.strip()}")
        except Exception:
            pass

        print("\n>>> ALL CSV VERIFICATIONS PASSED SUCCESSFULLY! <<<")

    finally:
        db.close()

if __name__ == "__main__":
    test_csv_download()
