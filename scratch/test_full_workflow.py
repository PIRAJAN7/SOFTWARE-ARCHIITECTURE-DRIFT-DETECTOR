import os
import sys
import json
import uuid
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, os.path.abspath("."))

from backend.app.core.database import SessionLocal
from backend.app.models.project import Project
from backend.app.models.architecture import ArchitectureDefinition
from backend.app.models.scan import ScanRun
from backend.app.models.finding import Finding
from backend.app.services.scan_service import ScanService
from backend.app.services.architecture_service import ArchitectureService

def test_full_sample_workflow():
    db = SessionLocal()
    try:
        # 1. Fetch Sample project
        sample_proj = db.query(Project).filter(Project.name == "Sample").first()
        assert sample_proj is not None, "Sample project not found in database!"
        print(f"[OK] Found project '{sample_proj.name}' (id: {sample_proj.id})")

        # Ensure no residual architecture for Sample from previous test
        db.query(ArchitectureDefinition).filter(ArchitectureDefinition.project_id == sample_proj.id).delete()
        db.commit()

        # 2. Test scanning without architecture -> must fail cleanly with descriptive error
        try:
            ScanService.run_scan(db=db, project_id=sample_proj.id, )
            assert False, "Scan should have failed due to missing architecture definition!"
        except Exception as e:
            assert "No architecture definition found" in str(e)
            print(f"[OK] Correctly rejected scan when architecture missing: {e}")

        # 3. Test cross-project isolation: try scanning Sample with another project's architecture_id
        other_arch = db.query(ArchitectureDefinition).filter(ArchitectureDefinition.project_id != sample_proj.id).first()
        if other_arch:
            try:
                ScanService.run_scan(db=db, project_id=sample_proj.id, architecture_id=other_arch.id, )
            except Exception as e:
                assert "belongs to another project" in str(e) or "not found" in str(e) or "does not belong" in str(e)
                print(f"[OK] Cross-project isolation confirmed: {e}")

        # 4. Create and save architecture definition for Sample
        arch_json_path = Path("backend/data/projects") / sample_proj.id / "source" / "drift_case" / "architecture.json"
        if not arch_json_path.exists():
            arch_json_path = Path("test_fixtures/drift_case/architecture.json")
        
        with open(arch_json_path, "r", encoding="utf-8") as f:
            arch_content = f.read()

        validation = ArchitectureService.parse_and_validate(arch_content, "json")
        assert validation.is_valid, f"Architecture content failed validation: {validation.errors}"
        print("[OK] Architecture content parsed and validated successfully")

        parsed = validation.parsed_definition
        # Save to DB
        arch_record = ArchitectureDefinition(
            id=str(uuid.uuid4()),
            project_id=sample_proj.id,
            name="Sample Drift Architecture Policy",
            description="Policy enforcing 4-tier layer isolation, cycle prevention, and external import rules",
            version=1,
            format="json",
            raw_content=arch_content,
            components_data=json.dumps([c.model_dump() for c in parsed.components]) if parsed else "[]",
            rules_data=json.dumps([r.model_dump() for r in parsed.rules]) if parsed else "[]",
            is_active=True
        )
        db.add(arch_record)
        db.commit()
        db.refresh(arch_record)
        print(f"[OK] Saved active architecture definition '{arch_record.name}' (id: {arch_record.id}) for Sample")

        # 5. Reload from DB and verify persisted fields
        reloaded = db.query(ArchitectureDefinition).filter(
            ArchitectureDefinition.id == arch_record.id,
            ArchitectureDefinition.project_id == sample_proj.id
        ).first()
        assert reloaded is not None
        assert reloaded.is_active is True
        reloaded_comps = json.loads(reloaded.components_data) if reloaded.components_data else []
        reloaded_rules = json.loads(reloaded.rules_data) if reloaded.rules_data else []
        assert len(reloaded_comps) >= 4
        assert len(reloaded_rules) >= 4
        print(f"[OK] Verified persistence: {len(reloaded_comps)} components, {len(reloaded_rules)} rules")

        # 6. Execute full architecture scan for Sample
        scan = ScanService.run_scan(
            db=db,
            project_id=sample_proj.id,
            architecture_id=arch_record.id,
            
            source_version="v1.0-test"
        )
        assert scan.status == "completed", f"Scan status is {scan.status}, error: {scan.error_message}"
        assert scan.architecture_id == arch_record.id
        print(f"[OK] Scan completed successfully! Score: {scan.compliance_percentage}%, Findings count: {scan.total_findings}")

        # 7. Check persisted findings in DB
        findings = db.query(Finding).filter(Finding.scan_id == scan.id).all()
        assert len(findings) > 0, "Expected drift findings were not generated!"
        print(f"[OK] Verified {len(findings)} findings persisted in DB:")
        rule_types_found = set()
        for f in findings:
            rule_types_found.add(f.rule_type)
            print(f"   [{f.severity.upper()}] {f.rule_type}: {f.title} (File: {f.file_path})")

        assert "forbidden_import" in rule_types_found, "forbidden_import finding (requests) missing!"
        print("[OK] Successfully detected forbidden_import rule violation!")

        # 8. Check scan run history in DB
        history = db.query(ScanRun).filter(ScanRun.project_id == sample_proj.id).order_by(ScanRun.created_at.desc()).all()
        assert len(history) >= 1
        print(f"[OK] Scan history for project '{sample_proj.name}' contains {len(history)} run(s)")

        print("\nAll integration checks passed successfully!")
    finally:
        db.close()

if __name__ == "__main__":
    test_full_sample_workflow()
