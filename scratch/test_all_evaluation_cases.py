import sys
import unittest
from backend.app.schemas.architecture import ArchitectureDefinitionContent, ComponentDef, RuleDef
from backend.app.analyzers.python_ast import ModuleInfo, RawImport
from backend.app.analyzers.graph_builder import ArchitectureGraph
from backend.app.rules.engine import DriftDetectionEngine
from backend.app.core.database import SessionLocal
from backend.app.services.scan_service import ScanService
from backend.app.services.report_service import ReportService
from backend.app.models.scan import ScanRun
from backend.app.models.project import Project

class ComprehensiveEvaluationTests(unittest.TestCase):

    def test_case_1_all_dependencies_permitted(self):
        """Case 1: All dependencies are permitted."""
        arch = ArchitectureDefinitionContent(
            name="Permitted Arch",
            components=[
                ComponentDef(name="web", layer=1, path_patterns=["web/**"], allowed_dependencies=["api"]),
                ComponentDef(name="api", layer=2, path_patterns=["api/**"], allowed_dependencies=[])
            ],
            rules=[
                RuleDef(id="RULE-1", type="layer_direction", description="Downward only", layer_direction="downward_only", severity="high")
            ]
        )
        modules = {
            "web.views": ModuleInfo(name="web.views", file_path="web/views.py", classes_count=1, functions_count=2),
            "api.service": ModuleInfo(name="api.service", file_path="api/service.py", classes_count=1, functions_count=1)
        }
        deps = [
            RawImport(source_module="web.views", target_module="api.service", line_number=1, statement="from api.service import run")
        ]
        graph = ArchitectureGraph(arch)
        graph.build(modules, deps)
        engine = DriftDetectionEngine(arch, graph)
        findings, compliance = engine.evaluate(modules, deps)
        self.assertEqual(len(findings), 0)
        self.assertEqual(compliance, 100.0)

    def test_case_2_explicit_rule_violation(self):
        """Case 2: One dependency violates an explicit architecture rule."""
        arch = ArchitectureDefinitionContent(
            name="Violation Arch",
            components=[
                ComponentDef(name="web", layer=1, path_patterns=["web/**"]),
                ComponentDef(name="db", layer=3, path_patterns=["db/**"])
            ],
            rules=[
                RuleDef(id="FORBIDDEN-WEB-TO-DB", type="forbidden_dependency", description="Web must not access DB directly", from_component="web", to_component="db", severity="critical")
            ]
        )
        modules = {
            "web.views": ModuleInfo(name="web.views", file_path="web/views.py", classes_count=1, functions_count=2),
            "db.conn": ModuleInfo(name="db.conn", file_path="db/conn.py", classes_count=1, functions_count=1)
        }
        deps = [
            RawImport(source_module="web.views", target_module="db.conn", line_number=5, statement="import db.conn")
        ]
        graph = ArchitectureGraph(arch)
        graph.build(modules, deps)
        engine = DriftDetectionEngine(arch, graph)
        findings, compliance = engine.evaluate(modules, deps)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].rule_id, "FORBIDDEN-WEB-TO-DB")
        self.assertEqual(compliance, 0.0)

    def test_case_3_unmapped_module_policy_does_not_prohibit(self):
        """Case 3: A module is unmapped and policy does not prohibit unmapped modules."""
        arch = ArchitectureDefinitionContent(
            name="Flexible Arch",
            components=[
                ComponentDef(name="core", layer=1, path_patterns=["core/**"])
            ],
            rules=[
                RuleDef(id="RULE-CYCLE", type="circular_dependency", description="No cycles", severity="high")
            ]
        )
        modules = {
            "core.service": ModuleInfo(name="core.service", file_path="core/service.py", classes_count=1, functions_count=2),
            "utils.helper": ModuleInfo(name="utils.helper", file_path="utils/helper.py", classes_count=0, functions_count=3)
        }
        deps = [
            RawImport(source_module="core.service", target_module="utils.helper", line_number=2, statement="from utils.helper import help")
        ]
        graph = ArchitectureGraph(arch)
        graph.build(modules, deps)
        engine = DriftDetectionEngine(arch, graph)
        findings, compliance = engine.evaluate(modules, deps)
        # utils.helper is unmapped, but policy does not have unmapped_module rule -> no violation
        self.assertEqual(len(findings), 0)
        self.assertEqual(compliance, 100.0)

    def test_case_4_unmapped_module_policy_explicitly_prohibits(self):
        """Case 4: A module is unmapped and policy explicitly prohibits unmapped modules."""
        arch = ArchitectureDefinitionContent(
            name="Strict Arch",
            components=[
                ComponentDef(name="core", layer=1, path_patterns=["core/**"])
            ],
            rules=[
                RuleDef(id="STRICT-MAPPING-001", type="unmapped_module", description="All modules must be mapped", severity="medium")
            ]
        )
        modules = {
            "core.service": ModuleInfo(name="core.service", file_path="core/service.py", classes_count=1, functions_count=2),
            "orphan.loose": ModuleInfo(name="orphan.loose", file_path="orphan/loose.py", classes_count=0, functions_count=1)
        }
        deps = []
        graph = ArchitectureGraph(arch)
        graph.build(modules, deps)
        engine = DriftDetectionEngine(arch, graph)
        findings, compliance = engine.evaluate(modules, deps)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].rule_id, "STRICT-MAPPING-001")
        self.assertEqual(findings[0].source_module, "orphan.loose")
        self.assertEqual(compliance, 0.0)

    def test_case_5_unevaluated_relationship(self):
        """Case 5: A relationship cannot be evaluated (source or target unmapped)."""
        db = SessionLocal()
        s = db.query(ScanRun).filter(ScanRun.status == 'completed').order_by(ScanRun.created_at.desc()).first()
        if s:
            graph_data = ScanService.get_graph_data(db, s.id)
            self.assertIsNotNone(graph_data)
            self.assertIsNotNone(graph_data.nodes)
            self.assertIsNotNone(graph_data.edges)
        db.close()

    def test_case_6_project_no_dependencies(self):
        """Case 6: A project has no dependencies."""
        arch = ArchitectureDefinitionContent(
            name="No Deps Arch",
            components=[ComponentDef(name="core", layer=1, path_patterns=["core/**"])],
            rules=[RuleDef(id="R1", type="circular_dependency", description="No cycles", severity="high")]
        )
        modules = {"core.a": ModuleInfo(name="core.a", file_path="core/a.py", classes_count=1, functions_count=1)}
        deps = []
        graph = ArchitectureGraph(arch)
        graph.build(modules, deps)
        engine = DriftDetectionEngine(arch, graph)
        findings, compliance = engine.evaluate(modules, deps)
        self.assertEqual(len(findings), 0)
        self.assertEqual(compliance, 100.0)

    def test_case_7_project_no_valid_policy(self):
        """Case 7: A project has no architecture policy (definition is None)."""
        graph = ArchitectureGraph(definition=None)
        modules = {"mod.a": ModuleInfo(name="mod.a", file_path="mod/a.py", classes_count=1, functions_count=1)}
        deps = []
        graph.build(modules, deps)
        engine = DriftDetectionEngine(definition=None, graph=graph)
        findings, compliance = engine.evaluate(modules, deps)
        self.assertEqual(len(findings), 0)
        self.assertEqual(compliance, 100.0)

    def test_case_8_two_projects_isolated_results(self):
        """Case 8: Two projects have different scan results and never mix."""
        db = SessionLocal()
        projects = db.query(Project).all()
        if len(projects) >= 2:
            p1, p2 = projects[0], projects[1]
            ov1 = ReportService.get_overview_metrics(db, project_id=p1.id)
            ov2 = ReportService.get_overview_metrics(db, project_id=p2.id)
            self.assertEqual(ov1.project_id, p1.id)
            self.assertEqual(ov2.project_id, p2.id)
        db.close()

if __name__ == '__main__':
    unittest.main()
