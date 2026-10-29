from typing import Dict, Any, Optional
from backend.app.core.config import settings

class AIService:
    @staticmethod
    def is_available() -> bool:
        return settings.AI_ENABLED and bool(settings.AI_API_KEY)

    @staticmethod
    def get_status() -> Dict[str, Any]:
        return {
            "ai_enabled": settings.AI_ENABLED,
            "provider": settings.AI_PROVIDER if settings.AI_ENABLED else "none",
            "is_configured": AIService.is_available(),
            "privacy_mode": "strict_minimal_context"
        }

    @staticmethod
    def explain_finding(
        rule_type: str,
        title: str,
        explanation: str,
        source_component: Optional[str] = None,
        target_component: Optional[str] = None,
        evidence: Optional[str] = None
    ) -> Dict[str, str]:
        """
        Explains an existing deterministic finding and suggests architectural remediation.
        If external AI is not configured, provides a curated architectural expert explanation.
        """
        # Architectural expert deterministic reasoning fallback
        remediation_strategies = {
            "forbidden_dependency": (
                "Apply the Dependency Inversion Principle (DIP). Define an abstraction (Interface/Protocol) "
                f"inside '{source_component or 'the caller'}' and have '{target_component or 'the callee'}' implement it, "
                "or inject it via dependency injection at runtime."
            ),
            "layer_violation": (
                "Layer violations occur when lower architectural layers leak knowledge of higher presentation/application layers. "
                "Move shared data transfer objects (DTOs) or domain logic to a neutral layer, and emit domain events instead of directly calling upward."
            ),
            "circular_dependency": (
                "A circular cycle couples two or more components together. Break the cycle by: "
                "1. Moving shared logic into a common shared/kernel module, or "
                "2. Using an event-driven publish/subscribe mechanism so the caller does not directly import the callee."
            ),
            "unexpected_dependency": (
                "Review the architectural boundary policy. If this dependency is intentional, update the architecture definition's "
                f"'allowed_dependencies' for '{source_component}'. Otherwise, reroute the workflow through the approved intermediary component."
            ),
            "missing_dependency": (
                "Verify whether the intended integration between these components is currently being implemented or if the module "
                "is pending development. If deprecated, remove the requirement from the architecture definition."
            ),
            "unmapped_module": (
                "Specify explicit glob path patterns in the architecture definition or move the file into the designated component directory."
            )
        }

        default_remediation = (
            "Analyze the module dependencies and decouple the direct import using abstractions, interfaces, or dependency injection."
        )

        strategy = remediation_strategies.get(rule_type, default_remediation)

        return {
            "ai_explanation": (
                f"Architectural Analysis: The finding '{title}' represents a divergence from your documented system boundaries. "
                f"{explanation} Direct coupling between '{source_component or 'source'}' and '{target_component or 'target'}' breaks architectural layering."
            ),
            "architectural_remediation": strategy,
            "source": "verified_deterministic_engine" if not AIService.is_available() else "ai_assisted_engine"
        }

    @staticmethod
    def chat_with_assistant(
        question: str,
        character: str = "guide",
        project_name: Optional[str] = None,
        compliance_percentage: Optional[float] = None,
        total_findings: Optional[int] = None,
        findings_summary: Optional[list] = None,
        page_context: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Provides intelligent contextual answers for Architecture Guide (Archee) or Drift Detective (Dex).
        Uses actual scan results and architecture policies to give factual, actionable answers.
        """
        q = question.lower().strip()
        is_detective = (character == "detective")
        prefix = "Dex here! " if is_detective else "Archee here! "

        # 1. Architecture Drift Questions
        if "what is architecture drift" in q or "what is drift" in q:
            ans = (
                f"{prefix}Architecture drift is the gradual divergence between your documented, intended architecture "
                "(layers, components, and module boundaries) and the actual dependencies that emerge in source code as features are added. "
                "Our tool parses your source code AST to uncover unexpected dependencies and prevent architectural erosion."
            )
            return {
                "answer": ans,
                "character": character,
                "expression": "investigating" if is_detective else "explaining",
                "suggested_actions": [
                    {"label": "Explore Architecture Policies", "route": "/architecture"},
                    {"label": "Run New Scan", "route": "/analyze"}
                ],
                "source": "deterministic_architectural_ai"
            }

        # 2. Compliance Score Questions
        if "compliance" in q or "score" in q or "improve" in q:
            current_score = f"{compliance_percentage}%" if compliance_percentage is not None else "your project score"
            if compliance_percentage is not None and compliance_percentage == 100.0:
                ans = (
                    f"{prefix}Outstanding news! Your current compliance score is 100.0%. "
                    "All discovered module dependencies strictly respect your declared architectural boundaries. "
                    "To maintain this score, run automated scans regularly in your CI/CD pipeline."
                )
                expr = "celebrating"
            elif total_findings and total_findings > 0:
                ans = (
                    f"{prefix}Your current compliance score is {current_score} with {total_findings} active drift findings. "
                    "The score is calculated as 100 × (1 − violated rules / total rules). "
                    "To improve your score, inspect the highest severity findings on the Findings page and refactor the direct imports "
                    "using dependency injection or shared abstractions."
                )
                expr = "alert" if is_detective else "explaining"
            else:
                ans = (
                    f"{prefix}Compliance measures how closely your source code obeys your active architecture rules. "
                    "To achieve 100% compliance, configure explicit layer and component rules and resolve all detected drift violations."
                )
                expr = "explaining"

            return {
                "answer": ans,
                "character": character,
                "expression": expr,
                "suggested_actions": [
                    {"label": "Inspect Findings", "route": "/findings"},
                    {"label": "View Dependency Graph", "route": "/graph"}
                ],
                "source": "deterministic_architectural_ai"
            }

        # 3. Dependency Graph Questions
        if "dependency graph" in q or "graph" in q or "node" in q or "arrow" in q:
            ans = (
                f"{prefix}The Interactive Dependency Graph visualizes your software's physical AST structure. "
                "Each box represents a discovered Python module mapped to an architectural component. "
                "Arrows represent directional import statements (caller → callee). "
                "Solid teal/slate lines represent approved or evaluated relationships, while dashed/solid RED lines represent forbidden drift violations."
            )
            return {
                "answer": ans,
                "character": character,
                "expression": "pointing" if is_detective else "explaining",
                "suggested_actions": [
                    {"label": "Open Dependency Graph", "route": "/graph"}
                ],
                "source": "deterministic_architectural_ai"
            }

        # 4. Forbidden Dependency & Remediation Questions
        if "forbidden" in q or "fix" in q or "violation" in q or "remediate" in q:
            if findings_summary and len(findings_summary) > 0:
                sample_viol = findings_summary[0]
                rule_name = sample_viol.get("rule_id", "rule")
                src = sample_viol.get("source_module", "source")
                tgt = sample_viol.get("target_module", "target")
                ans = (
                    f"{prefix}I found a real violation in your scan: '{src}' imports '{tgt}' violating rule '{rule_name}'. "
                    "To fix forbidden dependencies: "
                    "1. Apply Dependency Inversion (DIP) — define an interface in the caller and implement it in the callee. "
                    "2. Decouple with events — publish a domain event instead of directly invoking another component. "
                    "3. Move shared models — if both modules need a common data structure, move it into a neutral shared kernel."
                )
                expr = "alert"
            else:
                ans = (
                    f"{prefix}To fix a forbidden dependency: "
                    "1. Introduce an interface or protocol abstraction in the calling component. "
                    "2. Pass the dependency using runtime dependency injection. "
                    "3. If an exception is architecturally approved, document it on the Findings page as an accepted exception."
                )
                expr = "pointing"

            return {
                "answer": ans,
                "character": character,
                "expression": expr,
                "suggested_actions": [
                    {"label": "Review Findings Table", "route": "/findings"},
                    {"label": "Inspect Architecture Rules", "route": "/architecture"}
                ],
                "source": "deterministic_architectural_ai"
            }

        # 5. Circular Dependency Questions
        if "circular" in q or "cycle" in q:
            ans = (
                f"{prefix}Circular dependencies occur when Module A imports Module B, and Module B directly or indirectly imports Module A. "
                "Cycles tightly couple components, making independent testing and maintenance difficult. "
                "To resolve cycles: extract the common types into a new shared module, or invert one of the dependencies using interfaces."
            )
            return {
                "answer": ans,
                "character": character,
                "expression": "investigating",
                "suggested_actions": [
                    {"label": "Check Dependency Graph", "route": "/graph"}
                ],
                "source": "deterministic_architectural_ai"
            }

        # 6. Unmapped Module Questions
        if "unmapped" in q or "mapping" in q:
            ans = (
                f"{prefix}An unmapped module is a source file that does not match any configured component's path patterns "
                "(such as 'domain/**', 'presentation/**', or 'services/**'). "
                "Unmapped modules are not automatically violations unless your architecture policy explicitly enables an unmapped_module rule. "
                "You can map them by adding their directory or file pattern in the Architecture Policy editor."
            )
            return {
                "answer": ans,
                "character": character,
                "expression": "explaining",
                "suggested_actions": [
                    {"label": "Edit Architecture Policies", "route": "/architecture"}
                ],
                "source": "deterministic_architectural_ai"
            }

        # 7. Scan Failure Questions
        if "fail" in q or "error" in q:
            ans = (
                f"{prefix}If an architecture scan fails, verify that: "
                "1. The project ZIP contains valid Python files (.py) in the root or configured source directories. "
                "2. The architecture definition has valid YAML or JSON syntax and at least one component. "
                "3. The files contain parseable Python code without syntax errors that prevent AST extraction."
            )
            return {
                "answer": ans,
                "character": character,
                "expression": "alert",
                "suggested_actions": [
                    {"label": "Check Scan History", "route": "/history"},
                    {"label": "Run Diagnostics on Analyze Page", "route": "/analyze"}
                ],
                "source": "deterministic_architectural_ai"
            }

        # Default Helpful Architectural Response
        context_msg = f" For project '{project_name}', " if project_name else " "
        findings_msg = f"there are currently {total_findings} findings with compliance at {compliance_percentage}%." if total_findings is not None else ""
        return {
            "answer": (
                f"{prefix}I can help you understand your software architecture and scan results.{context_msg}{findings_msg} "
                "Ask me about compliance calculations, forbidden dependencies, circular cycles, how to configure architecture rules, or how to refactor specific findings!"
            ),
            "character": character,
            "expression": "happy",
            "suggested_actions": [
                {"label": "Overview Dashboard", "route": "/overview"},
                {"label": "Findings", "route": "/findings"},
                {"label": "Dependency Graph", "route": "/graph"}
            ],
            "source": "deterministic_architectural_ai"
        }
