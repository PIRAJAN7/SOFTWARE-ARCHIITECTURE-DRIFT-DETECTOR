import uuid
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple, Dict, Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.security import hash_password, verify_password, generate_secure_token, hash_token
from backend.app.models.user import User, EmailVerificationToken, PasswordResetToken, UserSession
from backend.app.schemas.auth import UserRegister, UserLogin
from backend.app.services.email_service import EmailService

logger = logging.getLogger("drift_detector.auth")

class AuthService:
    @staticmethod
    def normalize_email(email: str) -> str:
        return email.strip().lower()

    @classmethod
    def register_user(cls, db: Session, user_in: UserRegister) -> Tuple[User, Dict[str, Any]]:
        normalized_email = cls.normalize_email(user_in.email)
        
        # Check if user already exists
        existing_user = db.query(User).filter(User.email == normalized_email).first()
        if existing_user:
            if existing_user.is_verified:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="An account with this email address is already registered."
                )
            else:
                # User exists but is unverified; update their password and re-issue verification
                existing_user.password_hash = hash_password(user_in.password)
                if user_in.full_name:
                    existing_user.full_name = user_in.full_name
                user = existing_user
        else:
            pwd_hash = hash_password(user_in.password)
            user = User(
                id=str(uuid.uuid4()),
                email=normalized_email,
                password_hash=pwd_hash,
                full_name=user_in.full_name,
                is_verified=False
            )
            db.add(user)
            db.flush()

        # Invalidate previous unused verification tokens for this user
        db.query(EmailVerificationToken).filter(
            EmailVerificationToken.user_id == user.id,
            EmailVerificationToken.used_at.is_(None)
        ).update({"used_at": datetime.now(timezone.utc)})

        # Generate single-use verification token
        raw_token = generate_secure_token()
        token_hash = hash_token(raw_token)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.VERIFICATION_TOKEN_EXPIRE_HOURS)

        db_token = EmailVerificationToken(
            id=str(uuid.uuid4()),
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
            used_at=None
        )
        db.add(db_token)
        db.commit()
        db.refresh(user)

        # Send verification email
        email_result = EmailService.send_verification_email(user.email, raw_token, user.full_name)
        
        return user, email_result

    @classmethod
    def verify_email(cls, db: Session, raw_token: str) -> User:
        token_hash = hash_token(raw_token)
        token_record = db.query(EmailVerificationToken).filter(
            EmailVerificationToken.token_hash == token_hash
        ).first()

        if not token_record:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid verification link. Please request a new verification email."
            )

        if token_record.is_used:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This verification link has already been used. Please log in or request a new link."
            )

        now = datetime.now(timezone.utc)
        expires_at = token_record.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        if now > expires_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This verification link has expired. Please request a new verification email."
            )

        user = db.query(User).filter(User.id == token_record.user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Associated user account not found."
            )

        # Mark single-use token as used
        token_record.is_used = True
        user.is_verified = True
        db.commit()
        db.refresh(user)
        
        logger.info(f"User email verified successfully: {user.email}")
        return user

    @classmethod
    def resend_verification(cls, db: Session, email: str) -> Dict[str, Any]:
        normalized_email = cls.normalize_email(email)
        user = db.query(User).filter(User.email == normalized_email).first()

        # If user does not exist, return generic success to avoid enumeration
        if not user:
            return {
                "message": "If an unverified account exists for this email, a verification link has been sent.",
                "email_sent": True
            }

        if user.is_verified:
            return {
                "message": "This account is already verified. You may sign in directly.",
                "email_sent": False
            }

        # Rate limiting: check recent token creation (60 second cooldown)
        recent_token = db.query(EmailVerificationToken).filter(
            EmailVerificationToken.user_id == user.id,
            EmailVerificationToken.created_at >= datetime.now(timezone.utc) - timedelta(seconds=60)
        ).first()

        if recent_token:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Please wait 60 seconds before requesting another verification email."
            )

        # Invalidate old tokens
        db.query(EmailVerificationToken).filter(
            EmailVerificationToken.user_id == user.id,
            EmailVerificationToken.used_at.is_(None)
        ).update({"used_at": datetime.now(timezone.utc)})

        raw_token = generate_secure_token()
        token_hash = hash_token(raw_token)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.VERIFICATION_TOKEN_EXPIRE_HOURS)

        db_token = EmailVerificationToken(
            id=str(uuid.uuid4()),
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
            used_at=None
        )
        db.add(db_token)
        db.commit()

        email_result = EmailService.send_verification_email(user.email, raw_token, user.full_name)
        return {
            "message": "A fresh verification link has been sent to your email address.",
            "email_sent": email_result.get("delivered", False),
            "detail": email_result.get("message")
        }

    @classmethod
    def authenticate_user(cls, db: Session, credentials: UserLogin) -> User:
        normalized_email = cls.normalize_email(credentials.email)
        user = db.query(User).filter(User.email == normalized_email).first()

        if not user:
            # Generic error message to prevent enumeration
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password."
            )

        if not verify_password(credentials.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password."
            )

        # Crucial Requirement: Do not allow unverified users to log in
        if not user.is_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Email address not verified. Please check your inbox and verify your email before logging in."
            )

        return user

    @classmethod
    def create_session(
        cls,
        db: Session,
        user: User,
        remember_me: bool = False,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> Tuple[str, datetime, int]:
        raw_session_token = generate_secure_token()
        token_hash = hash_token(raw_session_token)

        duration_hours = settings.SESSION_REMEMBER_HOURS if remember_me else settings.SESSION_DURATION_HOURS
        max_age_seconds = duration_hours * 3600
        expires_at = datetime.now(timezone.utc) + timedelta(hours=duration_hours)

        session_record = UserSession(
            id=str(uuid.uuid4()),
            user_id=user.id,
            session_token_hash=token_hash,
            expires_at=expires_at,
            ip_address=ip_address,
            user_agent=user_agent
        )
        db.add(session_record)
        db.commit()

        return raw_session_token, expires_at, max_age_seconds

    @classmethod
    def get_user_from_session(cls, db: Session, raw_session_token: str) -> Optional[User]:
        if not raw_session_token:
            return None

        token_hash = hash_token(raw_session_token)
        session_record = db.query(UserSession).filter(
            UserSession.session_token_hash == token_hash
        ).first()

        if not session_record:
            return None

        now = datetime.now(timezone.utc)
        expires_at = session_record.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        if now > expires_at:
            # Expired session; clean up
            db.delete(session_record)
            db.commit()
            return None

        user = db.query(User).filter(User.id == session_record.user_id).first()
        return user

    @classmethod
    def invalidate_session(cls, db: Session, raw_session_token: str) -> bool:
        if not raw_session_token:
            return False

        token_hash = hash_token(raw_session_token)
        session_record = db.query(UserSession).filter(
            UserSession.session_token_hash == token_hash
        ).first()

        if session_record:
            db.delete(session_record)
            db.commit()
            return True
        return False

    @classmethod
    def request_password_reset(cls, db: Session, email: str) -> Dict[str, Any]:
        normalized_email = cls.normalize_email(email)
        user = db.query(User).filter(User.email == normalized_email).first()

        # Always return generic message to prevent enumeration
        generic_msg = "If your email address is registered, password reset instructions have been sent."

        if not user or not user.is_verified:
            return {"message": generic_msg, "email_sent": True}

        # Invalidate previous unused reset tokens
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None)
        ).update({"used_at": datetime.now(timezone.utc)})

        raw_token = generate_secure_token()
        token_hash = hash_token(raw_token)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.PASSWORD_RESET_TOKEN_EXPIRE_HOURS)

        db_token = PasswordResetToken(
            id=str(uuid.uuid4()),
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
            used_at=None
        )
        db.add(db_token)
        db.commit()

        email_result = EmailService.send_password_reset_email(user.email, raw_token, user.full_name)
        return {
            "message": generic_msg,
            "email_sent": email_result.get("delivered", False),
            "detail": email_result.get("message")
        }

    @classmethod
    def reset_password(cls, db: Session, raw_token: str, new_password: str) -> User:
        token_hash = hash_token(raw_token)
        token_record = db.query(PasswordResetToken).filter(
            PasswordResetToken.token_hash == token_hash
        ).first()

        if not token_record:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid password reset link. Please request a new one."
            )

        if token_record.is_used:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This password reset link has already been used."
            )

        now = datetime.now(timezone.utc)
        expires_at = token_record.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        if now > expires_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This password reset link has expired. Please request a new one."
            )

        user = db.query(User).filter(User.id == token_record.user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User account not found."
            )

        # Update password hash
        user.password_hash = hash_password(new_password)
        token_record.is_used = True

        # Invalidate all active sessions for this user for security
        db.query(UserSession).filter(UserSession.user_id == user.id).delete()

        db.commit()
        db.refresh(user)
        logger.info(f"Password reset successfully for user: {user.email}")
        return user
