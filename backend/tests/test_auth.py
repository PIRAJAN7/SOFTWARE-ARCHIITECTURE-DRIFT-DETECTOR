import pytest
from datetime import datetime, timedelta, timezone
from backend.app.core.config import settings
from backend.app.core.security import verify_password, hash_token, generate_secure_token
from backend.app.models.user import User, EmailVerificationToken, PasswordResetToken, UserSession
from backend.app.services.email_service import EmailService

def test_registration_valid_input(client, db_session):
    payload = {
        "email": "architect.lead@enterprise.com",
        "password": "SecurePassword123!",
        "full_name": "Lead Enterprise Architect"
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert "email" in data
    assert data["email"] == "architect.lead@enterprise.com"

    # User in DB should be unverified
    user = db_session.query(User).filter(User.email == "architect.lead@enterprise.com").first()
    assert user is not None
    assert user.is_verified is False
    assert user.password_hash != "SecurePassword123!"

    # Verification token should exist in DB
    token_rec = db_session.query(EmailVerificationToken).filter(EmailVerificationToken.user_id == user.id).first()
    assert token_rec is not None
    assert token_rec.is_used is False

def test_registration_invalid_email(client):
    payload = {
        "email": "not-an-email",
        "password": "SecurePassword123!"
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422

def test_password_hashing_argon2id(client, db_session):
    payload = {
        "email": "hash.test@enterprise.com",
        "password": "SuperSecretPassword2026!"
    }
    client.post("/api/v1/auth/register", json=payload)
    user = db_session.query(User).filter(User.email == "hash.test@enterprise.com").first()
    assert user is not None
    assert user.password_hash.startswith("$argon2id$")
    assert verify_password("SuperSecretPassword2026!", user.password_hash) is True
    assert verify_password("WrongPassword!", user.password_hash) is False

def test_login_before_verification_rejected(client, db_session):
    email = "unverified.user@enterprise.com"
    client.post("/api/v1/auth/register", json={"email": email, "password": "Password123!"})

    login_resp = client.post("/api/v1/auth/login", json={"email": email, "password": "Password123!"})
    assert login_resp.status_code == 403
    assert "not verified" in login_resp.json()["detail"].lower()

def test_email_verification_flow(client, db_session):
    email = "verify.me@enterprise.com"
    reg_resp = client.post("/api/v1/auth/register", json={"email": email, "password": "Password123!"})
    assert reg_resp.status_code == 201

    # Retrieve dev email token
    email_data = EmailService.get_latest_dev_email(email=email)
    assert email_data is not None
    token = email_data["token"]

    # Verify email via POST
    verify_resp = client.post("/api/v1/auth/verify-email", json={"token": token})
    assert verify_resp.status_code == 200
    assert "verified successfully" in verify_resp.json()["message"]

    # User in DB is now verified
    user = db_session.query(User).filter(User.email == email).first()
    assert user.is_verified is True

    # Reused token is rejected
    reused_resp = client.post("/api/v1/auth/verify-email", json={"token": token})
    assert reused_resp.status_code == 400
    assert "already been used" in reused_resp.json()["detail"].lower()

def test_expired_verification_token(client, db_session):
    email = "expired.token@enterprise.com"
    client.post("/api/v1/auth/register", json={"email": email, "password": "Password123!"})
    user = db_session.query(User).filter(User.email == email).first()

    # Manually expire the token
    token_rec = db_session.query(EmailVerificationToken).filter(EmailVerificationToken.user_id == user.id).first()
    token_rec.expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
    db_session.commit()

    email_data = EmailService.get_latest_dev_email(email=email)
    raw_token = email_data["token"]

    verify_resp = client.post("/api/v1/auth/verify-email", json={"token": raw_token})
    assert verify_resp.status_code == 400
    assert "expired" in verify_resp.json()["detail"].lower()

def test_duplicate_email_registration(client, db_session):
    email = "duplicate@enterprise.com"
    # Register and verify
    client.post("/api/v1/auth/register", json={"email": email, "password": "Password123!"})
    email_data = EmailService.get_latest_dev_email(email=email)
    client.post("/api/v1/auth/verify-email", json={"token": email_data["token"]})

    # Try to register again with same verified email
    dup_resp = client.post("/api/v1/auth/register", json={"email": email, "password": "AnotherPassword123!"})
    assert dup_resp.status_code == 400
    assert "already registered" in dup_resp.json()["detail"].lower()

def test_login_success_and_cookie_settings(client, db_session):
    email = "session.user@enterprise.com"
    pwd = "ValidSessionPassword123!"
    client.post("/api/v1/auth/register", json={"email": email, "password": pwd})
    email_data = EmailService.get_latest_dev_email(email=email)
    client.post("/api/v1/auth/verify-email", json={"token": email_data["token"]})

    login_resp = client.post("/api/v1/auth/login", json={"email": email, "password": pwd, "remember_me": True})
    assert login_resp.status_code == 200
    data = login_resp.json()
    assert "session_token" in data
    assert data["user"]["email"] == email

    # Check HttpOnly cookie in response headers
    cookies = login_resp.headers.get("set-cookie", "")
    assert settings.SESSION_COOKIE_NAME in cookies
    assert "HttpOnly" in cookies

    # Verify session recorded in DB
    token_hash = hash_token(data["session_token"])
    session_rec = db_session.query(UserSession).filter(UserSession.session_token_hash == token_hash).first()
    assert session_rec is not None

def test_login_invalid_credentials(client, db_session):
    email = "wrong.cred@enterprise.com"
    client.post("/api/v1/auth/register", json={"email": email, "password": "CorrectPassword123!"})
    email_data = EmailService.get_latest_dev_email(email=email)
    client.post("/api/v1/auth/verify-email", json={"token": email_data["token"]})

    bad_resp = client.post("/api/v1/auth/login", json={"email": email, "password": "IncorrectPassword123!"})
    assert bad_resp.status_code == 401
    assert "invalid email or password" in bad_resp.json()["detail"].lower()

def test_logout_and_session_invalidation(client, db_session):
    email = "logout.test@enterprise.com"
    pwd = "LogoutPassword123!"
    client.post("/api/v1/auth/register", json={"email": email, "password": pwd})
    email_data = EmailService.get_latest_dev_email(email=email)
    client.post("/api/v1/auth/verify-email", json={"token": email_data["token"]})

    login_resp = client.post("/api/v1/auth/login", json={"email": email, "password": pwd})
    session_token = login_resp.json()["session_token"]

    # Verify access to /me with session cookie
    client.cookies.set(settings.SESSION_COOKIE_NAME, session_token)
    me_resp = client.get("/api/v1/auth/me")
    assert me_resp.status_code == 200

    # Logout
    logout_resp = client.post("/api/v1/auth/logout")
    assert logout_resp.status_code == 200

    # Attempt access with invalidated session token
    revoked_resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {session_token}"})
    assert revoked_resp.status_code == 401

def test_protected_endpoints_require_authentication(client):
    # Unauthenticated requests to protected endpoints must return 401
    assert client.get("/api/v1/projects").status_code == 401
    assert client.get("/api/v1/overview").status_code == 401
    assert client.post("/api/v1/projects", json={"name": "Unauthorized Project"}).status_code == 401

def test_cross_user_isolation(client, db_session):
    # User 1 registers and verifies
    email1 = "user1@enterprise.com"
    client.post("/api/v1/auth/register", json={"email": email1, "password": "Password123!"})
    token1 = EmailService.get_latest_dev_email(email=email1)["token"]
    client.post("/api/v1/auth/verify-email", json={"token": token1})
    login1 = client.post("/api/v1/auth/login", json={"email": email1, "password": "Password123!"})
    session1 = login1.json()["session_token"]

    # User 1 creates a project
    client.cookies.set(settings.SESSION_COOKIE_NAME, session1)
    proj_resp = client.post("/api/v1/projects", json={"name": "User 1 Secret Project"})
    assert proj_resp.status_code == 201
    proj_id = proj_resp.json()["id"]

    # User 2 registers and verifies
    email2 = "user2@enterprise.com"
    client.post("/api/v1/auth/register", json={"email": email2, "password": "Password123!"})
    token2 = EmailService.get_latest_dev_email(email=email2)["token"]
    client.post("/api/v1/auth/verify-email", json={"token": token2})
    login2 = client.post("/api/v1/auth/login", json={"email": email2, "password": "Password123!"})
    session2 = login2.json()["session_token"]

    # User 2 switches session
    client.cookies.set(settings.SESSION_COOKIE_NAME, session2)

    # User 2 cannot see User 1's project in their project list
    list_resp = client.get("/api/v1/projects")
    assert list_resp.status_code == 200
    user2_projects = [p["id"] for p in list_resp.json()]
    assert proj_id not in user2_projects

    # User 2 directly accessing User 1's project gets 404
    direct_resp = client.get(f"/api/v1/projects/{proj_id}")
    assert direct_resp.status_code == 404

def test_password_reset_flow(client, db_session):
    email = "reset.flow@enterprise.com"
    old_pwd = "OldPassword123!"
    new_pwd = "NewPassword456!"

    client.post("/api/v1/auth/register", json={"email": email, "password": old_pwd})
    token = EmailService.get_latest_dev_email(email=email)["token"]
    client.post("/api/v1/auth/verify-email", json={"token": token})

    # Request password reset
    forgot_resp = client.post("/api/v1/auth/forgot-password", json={"email": email})
    assert forgot_resp.status_code == 200

    # Retrieve reset token
    email_data = EmailService.get_latest_dev_email(email=email, email_type="password_reset")
    assert email_data is not None
    reset_token = email_data["token"]

    # Reset password
    reset_resp = client.post("/api/v1/auth/reset-password", json={
        "token": reset_token,
        "new_password": new_pwd
    })
    assert reset_resp.status_code == 200

    # Login with old password must fail
    old_login = client.post("/api/v1/auth/login", json={"email": email, "password": old_pwd})
    assert old_login.status_code == 401

    # Login with new password must succeed
    new_login = client.post("/api/v1/auth/login", json={"email": email, "password": new_pwd})
    assert new_login.status_code == 200
