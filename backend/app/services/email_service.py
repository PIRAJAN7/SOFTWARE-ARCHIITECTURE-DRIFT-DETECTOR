import os
import json
import logging
import smtplib
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Dict, Any, Optional

from backend.app.core.config import settings

logger = logging.getLogger("drift_detector.email")

class EmailService:
    @staticmethod
    def is_smtp_configured() -> bool:
        return bool(settings.SMTP_HOST and settings.SMTP_HOST.strip())

    @classmethod
    def send_verification_email(cls, email: str, token: str, full_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Sends an email address verification message.
        Contains a secure link to verify ownership.
        """
        verify_url = f"{settings.FRONTEND_URL.rstrip('/')}/verify-email?token={token}"
        recipient_name = full_name or email.split('@')[0]
        
        subject = "Verify your email - Software Architecture Drift Detector"
        
        text_content = f"""Hello {recipient_name},

Thank you for registering with the Software Architecture Drift Detector.

Please verify your email address by clicking the link below or copying it into your browser:
{verify_url}

This link is valid for {settings.VERIFICATION_TOKEN_EXPIRE_HOURS} hours and can only be used once.

If you did not create an account, you can safely ignore this email.

Best regards,
The Software Architecture Drift Detector Team
"""

        html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      margin: 0;
      padding: 40px 20px;
      color: #1e293b;
    }}
    .container {{
      max-width: 560px;
      margin: 0 auto;
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 36px 32px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }}
    .header {{
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }}
    .logo-title {{
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.02em;
    }}
    .badge {{
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      color: #0369a1;
      background-color: #e0f2fe;
      padding: 2px 8px;
      border-radius: 4px;
      margin-top: 4px;
    }}
    h1 {{
      font-size: 20px;
      font-weight: 600;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 16px;
    }}
    p {{
      font-size: 15px;
      line-height: 1.6;
      color: #334155;
      margin-bottom: 20px;
    }}
    .button-container {{
      margin: 28px 0;
    }}
    .btn {{
      display: inline-block;
      background-color: #1e3a8a;
      color: #ffffff !important;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      padding: 12px 28px;
      border-radius: 6px;
    }}
    .direct-link {{
      font-size: 12px;
      color: #64748b;
      word-break: break-all;
      background-color: #f8fafc;
      padding: 12px;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }}
    .footer {{
      margin-top: 32px;
      padding-top: 20px;
      border-top: 1px solid #f1f5f9;
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.5;
    }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo-title">Software Architecture Drift Detector</div>
      <div class="badge">Enterprise Verification</div>
    </div>
    <h1>Verify your email address</h1>
    <p>Hello {recipient_name},</p>
    <p>Thank you for registering. To access the Software Architecture Drift Detector, please confirm that this is your email address.</p>
    <div class="button-container">
      <a href="{verify_url}" class="btn" target="_blank">Verify Email Address</a>
    </div>
    <p style="font-size: 13px; color: #64748b;">Or paste this link into your browser:</p>
    <div class="direct-link">{verify_url}</div>
    <p style="font-size: 13px; color: #64748b; margin-top: 16px;">This link expires in {settings.VERIFICATION_TOKEN_EXPIRE_HOURS} hours and can only be used once.</p>
    <div class="footer">
      If you did not request this verification, no action is needed.<br>
      &copy; {datetime.now(timezone.utc).year} Software Architecture Drift Detector.
    </div>
  </div>
</body>
</html>"""

        return cls._send_or_simulate(
            to_email=email,
            subject=subject,
            text_content=text_content,
            html_content=html_content,
            email_type="verification",
            token=token,
            action_url=verify_url,
        )

    @classmethod
    def send_password_reset_email(cls, email: str, token: str, full_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Sends a password reset token link.
        """
        reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
        recipient_name = full_name or email.split('@')[0]
        
        subject = "Reset your password - Software Architecture Drift Detector"
        
        text_content = f"""Hello {recipient_name},

A password reset was requested for your Software Architecture Drift Detector account.

Please reset your password by clicking the link below or copying it into your browser:
{reset_url}

This link is valid for {settings.PASSWORD_RESET_TOKEN_EXPIRE_HOURS} hours and can only be used once.

If you did not request a password reset, please ignore this email. Your current password remains unchanged.

Best regards,
The Software Architecture Drift Detector Team
"""

        html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      margin: 0;
      padding: 40px 20px;
      color: #1e293b;
    }}
    .container {{
      max-width: 560px;
      margin: 0 auto;
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 36px 32px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }}
    .header {{
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }}
    .logo-title {{
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.02em;
    }}
    h1 {{
      font-size: 20px;
      font-weight: 600;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 16px;
    }}
    p {{
      font-size: 15px;
      line-height: 1.6;
      color: #334155;
      margin-bottom: 20px;
    }}
    .button-container {{
      margin: 28px 0;
    }}
    .btn {{
      display: inline-block;
      background-color: #0f172a;
      color: #ffffff !important;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      padding: 12px 28px;
      border-radius: 6px;
    }}
    .direct-link {{
      font-size: 12px;
      color: #64748b;
      word-break: break-all;
      background-color: #f8fafc;
      padding: 12px;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }}
    .footer {{
      margin-top: 32px;
      padding-top: 20px;
      border-top: 1px solid #f1f5f9;
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.5;
    }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo-title">Software Architecture Drift Detector</div>
    </div>
    <h1>Password Reset Request</h1>
    <p>Hello {recipient_name},</p>
    <p>A password reset was requested for your account. Click the button below to choose a new password.</p>
    <div class="button-container">
      <a href="{reset_url}" class="btn" target="_blank">Reset Password</a>
    </div>
    <p style="font-size: 13px; color: #64748b;">Or paste this link into your browser:</p>
    <div class="direct-link">{reset_url}</div>
    <p style="font-size: 13px; color: #64748b; margin-top: 16px;">This link is valid for {settings.PASSWORD_RESET_TOKEN_EXPIRE_HOURS} hours and can only be used once.</p>
    <div class="footer">
      If you did not request a password reset, you can safely disregard this message. Your password will not change.<br>
      &copy; {datetime.now(timezone.utc).year} Software Architecture Drift Detector.
    </div>
  </div>
</body>
</html>"""

        return cls._send_or_simulate(
            to_email=email,
            subject=subject,
            text_content=text_content,
            html_content=html_content,
            email_type="password_reset",
            token=token,
            action_url=reset_url,
        )

    @classmethod
    def _send_or_simulate(
        cls,
        to_email: str,
        subject: str,
        text_content: str,
        html_content: str,
        email_type: str,
        token: str,
        action_url: str
    ) -> Dict[str, Any]:
        """
        Delivers via SMTP if configured.
        If SMTP is not configured:
          - in EMAIL_TEST_MODE (dev/test): writes to development mailbox folder and returns dev info.
          - in production: raises RuntimeError.
        """
        if cls.is_smtp_configured():
            try:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
                msg["To"] = to_email

                part1 = MIMEText(text_content, "plain")
                part2 = MIMEText(html_content, "html")
                msg.attach(part1)
                msg.attach(part2)

                logger.info(f"Connecting to SMTP server {settings.SMTP_HOST}:{settings.SMTP_PORT}...")
                server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
                try:
                    if settings.SMTP_USE_TLS:
                        server.starttls()
                    if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                    server.sendmail(settings.SMTP_FROM_EMAIL, [to_email], msg.as_string())
                    logger.info(f"Verification/Auth email successfully sent via SMTP to {to_email}")
                    return {
                        "delivered": True,
                        "method": "smtp",
                        "recipient": to_email,
                        "message": f"Email delivered to {to_email} via SMTP"
                    }
                finally:
                    try:
                        server.quit()
                    except Exception:
                        pass
            except Exception as e:
                logger.error(f"SMTP delivery failed to {to_email}: {str(e)}")
                # If production or test mode not allowed, raise
                if not settings.EMAIL_TEST_MODE:
                    raise RuntimeError(f"SMTP delivery failure: {str(e)}")
                logger.warning("SMTP delivery failed, falling back to development mailbox logging.")

        # Development / Testing Mailbox mode
        if settings.EMAIL_TEST_MODE:
            settings.ensure_directories()
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
            sanitized_email = to_email.replace("@", "_at_").replace(".", "_")
            file_base = f"{timestamp}_{sanitized_email}_{email_type}"
            
            data_file = settings.MAILBOX_DIR / f"{file_base}.json"
            html_file = settings.MAILBOX_DIR / f"{file_base}.html"
            
            payload = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "recipient": to_email,
                "email_type": email_type,
                "subject": subject,
                "action_url": action_url,
                "token": token,
                "note": "Development/Testing mode email capture. In production, configure SMTP settings."
            }
            
            with open(data_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
                
            with open(html_file, "w", encoding="utf-8") as f:
                f.write(html_content)
                
            logger.info(f"[DEV MAILBOX] Auth email saved to {data_file}")
            return {
                "delivered": True,
                "method": "development_mailbox",
                "recipient": to_email,
                "mailbox_file": str(data_file),
                "action_url": action_url,
                "message": f"Development mode: Email captured to dev mailbox ({data_file.name})"
            }

        raise RuntimeError(
            "SMTP is not configured and EMAIL_TEST_MODE is disabled. "
            "Please configure SMTP_HOST, SMTP_PORT, SMTP_USERNAME, and SMTP_PASSWORD."
        )

    @classmethod
    def get_latest_dev_email(cls, email: Optional[str] = None, email_type: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Helper for automated tests and dev convenience to retrieve the latest captured email.
        """
        settings.ensure_directories()
        json_files = sorted(settings.MAILBOX_DIR.glob("*.json"), key=os.path.getmtime, reverse=True)
        for jf in json_files:
            try:
                with open(jf, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if email and data.get("recipient") != email:
                    continue
                if email_type and data.get("email_type") != email_type:
                    continue
                return data
            except Exception:
                continue
        return None
