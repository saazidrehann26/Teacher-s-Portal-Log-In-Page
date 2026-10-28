import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type ClipboardEvent,
} from "react";
import emailjs from "@emailjs/browser";
import { handleWaterRipple } from "./waterRipple";

export interface OtpVerificationProps {
  email: string;
  onSuccess: () => void;
  onCancel: () => void;
  renderLogo?: () => React.ReactNode;
  title?: string;
  subtitle?: string;
  showStaggeredDots?: boolean;
  purpose?: "register" | "forgot";
}

// EmailJS Credentials
// For user verification (Registration)
const USER_VERIFICATION_SERVICE_ID = "userverification";
const USER_VERIFICATION_TEMPLATE_ID = "template_67pjeib";

// For password recovery (Forgot Password)
const RESET_PASS_SERVICE_ID = "resetpass";
const RESET_PASS_TEMPLATE_ID = "template_qxrxwsn";

const EMAILJS_PUBLIC_KEY = "ME2eguiVl69ksPgzH";

// Module-level locks and promise cache to strictly prevent duplicate dispatches across React StrictMode / remounts
let activeEmailJsPromise: Promise<string> | null = null;
let activeTargetEmail = "";
const lastSentTimestamps = new Map<string, { code: string; timestamp: number }>();

export default function OtpVerification({
  email,
  onSuccess,
  onCancel,
  renderLogo,
  title = "Please Wait",
  subtitle = "Check your email and put down the OTP",
  showStaggeredDots,
  purpose = "forgot",
}: OtpVerificationProps) {
  const isUnmountedRef = useRef(false);
  useEffect(() => {
    return () => {
      isUnmountedRef.current = true;
    };
  }, []);

  const cleanEmail = email.trim().toLowerCase();
  const shouldShowDots = showStaggeredDots !== undefined ? showStaggeredDots : title === "Please Wait";

  // 5-minute timer (300 seconds)
  const [timerSeconds, setTimerSeconds] = useState(300);
  const [otp, setOtp] = useState<string[]>(["", "", "", "", ""]);
  const [generatedOtp, setGeneratedOtp] = useState<string | null>(() => {
    const recent = lastSentTimestamps.get(cleanEmail);
    return recent?.code || null;
  });

  const [otpError, setOtpError] = useState<string | undefined>();
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSending, setIsSending] = useState(() => {
    const recent = lastSentTimestamps.get(cleanEmail);
    const isRecent = Boolean(recent && Date.now() - recent.timestamp < 30000);
    return !isRecent;
  });
  const [sendSuccess, setSendSuccess] = useState(() => {
    const recent = lastSentTimestamps.get(cleanEmail);
    return Boolean(recent && Date.now() - recent.timestamp < 30000);
  });
  const [sendStatus, setSendStatus] = useState<string>(() => {
    const recent = lastSentTimestamps.get(cleanEmail);
    const isRecent = Boolean(recent && Date.now() - recent.timestamp < 30000);
    return isRecent
      ? `Mail sent successfully to ${cleanEmail}`
      : `Dispatching 5-digit verification code to ${cleanEmail}...`;
  });

  // Generate a random 5-digit OTP
  const generate5DigitOTP = () => {
    return Math.floor(10000 + Math.random() * 90000).toString();
  };

  // Helper function to handle EmailJS sending (enforcing strictly 1 email per request)
  const sendVerificationEmail = useCallback(async (targetEmail: string, force = false): Promise<string> => {
    const target = targetEmail.trim().toLowerCase();
    const now = Date.now();

    // Check if an email was already dispatched recently to this address (unless explicitly requested via Resend button)
    const recent = lastSentTimestamps.get(target);
    if (!force && recent && now - recent.timestamp < 30000) {
      return recent.code;
    }

    // Check sessionStorage for an active code created within the last 30 seconds
    if (!force && typeof window !== "undefined") {
      try {
        const raw = sessionStorage.getItem("teacher_portal_active_otp");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.email === target && now - parsed.createdAt < 30000 && parsed.code) {
            lastSentTimestamps.set(target, { code: parsed.code, timestamp: parsed.createdAt });
            return parsed.code;
          }
        }
      } catch {}
    }

    const newOtp = generate5DigitOTP();
    console.log(`[Teacher Portal Verification] 5-Digit OTP for ${target}:`, newOtp);

    // Save session to sessionStorage for recovery flow
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(
          "teacher_portal_active_otp",
          JSON.stringify({
            email: target,
            code: newOtp,
            createdAt: now,
            expiresAt: now + 5 * 60 * 1000,
          })
        );
      } catch {}
    }

    const isRegister = purpose === "register";
    const serviceId = isRegister ? USER_VERIFICATION_SERVICE_ID : RESET_PASS_SERVICE_ID;
    const templateCandidates = isRegister
      ? [USER_VERIFICATION_TEMPLATE_ID, "67pjeib"]
      : [RESET_PASS_TEMPLATE_ID, "emplate_qxrxwsn", "qxrxwsn"];

    const messageBody = isRegister
      ? `Your Teacher Portal email verification code is: ${newOtp}. It is valid for 5 minutes.`
      : `Your Teacher Portal password recovery verification code is: ${newOtp}. It is valid for 5 minutes.`;

    const templateParams = {
      to_email: target,
      email: target,
      user_email: target,
      recipient: target,
      reply_to: target,
      to_name: target.split("@")[0] || "Teacher",
      otp: newOtp,
      otp_code: newOtp,
      code: newOtp,
      verification_code: newOtp,
      passcode: newOtp,
      message: messageBody,
    };

    let sent = false;
    let lastError: unknown = null;

    for (const tId of templateCandidates) {
      try {
        await emailjs.send(
          serviceId,
          tId,
          templateParams,
          EMAILJS_PUBLIC_KEY
        );
        sent = true;
        break;
      } catch (err) {
        lastError = err;
        console.warn(`EmailJS dispatch attempt with template ${tId} on service ${serviceId} failed:`, err);
      }
    }

    if (!sent && lastError) {
      throw lastError;
    }

    lastSentTimestamps.set(target, { code: newOtp, timestamp: now });
    return newOtp;
  }, [purpose]);

  // Send initial OTP email when component mounts (guaranteed strictly 1 email and instant UI success notification)
  useEffect(() => {
    let isMounted = true;
    const target = email.trim().toLowerCase();

    // If an email was already sent recently (< 30 seconds ago), state is already initialized to success
    const recent = lastSentTimestamps.get(target);
    if (recent && Date.now() - recent.timestamp < 30000) {
      return;
    }

    // Reuse or create active dispatch promise
    if (!activeEmailJsPromise || activeTargetEmail !== target) {
      activeTargetEmail = target;
      activeEmailJsPromise = sendVerificationEmail(target, false);
    }

    activeEmailJsPromise
      .then((code) => {
        activeEmailJsPromise = null;
        if (!isMounted) return;
        setGeneratedOtp(code);
        setIsSending(false);
        setSendSuccess(true);
        setSendStatus(`Mail sent successfully to ${target}`);
      })
      .catch((err) => {
        activeEmailJsPromise = null;
        if (!isMounted) return;
        setIsSending(false);
        setSendSuccess(false);
        console.error("EmailJS Error:", err);
        const errMsg = err?.text || err?.message || "EmailJS delivery failed";
        setSendStatus(`Delivery notice: ${errMsg}`);
      });

    return () => {
      isMounted = false;
    };
  }, [email, sendVerificationEmail]);

  // 5-minute countdown timer
  useEffect(() => {
    if (timerSeconds <= 0) return;

    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timerSeconds]);

  const formatTimer = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // Handle single-digit input change with auto-advance
  const handleOtpChange = (index: number, val: string) => {
    const digit = val.slice(-1).replace(/[^0-9]/g, "");
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    setOtpError(undefined);

    if (digit && index < 4) {
      document.getElementById(`otp-box-${index + 1}`)?.focus();
    }
  };

  // Handle Backspace, Arrow Key and Enter navigation
  const handleOtpKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!otp[index] && index > 0) {
        e.preventDefault();
        const newOtp = [...otp];
        newOtp[index - 1] = "";
        setOtp(newOtp);
        document.getElementById(`otp-box-${index - 1}`)?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      document.getElementById(`otp-box-${index - 1}`)?.focus();
    } else if (e.key === "ArrowRight" && index < 4) {
      document.getElementById(`otp-box-${index + 1}`)?.focus();
    } else if (e.key === "Enter") {
      if (index < 4) {
        e.preventDefault();
        document.getElementById(`otp-box-${index + 1}`)?.focus();
      }
    }
  };

  // Handle Pasting full 5-digit OTP
  const handleOtpPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/[^0-9]/g, "").slice(0, 5);
    if (!pasted) return;

    const newOtp = [...otp];
    for (let i = 0; i < 5; i++) {
      newOtp[i] = pasted[i] || "";
    }
    setOtp(newOtp);
    setOtpError(undefined);

    const nextIdx = Math.min(pasted.length, 4);
    document.getElementById(`otp-box-${nextIdx}`)?.focus();
  };

  // Handle Resending Code
  const handleResend = async () => {
    setTimerSeconds(300);
    setOtp(["", "", "", "", ""]);
    setOtpError(undefined);
    setIsSending(true);
    setSendSuccess(false);
    setSendStatus(`Resending verification code to ${cleanEmail}...`);

    try {
      activeTargetEmail = cleanEmail;
      activeEmailJsPromise = sendVerificationEmail(cleanEmail, true);
      const freshCode = await activeEmailJsPromise;
      activeEmailJsPromise = null;
      setGeneratedOtp(freshCode);
      setIsSending(false);
      setSendSuccess(true);
      setSendStatus(`Mail sent successfully to ${cleanEmail}`);
    } catch (err) {
      activeEmailJsPromise = null;
      setIsSending(false);
      setSendSuccess(false);
      console.error("EmailJS Error:", err);
      const errMsg =
        (err as { text?: string; message?: string })?.text ||
        (err as { message?: string })?.message ||
        "Failed to send new code";
      setSendStatus(`Failed to send new code: ${errMsg}. Please try again.`);
    } finally {
      document.getElementById("otp-box-0")?.focus();
    }
  };

  // Handle OTP Submission (Continue Button)
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fullOtp = otp.join("");

    if (fullOtp.length < 5) {
      setOtpError("Please enter all 5 digits of the OTP code.");
      return;
    }

    if (timerSeconds <= 0) {
      setOtpError("Your 5-minute OTP code has expired. Please click 'Resend Code'.");
      return;
    }

    setIsVerifying(true);
    setOtpError(undefined);

    try {
      // Simulate network request delay for UX
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Verify code against generated state or active session
      let isValid = fullOtp === generatedOtp;
      if (!isValid) {
        try {
          const raw = sessionStorage.getItem("teacher_portal_active_otp");
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.code === fullOtp && Date.now() <= parsed.expiresAt) {
              isValid = true;
            }
          }
        } catch {}
      }

      if (isValid) {
        // Validated successfully! Advance view immediately without resetting button state
        onSuccess();
        return;
      }

      setOtpError("Invalid verification code. Please check your email and try again.");
      if (!isUnmountedRef.current) {
        setIsVerifying(false);
      }
    } catch {
      if (!isUnmountedRef.current) {
        setOtpError("Verification failed. Please try again.");
        setIsVerifying(false);
      }
    }
  };

  return (
    <div className="relative z-10 w-full max-w-md">
      <main className="relative w-full login-card glass-panel glass-gradient-border glass-specular-top rounded-3xl p-7 sm:p-9 transition-all">
        <header className="flex flex-col items-center text-center mb-6">
          {renderLogo ? renderLogo() : null}

          {/* Heading: either "Verify your email" or "Please Wait....." */}
          <h1 className="text-[25px] sm:text-[27px] tracking-normal bright-heading flex items-center justify-center">
            <span>{title}</span>
            {shouldShowDots && (
              <span className="inline-flex items-center ml-1 text-[#daaceb] font-mono text-[25px] sm:text-[27px] font-bold select-none drop-shadow-[0_0_8px_rgba(218,172,235,0.9)]" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className="staggered-dot inline-block"
                    style={{ animationDelay: `${i * 150}ms` }}
                  >
                    .
                  </span>
                ))}
              </span>
            )}
          </h1>

          {/* Subtitle / instruction */}
          <p className="mt-2 text-xs bright-body">
            {subtitle}
          </p>

          <p className="text-[11px] bright-body mt-0.5">
            Sent to: <span className="text-[#daaceb] font-semibold drop-shadow-[0_0_8px_rgba(218,172,235,0.9)]">{email}</span>
          </p>
        </header>

        {/* Live Dispatch Feedback Banner */}
        {sendStatus && (
          <div
            role="status"
            className={`mb-5 p-3 rounded-2xl border text-xs flex items-center gap-2 transition-all water-dewdrop-pill font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${
              sendSuccess
                ? "border-emerald-400/50 text-emerald-200"
                : isSending
                ? "border-[#907cba]/50 text-[#daaceb]"
                : "border-red-400/50 text-red-200"
            }`}
          >
            {isSending ? (
              <svg className="w-4 h-4 text-[#daaceb] animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : sendSuccess ? (
              <svg className="w-4 h-4 text-emerald-300 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-red-300 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
            <span className="flex-1 font-medium truncate">{sendStatus}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          {/* 5-Minute Timer (Positioned directly above the OTP section) */}
          <div className="flex flex-col items-center justify-center">
            <div className="relative group">
              <div className="absolute -inset-0.5 rounded-full button-streak-overlay blur-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="relative inline-flex items-center gap-2 px-4 py-1.5 rounded-full water-dewdrop-pill text-xs font-medium text-white shadow-md">
                <svg className="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24" style={{ animationDuration: "6s" }}>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M12 2v10l7 7" strokeWidth="2" stroke="currentColor" strokeLinecap="round" />
                </svg>
                <span className="text-white">Expires in:</span>
                <span className="font-mono text-sm tracking-wider font-semibold text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.7)]">
                  {formatTimer(timerSeconds)}
                </span>
              </div>
            </div>

            {timerSeconds <= 0 && (
              <p className="mt-2 text-xs text-red-400 font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                Timer expired! Please click Resend Code.
              </p>
            )}
          </div>

          {/* 5-Digit OTP Section (Backlit boxes) */}
          <div>
            <label className="font-label block text-xs tracking-wider text-center bright-label mb-3">
              5-Digit Verification Code
            </label>

            <div className="flex items-center justify-center gap-2.5 sm:gap-3" onPaste={handleOtpPaste}>
              {[0, 1, 2, 3, 4].map((index) => (
                <div key={index} className="relative group glass-input-wrapper w-11 h-14 sm:w-12 sm:h-14">
                  <div
                    className="hidden"
                    aria-hidden="true"
                  />
                  <input
                    id={`otp-box-${index}`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    spellCheck={false}
                    maxLength={2}
                    value={otp[index]}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    enterKeyHint={index < 4 ? "next" : "go"}
                    autoFocus={index === 0}
                    aria-label={`OTP Digit ${index + 1}`}
                    className="w-full h-full rounded-full glass-input-box otp-input-box text-center text-[28px] sm:text-[30px] font-bold text-white outline-none"
                  />
                </div>
              ))}
            </div>

            {otpError && (
              <p role="alert" className="mt-2 text-center text-xs text-red-400 font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                {otpError}
              </p>
            )}

            <p className="mt-3 text-center text-[11px] bright-body">
              Didn't receive code?{" "}
              <button
                type="button"
                onClick={handleResend}
                disabled={isSending}
                className="bright-link hover:underline cursor-pointer disabled:opacity-50"
              >
                {isSending ? "Sending code..." : "Resend Code (5m)"}
              </button>
            </p>
          </div>

          {/* Action Button at Middle Bottom: "Continue" */}
          <div className="relative pt-1">
            <button
              type="submit"
              disabled={isVerifying}
              onMouseDown={handleWaterRipple}
              className="relative group w-full flex items-center justify-center py-3.5 px-4 rounded-full water-dewdrop-pill text-[14px] font-medium text-white shadow-lg cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div
                className="absolute -inset-0.5 rounded-full button-streak-overlay blur-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                aria-hidden="true"
              />
              <span className="relative z-20 flex items-center justify-center gap-2 text-white">
                {isVerifying ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Verifying code...</span>
                  </>
                ) : (
                  "Continue"
                )}
              </span>
            </button>
          </div>
          
        </form>

        <footer className="mt-7 text-center text-[13px] bright-body">
          Want to cancel?{" "}
          <button
            type="button"
            onClick={onCancel}
            className="bright-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 rounded cursor-pointer"
          >
            {purpose === "register" ? "Back to registration" : "Back to sign in"}
          </button>
        </footer>
      </main>
    </div>
  );
}