from typing import Dict, Any, Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.api.deps import get_current_user
from backend.app.models.user import User
from backend.app.models.project import Project
from backend.app.models.scan import ScanRun
from backend.app.models.finding import Finding
from backend.app.services.ai_service import AIService

router = APIRouter(prefix="/ai", tags=["AI Explanations"])

class FindingExplanationRequest(BaseModel):
    rule_type: str
    title: str
    explanation: str
    source_component: Optional[str] = None
    target_component: Optional[str] = None
    evidence: Optional[str] = None

class AssistantChatRequest(BaseModel):
    question: str
    character: str = "guide"
    project_id: Optional[str] = None
    scan_id: Optional[str] = None
    page_context: Optional[str] = None

@router.get("/status")
def get_ai_status(current_user: User = Depends(get_current_user)):
    """Returns whether AI provider integration is enabled and configured."""
    return AIService.get_status()

@router.post("/explain-finding")
def explain_finding(
    payload: FindingExplanationRequest,
    current_user: User = Depends(get_current_user)
):
    """Provides plain-language architectural explanation and remediation suggestions."""
    return AIService.explain_finding(
        rule_type=payload.rule_type,
        title=payload.title,
        explanation=payload.explanation,
        source_component=payload.source_component,
        target_component=payload.target_component,
        evidence=payload.evidence
    )

@router.post("/assistant-chat")
def assistant_chat(
    payload: AssistantChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Interactive architecture assistant endpoint for Archee (Guide) and Dex (Detective)."""
    project_name = None
    compliance = None
    total_findings = None
    findings_summary = []

    if payload.project_id:
        project = db.query(Project).filter(Project.id == payload.project_id).first()
        if project:
            # Check user access
            if project.user_id is not None and project.user_id != current_user.id:
                raise HTTPException(status_code=404, detail="Project not found")
            project_name = project.name

            # Look up scan
            scan = None
            if payload.scan_id:
                scan = db.query(ScanRun).filter(ScanRun.id == payload.scan_id).first()
            if not scan:
                scan = (
                    db.query(ScanRun)
                    .filter(ScanRun.project_id == project.id, ScanRun.status == "completed")
                    .order_by(ScanRun.created_at.desc())
                    .first()
                )

            if scan:
                compliance = scan.compliance_percentage
                total_findings = scan.total_findings
                findings_db = (
                    db.query(Finding)
                    .filter(Finding.scan_id == scan.id)
                    .limit(5)
                    .all()
                )
                findings_summary = [
                    {
                        "rule_id": f.rule_id,
                        "source_module": f.source_module,
                        "target_module": f.target_module,
                        "severity": f.severity,
                        "title": f.title
                    }
                    for f in findings_db
                ]

    return AIService.chat_with_assistant(
        question=payload.question,
        character=payload.character,
        project_name=project_name,
        compliance_percentage=compliance,
        total_findings=total_findings,
        findings_summary=findings_summary,
        page_context=payload.page_context
    )
