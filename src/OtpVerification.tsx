import {
  useState,
  useEffect,
  type FormEvent,
  type KeyboardEvent,
  type ClipboardEvent,
} from "react";
import emailjs from "@emailjs/browser";

export interface OtpVerificationProps {
  email: string;
  onSuccess: () => void;
  onCancel: () => void;
  renderLogo?: () => React.ReactNode;
}

// EmailJS Credentials
const EMAILJS_SERVICE_ID = "teacherportal";
const EMAILJS_TEMPLATE_ID = "template_83ex1qp";
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
}: OtpVerificationProps) {
  const cleanEmail = email.trim().toLowerCase();

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
  const sendVerificationEmail = async (targetEmail: string, force = false): Promise<string> => {
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
      message: `Your Teacher Portal password recovery verification code is: ${newOtp}. It is valid for 5 minutes.`,
    };

    await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      templateParams,
      EMAILJS_PUBLIC_KEY
    );

    lastSentTimestamps.set(target, { code: newOtp, timestamp: now });
    return newOtp;
  };

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
  }, [email]);

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

  // Handle Backspace and Arrow Key navigation
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
        // Validated successfully! Advance to new password screen
        onSuccess();
      } else {
        setOtpError("Invalid verification code. Please check your email and try again.");
      }
    } catch {
      setOtpError("Verification failed. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="relative w-full max-w-md">
      {/* Soft Ambient Card Backlight (Magenta) */}
      <div
        className="absolute -inset-1.5 rounded-3xl bg-gradient-to-b from-fuchsia-500/25 via-pink-600/15 to-transparent blur-xl pointer-events-none"
        aria-hidden="true"
      />

      <main className="relative w-full bg-white/95 dark:bg-[#130616]/95 backdrop-blur-xl border border-fuchsia-200/60 dark:border-fuchsia-900/40 rounded-2xl shadow-2xl shadow-fuchsia-950/20 p-6 sm:p-8 transition-all">
        <header className="flex flex-col items-center text-center mb-6">
          {renderLogo ? renderLogo() : null}

          {/* Heading: "Please Wait....." with each dot blinking at different time (5 dots) */}
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center justify-center">
            <span>Please Wait</span>
            <span className="inline-flex items-center ml-1 text-fuchsia-500 font-mono text-2xl font-black select-none" aria-hidden="true">
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
          </h1>

          {/* Required instruction: "Check your email and put down the OTP" */}
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300 font-medium">
            Check your email and put down the OTP
          </p>

          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
            Sent to: <span className="text-fuchsia-600 dark:text-fuchsia-400 font-semibold">{email}</span>
          </p>
        </header>

        {/* Live Dispatch Feedback Banner */}
        {sendStatus && (
          <div
            role="status"
            className={`mb-5 p-3 rounded-lg border text-xs flex items-center gap-2 transition-all ${
              sendSuccess
                ? "bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300/80 dark:border-emerald-700/60 text-emerald-850 dark:text-emerald-200"
                : isSending
                ? "bg-fuchsia-50/80 dark:bg-fuchsia-950/30 border-fuchsia-200/60 dark:border-fuchsia-900/40 text-fuchsia-800 dark:text-fuchsia-200"
                : "bg-red-50/90 dark:bg-red-950/40 border-red-300/80 dark:border-red-800/60 text-red-800 dark:text-red-200"
            }`}
          >
            {isSending ? (
              <svg className="w-4 h-4 text-fuchsia-500 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : sendSuccess ? (
              <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
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
              <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-fuchsia-600 to-pink-500 blur-sm opacity-50 pointer-events-none" />
              <div className="relative inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white dark:bg-[#1c0822] border border-fuchsia-300 dark:border-fuchsia-800 text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-300 shadow-md">
                <svg className="w-4 h-4 text-fuchsia-500 animate-spin" fill="none" viewBox="0 0 24 24" style={{ animationDuration: "6s" }}>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M12 2v10l7 7" strokeWidth="2" stroke="currentColor" strokeLinecap="round" />
                </svg>
                <span>Expires in:</span>
                <span className="font-mono text-sm tracking-wider font-bold text-fuchsia-600 dark:text-fuchsia-400">
                  {formatTimer(timerSeconds)}
                </span>
              </div>
            </div>

            {timerSeconds <= 0 && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400 font-medium">
                Timer expired! Please click Resend Code.
              </p>
            )}
          </div>

          {/* 5-Digit OTP Section (Backlit boxes) */}
          <div>
            <label className="font-label block text-xs font-semibold uppercase tracking-wider text-center text-zinc-500 dark:text-zinc-400 mb-3">
              5-Digit Verification Code
            </label>

            <div className="flex items-center justify-center gap-2.5 sm:gap-3" onPaste={handleOtpPaste}>
              {[0, 1, 2, 3, 4].map((index) => (
                <div key={index} className="relative group">
                  <div
                    className={`absolute -inset-0.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-500 blur-md transition-all duration-300 pointer-events-none ${
                      otp[index]
                        ? "opacity-80 blur-md"
                        : "opacity-25 group-hover:opacity-60 group-focus-within:opacity-100"
                    }`}
                    aria-hidden="true"
                  />
                  <input
                    id={`otp-box-${index}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    value={otp[index]}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    autoFocus={index === 0}
                    aria-label={`OTP Digit ${index + 1}`}
                    className="relative w-11 h-14 sm:w-12 sm:h-14 rounded-xl border border-fuchsia-200/80 dark:border-fuchsia-900/60 bg-white dark:bg-[#18081c] text-center text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100 outline-none focus:border-fuchsia-500 dark:focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-500/30 transition-all shadow-sm"
                  />
                </div>
              ))}
            </div>

            {otpError && (
              <p role="alert" className="mt-2 text-center text-xs text-red-600 dark:text-red-400 font-medium">
                {otpError}
              </p>
            )}

            <p className="mt-3 text-center text-[11px] text-zinc-500 dark:text-zinc-400">
              Didn't receive code?{" "}
              <button
                type="button"
                onClick={handleResend}
                disabled={isSending}
                className="font-medium text-fuchsia-600 hover:text-fuchsia-500 dark:text-fuchsia-400 hover:underline cursor-pointer disabled:opacity-50"
              >
                {isSending ? "Sending code..." : "Resend Code (5m)"}
              </button>
            </p>
          </div>

          {/* Action Button at Middle Bottom: "Continue" */}
          <div className="relative group pt-1">
            <div
              className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-fuchsia-600 via-pink-500 to-rose-500 opacity-60 blur-md group-hover:opacity-100 group-hover:blur-lg transition-all duration-300 pointer-events-none"
              aria-hidden="true"
            />

            <button
              type="submit"
              disabled={isVerifying}
              className="relative w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-600 hover:from-fuchsia-500 hover:via-pink-500 hover:to-rose-500 active:from-fuchsia-700 active:to-rose-700 text-white font-medium text-sm transition-all duration-150 focus:outline-none focus-visible:ring-4 focus-visible:ring-fuchsia-500/40 disabled:opacity-70 disabled:cursor-not-allowed shadow-md shadow-fuchsia-950/30 active:scale-[0.99] cursor-pointer"
            >
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
            </button>
          </div>
          
        </form>

        <footer className="mt-7 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Want to cancel?{" "}
          <button
            type="button"
            onClick={onCancel}
            className="font-medium text-fuchsia-600 hover:text-fuchsia-500 dark:text-fuchsia-400 dark:hover:text-fuchsia-300 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500 rounded cursor-pointer"
          >
            Back to sign in
          </button>
        </footer>
      </main>
    </div>
  );
}