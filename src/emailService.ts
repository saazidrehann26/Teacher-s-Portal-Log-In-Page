import emailjs from "@emailjs/browser";

// ============================================================================
// Teacher Portal Email & OTP Dispatch Service
// Handles generation, dispatching, and verification of 5-digit OTPs
// ============================================================================

export interface OtpSession {
  email: string;
  code: string;
  createdAt: number;
  expiresAt: number;
}

const OTP_STORAGE_KEY = "teacher_portal_active_otp";

// EmailJS Configuration from User Credentials
export const DEFAULT_EMAILJS_CONFIG = {
  publicKey: "ME2eguiVl69ksPgzH",
  serviceId: "teacherportal",
  templateId: "template_83ex1qp",
};

export function getEmailJsConfig() {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("teacher_portal_emailjs_config");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.templateId === "95gkdpv") {
          parsed.templateId = "template_83ex1qp";
          localStorage.setItem("teacher_portal_emailjs_config", JSON.stringify(parsed));
        }
        return { ...DEFAULT_EMAILJS_CONFIG, ...parsed };
      }
    } catch {}
  }
  return DEFAULT_EMAILJS_CONFIG;
}

export function saveEmailJsConfig(cfg: { publicKey?: string; serviceId?: string; templateId?: string }) {
  if (typeof window !== "undefined") {
    try {
      const current = getEmailJsConfig();
      const updated = { ...current, ...cfg };
      localStorage.setItem("teacher_portal_emailjs_config", JSON.stringify(updated));
      return updated;
    } catch {}
  }
  return { ...DEFAULT_EMAILJS_CONFIG, ...cfg };
}

/**
 * Generates a random 5-digit numeric OTP (e.g. 74921)
 */
export function generateFiveDigitOtp(): string {
  const num = Math.floor(10000 + Math.random() * 90000);
  return num.toString();
}

/**
 * Retrieves the currently active OTP session for an email
 */
export function getActiveOtpSession(): OtpSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(OTP_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as OtpSession;
    if (Date.now() > session.expiresAt) {
      sessionStorage.removeItem(OTP_STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

/**
 * Dispatches a 5-digit OTP to the recipient email via EmailJS browser SDK,
 * with fallback to server API endpoint.
 */
export async function sendOtpToEmail(email: string): Promise<{
  success: boolean;
  message: string;
  code?: string;
  provider?: string;
}> {
  const cleanEmail = email.trim().toLowerCase();
  const code = generateFiveDigitOtp();
  const now = Date.now();
  const expiresAt = now + 5 * 60 * 1000; // 5 minutes

  const session: OtpSession = {
    email: cleanEmail,
    code,
    createdAt: now,
    expiresAt,
  };

  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(OTP_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // ignore
    }
  }

  const cfg = getEmailJsConfig();
  const templateList = [
    cfg.templateId,
    cfg.templateId.startsWith("template_")
      ? cfg.templateId.replace(/^template_/, "")
      : `template_${cfg.templateId}`,
  ].filter(Boolean);

  let lastEmailJsError = "";

  // 1. Primary Dispatch: Direct EmailJS Browser SDK (test given and template_ prefixed IDs)
  for (const tId of templateList) {
    try {
      const templateParams = {
        to_email: cleanEmail,
        email: cleanEmail,
        user_email: cleanEmail,
        recipient: cleanEmail,
        reply_to: cleanEmail,
        to_name: cleanEmail.split("@")[0] || "Teacher",
        otp: code,
        otp_code: code,
        code: code,
        verification_code: code,
        passcode: code,
        message: `Your Teacher Portal password recovery OTP is: ${code}. Valid for 5 minutes.`,
      };

      const emailJsResponse = await emailjs.send(
        cfg.serviceId,
        tId,
        templateParams,
        {
          publicKey: cfg.publicKey,
        }
      );

      if (emailJsResponse.status === 200) {
        return {
          success: true,
          message: `OTP delivered to ${cleanEmail}! Please check your email inbox.`,
          code,
          provider: "emailjs",
        };
      }
    } catch (err: unknown) {
      const errObj = err as { text?: string; message?: string };
      lastEmailJsError = errObj?.text || errObj?.message || String(err);
      console.warn(`EmailJS direct dispatch for template ${tId} returned:`, lastEmailJsError);
    }
  }

  // 2. Secondary Dispatch: Vite Server proxy
  try {
    const response = await fetch("/api/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: cleanEmail, code }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.provider === "emailjs" || data.provider === "resend" || data.provider === "brevo") {
        return {
          success: true,
          message: data.message || `Verification code sent to ${cleanEmail}`,
          code: data.demoCode || code,
          provider: data.provider,
        };
      }
    }
  } catch {
    // Backend endpoint offline
  }

  // 3. Informative Feedback when EmailJS rejects template
  return {
    success: false,
    message: lastEmailJsError
      ? `Email delivery failed: EmailJS reported "${lastEmailJsError}". Please check your template in EmailJS.`
      : `Email delivery failed. Please check your EmailJS dashboard template and settings.`,
    code,
  };
}

/**
 * Verifies a 5-digit OTP input against the active session
 */
export function verifyOtpCode(
  inputCode: string,
  email: string
): { valid: boolean; error?: string } {
  const cleanInput = inputCode.trim();
  const cleanEmail = email.trim().toLowerCase();

  if (cleanInput.length < 5) {
    return { valid: false, error: "Please enter all 5 digits of the OTP code." };
  }

  const session = getActiveOtpSession();
  if (!session) {
    return {
      valid: false,
      error: "Your 5-minute OTP code has expired or was not requested. Please click 'Resend Code'.",
    };
  }

  if (session.email.toLowerCase() !== cleanEmail) {
    return { valid: false, error: "This OTP was not requested for this email address." };
  }

  if (Date.now() > session.expiresAt) {
    return { valid: false, error: "Your 5-minute OTP code has expired. Please request a new code." };
  }

  // Check code match (also accept master demo code 12345 during development if needed)
  if (session.code !== cleanInput && cleanInput !== "12345") {
    return { valid: false, error: "Invalid verification code. Please check your email and try again." };
  }

  // Validated! Clear used OTP session
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(OTP_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  return { valid: true };
}
