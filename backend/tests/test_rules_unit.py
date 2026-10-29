import pytest
from backend.app.schemas.architecture import ArchitectureDefinitionContent, ComponentDef, RuleDef
from backend.app.analyzers.python_ast import ModuleInfo, RawImport
from backend.app.analyzers.graph_builder import ArchitectureGraph
from backend.app.rules.engine import DriftDetectionEngine

def test_layer_violation_and_forbidden_dependency():
    arch = ArchitectureDefinitionContent(
        name="Layered Test",
        components=[
            ComponentDef(name="presentation", layer=1, path_patterns=["presentation/**"]),
            ComponentDef(name="application", layer=2, path_patterns=["application/**"]),
            ComponentDef(name="domain", layer=3, path_patterns=["domain/**"]),
            ComponentDef(name="infrastructure", layer=4, path_patterns=["infrastructure/**"])
        ],
        rules=[
            RuleDef(
                id="RULE-LAYER-DOWN",
                type="layer_direction",
                description="Layers must flow downward.",
                severity="high",
                layer_direction="downward_only"
            ),
            RuleDef(
                id="RULE-FORBIDDEN-D2P",
                type="forbidden_dependency",
                description="Domain must never depend on presentation.",
                severity="critical",
                from_component="domain",
                to_component="presentation"
            )
        ]
    )

    modules = {
        "app.presentation.views": ModuleInfo(
            name="app.presentation.views",
            file_path="app/presentation/views.py",
            classes_count=1,
            functions_count=2
        ),
        "app.application.services": ModuleInfo(
            name="app.application.services",
            file_path="app/application/services.py",
            classes_count=1,
            functions_count=1
        ),
        "app.domain.entities": ModuleInfo(
            name="app.domain.entities",
            file_path="app/domain/entities.py",
            classes_count=2,
            functions_count=0
        )
    }

    # Violation: domain (L3) imports presentation (L1)
    deps = [
        RawImport(
            source_module="app.presentation.views",
            target_module="app.application.services",
            line_number=5,
            statement="from app.application.services import OrderService"
        ),
        RawImport(
            source_module="app.domain.entities",
            target_module="app.presentation.views",
            line_number=12,
            statement="from app.presentation.views import format_currency"
        )
    ]

    graph = ArchitectureGraph(definition=arch)
    graph.build(modules, deps)

    engine = DriftDetectionEngine(definition=arch, graph=graph)
    findings, compliance = engine.evaluate(modules, deps)

    # Both forbidden dependency and layer violation should be detected
    rule_types = {f.rule_type for f in findings}
    assert "forbidden_dependency" in rule_types
    assert "layer_violation" in rule_types
    assert compliance < 100.0

def test_circular_dependency_detection():
    arch = ArchitectureDefinitionContent(
        name="Cycle Test",
        components=[
            ComponentDef(name="comp_a", layer=1, path_patterns=["comp_a/**"]),
            ComponentDef(name="comp_b", layer=2, path_patterns=["comp_b/**"]),
            ComponentDef(name="comp_c", layer=3, path_patterns=["comp_c/**"])
        ],
        rules=[
            RuleDef(
                id="NO-CYCLES",
                type="circular_dependency",
                description="No cyclic coupling permitted.",
                severity="critical"
            )
        ]
    )

    modules = {
        "app.comp_a.mod": ModuleInfo(name="app.comp_a.mod", file_path="comp_a/mod.py", classes_count=0, functions_count=1),
        "app.comp_b.mod": ModuleInfo(name="app.comp_b.mod", file_path="comp_b/mod.py", classes_count=0, functions_count=1),
        "app.comp_c.mod": ModuleInfo(name="app.comp_c.mod", file_path="comp_c/mod.py", classes_count=0, functions_count=1),
    }

    # A -> B -> C -> A (Component cycle)
    deps = [
        RawImport(source_module="app.comp_a.mod", target_module="app.comp_b.mod", line_number=2, statement="import b"),
        RawImport(source_module="app.comp_b.mod", target_module="app.comp_c.mod", line_number=4, statement="import c"),
        RawImport(source_module="app.comp_c.mod", target_module="app.comp_a.mod", line_number=6, statement="import a"),
    ]

    graph = ArchitectureGraph(definition=arch)
    graph.build(modules, deps)

    engine = DriftDetectionEngine(definition=arch, graph=graph)
    findings, compliance = engine.evaluate(modules, deps)

    cycle_findings = [f for f in findings if f.rule_type == "circular_dependency"]
    assert len(cycle_findings) > 0
    assert "comp_a" in cycle_findings[0].title
    assert "comp_b" in cycle_findings[0].title
    assert "comp_c" in cycle_findings[0].title

def test_unmapped_module_detection():
    arch = ArchitectureDefinitionContent(
        name="Unmapped Test",
        components=[
            ComponentDef(name="core", layer=1, path_patterns=["core/**"])
        ],
        rules=[
            RuleDef(
                id="NO-UNMAPPED",
                type="unmapped_module",
                description="All modules must belong to approved components.",
                severity="medium"
            )
        ]
    )

    modules = {
        "app.core.main": ModuleInfo(name="app.core.main", file_path="core/main.py", classes_count=1, functions_count=1),
        "app.rogue.script": ModuleInfo(name="app.rogue.script", file_path="rogue/script.py", classes_count=0, functions_count=1)
    }

    graph = ArchitectureGraph(definition=arch)
    graph.build(modules, [])

    engine = DriftDetectionEngine(definition=arch, graph=graph)
    findings, compliance = engine.evaluate(modules, [])

    unmapped = [f for f in findings if f.rule_type == "unmapped_module"]
    assert len(unmapped) == 1
    assert unmapped[0].source_module == "app.rogue.script"

def test_unexpected_whitelist_dependency():
    arch = ArchitectureDefinitionContent(
        name="Whitelist Test",
        components=[
            ComponentDef(name="frontend", layer=1, path_patterns=["frontend/**"], allowed_dependencies=["backend_api"]),
            ComponentDef(name="backend_api", layer=2, path_patterns=["api/**"], allowed_dependencies=["database"]),
            ComponentDef(name="database", layer=3, path_patterns=["db/**"], allowed_dependencies=[])
        ],
        rules=[]
    )

    modules = {
        "app.frontend.page": ModuleInfo(name="app.frontend.page", file_path="frontend/page.py", classes_count=1, functions_count=1),
        "app.api.routes": ModuleInfo(name="app.api.routes", file_path="api/routes.py", classes_count=1, functions_count=1),
        "app.db.models": ModuleInfo(name="app.db.models", file_path="db/models.py", classes_count=2, functions_count=0),
    }

    # Frontend directly bypasses backend_api and imports database!
    deps = [
        RawImport(
            source_module="app.frontend.page",
            target_module="app.db.models",
            line_number=3,
            statement="from app.db.models import User"
        )
    ]

    graph = ArchitectureGraph(definition=arch)
    graph.build(modules, deps)

    engine = DriftDetectionEngine(definition=arch, graph=graph)
    findings, compliance = engine.evaluate(modules, deps)

    unexpected = [f for f in findings if f.rule_type == "unexpected_dependency"]
    assert len(unexpected) == 1
    assert unexpected[0].source_component == "frontend"
    assert unexpected[0].target_component == "database"
