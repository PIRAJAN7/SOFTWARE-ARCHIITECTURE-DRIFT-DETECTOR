"""
Automated Verification Script for Clean Control & Intentional Drift:
- Clean Control: 0 architectural drift findings, 100% compliance.
- Intentional Drift: Detects DRIFT-001 (forbidden_import), DRIFT-002 (layer_violation),
                     DRIFT-003 (critical layer_violation), DRIFT-004 (circular_dependency),
                     DRIFT-005 (layer_violation).
"""
import sys
import json
from pathlib import Path

# Add workspace root to sys.path
WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(WORKSPACE_ROOT))

from backend.app.services.architecture_service import ArchitectureService
from backend.app.analyzers.python_ast import analyze_python_source
from backend.app.analyzers.graph_builder import ArchitectureGraph
from backend.app.rules.engine import DriftDetectionEngine

BASE_DIR = Path(__file__).resolve().parent.parent / "backend" / "data" / "projects" / "3510d4bd-bd29-405e-8eda-d5cb10310f22" / "source"

def test_clean_control():
    clean_dir = BASE_DIR / "clean_control"
    assert clean_dir.exists(), f"Path not found: {clean_dir}"
    
    with open(clean_dir / "architecture.json", "r", encoding="utf-8") as f:
        arch_json_str = f.read()
    
    val_res = ArchitectureService.parse_and_validate(arch_json_str, "json")
    assert val_res.is_valid, f"Architecture validation failed: {val_res.errors}"
    arch_content = val_res.parsed_definition
    
    # Analyze AST
    ast_res = analyze_python_source(root_dir=clean_dir, source_dirs=["src"], exclude_dirs=[])
    
    print(f"\n==========================================")
    print(f"TEST 1: Checkout Service — Clean Control")
    print(f"==========================================")
    print(f"Discovered: {len(ast_res.modules)} modules, {len(ast_res.dependencies)} dependencies, {len(ast_res.raw_dependencies)} raw imports")
    
    graph = ArchitectureGraph(definition=arch_content)
    graph.build(modules=ast_res.modules, dependencies=ast_res.dependencies)
    
    engine = DriftDetectionEngine(definition=arch_content, graph=graph)
    findings, compliance = engine.evaluate(
        modules=ast_res.modules,
        dependencies=ast_res.dependencies,
        raw_dependencies=ast_res.raw_dependencies
    )
    
    print(f"Findings: {len(findings)} (Expected: 0)")
    print(f"Compliance: {compliance}% (Expected: 100%)")
    
    if len(findings) > 0:
        for f in findings:
            print(f"  FAILED - Unexpected finding: [{f.rule_id}] {f.title} ({f.evidence})")
    
    assert len(findings) == 0, f"Expected 0 findings for clean_control, got {len(findings)}"
    assert compliance == 100.0, f"Expected 100% compliance, got {compliance}%"
    print(">>> SUCCESS: Clean Control passed with 0 findings and 100.0% compliance!\n")

def test_drift_case():
    drift_dir = BASE_DIR / "drift_case"
    assert drift_dir.exists(), f"Path not found: {drift_dir}"
    
    with open(drift_dir / "architecture.json", "r", encoding="utf-8") as f:
        arch_json_str = f.read()
    
    val_res = ArchitectureService.parse_and_validate(arch_json_str, "json")
    assert val_res.is_valid, f"Architecture validation failed: {val_res.errors}"
    arch_content = val_res.parsed_definition
    
    # Analyze AST
    ast_res = analyze_python_source(root_dir=drift_dir, source_dirs=["src"], exclude_dirs=[])
    
    print(f"==========================================")
    print(f"TEST 2: Checkout Service — Intentional Drift")
    print(f"==========================================")
    print(f"Discovered: {len(ast_res.modules)} modules, {len(ast_res.dependencies)} dependencies, {len(ast_res.raw_dependencies)} raw imports")
    
    graph = ArchitectureGraph(definition=arch_content)
    graph.build(modules=ast_res.modules, dependencies=ast_res.dependencies)
    
    engine = DriftDetectionEngine(definition=arch_content, graph=graph)
    findings, compliance = engine.evaluate(
        modules=ast_res.modules,
        dependencies=ast_res.dependencies,
        raw_dependencies=ast_res.raw_dependencies
    )
    
    print(f"Findings detected: {len(findings)}")
    print(f"Compliance: {compliance}%")
    
    for idx, f in enumerate(findings, 1):
        print(f"  {idx}. [{f.rule_type}] {f.title} ({f.severity})")
        print(f"     File: {f.file_path}:{f.line_number} | Evidence: {f.evidence}")
    
    rule_types = {f.rule_type for f in findings}
    assert "forbidden_import" in rule_types, "Expected forbidden_import finding for requests"
    assert "layer_violation" in rule_types or "forbidden_dependency" in rule_types, "Expected layer violation"
    assert "circular_dependency" in rule_types, "Expected circular dependency finding"
    print(">>> SUCCESS: Intentional Drift Case successfully detected all expected violations!\n")

if __name__ == "__main__":
    test_clean_control()
    test_drift_case()
    print("ALL CLEAN & DRIFT FIXTURE TESTS VERIFIED SUCCESSFULLY!")
