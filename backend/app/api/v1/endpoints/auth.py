from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.api.deps import (
    get_current_user,
    get_current_user_optional,
    get_session_token_from_request
)
from backend.app.models.user import User
from backend.app.schemas.auth import (
    UserRegister,
    UserLogin,
    UserResponse,
    EmailVerifyRequest,
    ResendVerificationRequest,
    PasswordResetRequest,
    PasswordResetConfirm,
    AuthStatusResponse,
    MessageResponse
)
from backend.app.services.auth_service import AuthService
from backend.app.services.email_service import EmailService

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(
    data: UserRegister,
    db: Session = Depends(get_db)
):
    """
    Register a new user account with an unverified status.
    A single-use verification email is sent to validate actual email ownership.
    """
    user, email_result = AuthService.register_user(db, data)
    
    dev_action_url = None
    if email_result.get("method") == "development_mailbox":
        dev_action_url = email_result.get("action_url")

    return {
        "message": "Account created. Please check your inbox and verify your email address to complete registration.",
        "user_id": user.id,
        "email": user.email,
        "email_delivery": email_result.get("method"),
        "dev_verification_url": dev_action_url
    }

@router.post("/verify-email", response_model=MessageResponse)
def verify_email_post(
    data: EmailVerifyRequest,
    db: Session = Depends(get_db)
):
    """
    Validate a single-use email verification token.
    Only after successful verification can the user log in.
    """
    user = AuthService.verify_email(db, data.token)
    return MessageResponse(
        message=f"Email address {user.email} verified successfully. You may now log in."
    )

@router.get("/verify-email", response_model=MessageResponse)
def verify_email_get(
    token: str,
    db: Session = Depends(get_db)
):
    """
    GET handler for email verification links clicked directly by users.
    """
    user = AuthService.verify_email(db, token)
    return MessageResponse(
        message=f"Email address {user.email} verified successfully. You may now log in."
    )

@router.post("/resend-verification", response_model=MessageResponse)
def resend_verification(
    data: ResendVerificationRequest,
    db: Session = Depends(get_db)
):
    """
    Re-sends an email verification link with rate limiting.
    """
    res = AuthService.resend_verification(db, data.email)
    return MessageResponse(
        message=res["message"],
        detail=res.get("detail"),
        email_sent=res.get("email_sent")
    )

@router.post("/login")
def login(
    credentials: UserLogin,
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    """
    Authenticate a user. Requires that the email has been verified.
    Establishes a secure HttpOnly session cookie.
    """
    user = AuthService.authenticate_user(db, credentials)

    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    raw_token, expires_at, max_age = AuthService.create_session(
        db=db,
        user=user,
        remember_me=credentials.remember_me,
        ip_address=ip_address,
        user_agent=user_agent
    )

    # Set secure HttpOnly cookie
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=raw_token,
        max_age=max_age,
        expires=expires_at,
        path="/",
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE
    )

    return {
        "message": "Signed in successfully",
        "user": UserResponse.model_validate(user),
        "session_token": raw_token,
        "expires_at": expires_at.isoformat()
    }

@router.post("/logout", response_model=MessageResponse)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    """
    Terminates the session and clears the session cookie.
    """
    token = get_session_token_from_request(request)
    if token:
        AuthService.invalidate_session(db, token)

    response.delete_cookie(
        key=settings.SESSION_COOKIE_NAME,
        path="/"
    )
    return MessageResponse(message="Signed out successfully")

@router.get("/me", response_model=UserResponse)
def get_current_user_profile(
    current_user: User = Depends(get_current_user)
):
    """
    Returns the profile of the currently authenticated user.
    """
    return current_user

@router.get("/status", response_model=AuthStatusResponse)
def get_auth_status(
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Non-blocking endpoint to check whether the current browser session is authenticated.
    """
    if current_user:
        return AuthStatusResponse(
            authenticated=True,
            user=UserResponse.model_validate(current_user)
        )
    return AuthStatusResponse(authenticated=False, user=None)

@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(
    data: PasswordResetRequest,
    db: Session = Depends(get_db)
):
    """
    Initiates password reset flow with generic response to prevent account enumeration.
    """
    res = AuthService.request_password_reset(db, data.email)
    return MessageResponse(
        message=res["message"],
        detail=res.get("detail"),
        email_sent=res.get("email_sent")
    )

@router.post("/reset-password", response_model=MessageResponse)
def reset_password(
    data: PasswordResetConfirm,
    db: Session = Depends(get_db)
):
    """
    Consumes single-use password reset token and sets new password.
    """
    user = AuthService.reset_password(db, data.token, data.new_password)
    return MessageResponse(
        message="Password reset successfully. You may now sign in with your new password."
    )

@router.get("/dev/mailbox/latest")
def get_latest_dev_email():
    """
    Development-only helper to inspect the latest captured verification or reset email.
    """
    if not settings.EMAIL_TEST_MODE:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Development mailbox is disabled in production mode."
        )

    email_data = EmailService.get_latest_dev_email()
    if not email_data:
        raise HTTPException(status_code=404, detail="No emails found in mailbox.")
    return email_data
