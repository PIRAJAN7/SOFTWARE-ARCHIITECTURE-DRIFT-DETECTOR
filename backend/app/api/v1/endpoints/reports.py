from typing import Optional
from fastapi import APIRouter, Depends, Query, Response, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.api.deps import get_current_user
from backend.app.models.user import User
from backend.app.models.scan import ScanRun
from backend.app.models.project import Project
from backend.app.schemas.report import ProjectOverviewMetrics
from backend.app.services.report_service import ReportService

router = APIRouter(tags=["Reports & Overview"])

import json
from datetime import datetime, timezone

def verify_user_scan(db: Session, scan_id: str, user_id: str) -> ScanRun:
    scan = db.query(ScanRun).filter(ScanRun.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    project = db.query(Project).filter(Project.id == scan.project_id).first()
    if not project or (project.user_id is not None and project.user_id != user_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return scan

def verify_user_project(db: Session, project_id: str, user_id: str) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or (project.user_id is not None and project.user_id != user_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.get("/overview", response_model=ProjectOverviewMetrics)
def get_overview_dashboard(
    project_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Provides aggregated metrics, trends, compliance %, and rule violations for dashboard."""
    return ReportService.get_overview_metrics(db, project_id=project_id, user_id=current_user.id)

@router.get("/scans/{scan_id}/report/json")
def get_json_report(
    scan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Exports full structured analysis report as formatted JSON."""
    verify_user_scan(db, scan_id, current_user.id)
    report_dict = ReportService.generate_json_report(db, scan_id)
    json_bytes = json.dumps(report_dict, indent=2, ensure_ascii=False).encode("utf-8")
    filename = f"architecture_scan_report_{scan_id[:8]}.json"
    return Response(
        content=json_bytes,
        media_type="application/json; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": str(len(json_bytes)),
        }
    )

@router.get("/scans/{scan_id}/report/csv")
def get_csv_report(
    scan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Exports findings as CSV with spreadsheet formula injection protection and UTF-8 BOM encoding."""
    verify_user_scan(db, scan_id, current_user.id)
    csv_stream = ReportService.generate_csv_stream(db, scan_id)
    csv_text = csv_stream.getvalue()
    csv_bytes = csv_text.encode("utf-8-sig")
    filename = f"architecture_findings_{scan_id[:8]}.csv"
    return Response(
        content=csv_bytes,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Length": str(len(csv_bytes)),
        }
    )

@router.get("/projects/{project_id}/report/csv")
def get_project_history_csv(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Exports project scan history as CSV."""
    verify_user_project(db, project_id, current_user.id)
    csv_stream = ReportService.generate_project_history_csv(db, project_id)
    csv_text = csv_stream.getvalue()
    csv_bytes = csv_text.encode("utf-8-sig")
    filename = f"project_history_{project_id[:8]}.csv"
    return Response(
        content=csv_bytes,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Length": str(len(csv_bytes)),
        }
    )

@router.get("/projects/{project_id}/report/json")
def get_project_history_json(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Exports project metadata and scan history as JSON."""
    verify_user_project(db, project_id, current_user.id)
    history_dict = ReportService.generate_project_history_json(db, project_id)
    json_bytes = json.dumps(history_dict, indent=2, ensure_ascii=False).encode("utf-8")
    filename = f"project_history_{project_id[:8]}.json"
    return Response(
        content=json_bytes,
        media_type="application/json; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": str(len(json_bytes)),
        }
    )

