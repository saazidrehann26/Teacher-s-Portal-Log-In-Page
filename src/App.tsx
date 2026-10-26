import {
  useState,
  useEffect,
  useRef,
  type FormEvent,
} from "react";
import academicBg from "./assets/Gemini_Generated_Image_v5lj6qv5lj6qv5lj.jpg";
import webLogo from "./assets/web-logo.jpg";
import {
  getDatabaseUsers,
  isEmailRegisteredInDatabase,
  saveUserToDatabase,
  verifyUserLogin,
  updateUserPasswordInDatabase,
  syncDatabaseWithServer,
  type TeacherUser,
} from "./db";
import OtpVerification from "./OtpVerification";
import { handleWaterRipple } from "./waterRipple";

// ============================================================================
// Types & Validation Helpers
// ============================================================================

type ViewMode = "login" | "register" | "register_otp" | "forgot_email" | "forgot_otp" | "forgot_reset" | "portal";

const viewToHash: Record<ViewMode, string> = {
  login: "#login",
  register: "#register",
  register_otp: "#verify-email",
  forgot_email: "#forgot-password",
  forgot_otp: "#verify-otp",
  forgot_reset: "#reset-password",
  portal: "#portal",
};

function hashToView(hash: string): ViewMode {
  const clean = (hash || "").replace(/^#/, "").toLowerCase();
  if (clean === "register") return "register";
  if (clean === "verify-email" || clean === "register_otp" || clean === "register-otp") return "register_otp";
  if (clean === "forgot-password" || clean === "forgot_email" || clean === "forgot") return "forgot_email";
  if (clean === "verify-otp" || clean === "forgot_otp" || clean === "otp") return "forgot_otp";
  if (clean === "reset-password" || clean === "forgot_reset" || clean === "reset") return "forgot_reset";
  if (clean === "portal" || clean === "dashboard") return "portal";
  return "login";
}

interface LoginFormValues {
  email: string;
  password: string;
  rememberMe: boolean;
}

interface LoginFormErrors {
  email?: string;
  password?: string;
  general?: string;
}

interface RegisterFormValues {
  fullName: string;
  institutionName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface RegisterFormErrors {
  fullName?: string;
  institutionName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  general?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 4;

function getPasswordStrength(password: string): { score: number; label: string } {
  if (!password) return { score: 0, label: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  return { score, label: labels[score] || "Strong" };
}

// ============================================================================
// Logo Badge with Glowing Box and Vibrant Halo Effect
// ============================================================================

export function LogoBadge() {
  return (
    <div className="relative group/badge mb-5">
      {/* Radiant ambient backlit glow behind badge for maximum standout visibility */}
      <div
        className="absolute -inset-3 rounded-3xl bg-gradient-to-tr from-white/60 via-white/80 to-pink-200/50 blur-xl opacity-90 group-hover/badge:opacity-100 group-hover/badge:blur-2xl transition-all duration-300 pointer-events-none"
        aria-hidden="true"
      />
      {/* Hero logo badge with enlarged size, pure white backdrop, and sharp presence */}
      <div
        className="relative h-20 w-20 sm:h-24 sm:w-24 rounded-3xl bg-white border-2 border-white flex items-center justify-center p-1.5 transition-transform duration-200 group-hover/badge:scale-105 shadow-[0_12px_32px_rgba(0,0,0,0.6),0_0_25px_rgba(255,255,255,0.55)] overflow-hidden"
      >
        <img
          src={webLogo}
          alt="Teacher Portal Logo"
          className="w-full h-full object-contain rounded-2xl select-none"
        />
      </div>
    </div>
  );
}

// ============================================================================
// Dark Academic Background (100% Crisp, Pure, Unblurred Wallpaper)
// ============================================================================

function AcademicBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 select-none" aria-hidden="true">
      {/* 100% Crisp, Clear, Unblurred Dark Academic Wallpaper */}
      <img
        src={academicBg}
        alt="Academic Background"
        className="absolute inset-0 w-full h-full object-cover object-center"
      />
    </div>
  );
}

function EmptyOtpFallback({ onRedirect }: { onRedirect: () => void }) {
  useEffect(() => {
    onRedirect();
  }, [onRedirect]);
  return null;
}

// ============================================================================
// Main Application Component
// ============================================================================

export default function App() {
  // Navigation State initialized from URL hash
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return hashToView(window.location.hash);
    }
    return "login";
  });

  // Cinematic 3D spatial transition states
  const [panelAnimClass, setPanelAnimClass] = useState<string>("panel-spatial-enter");
  const [_isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Login welcome/notification banner message
  const [loginNotice, setLoginNotice] = useState<string | undefined>();

  // Database of Registered Teachers (Loaded from persistent database)
  const [teacherDatabase, setTeacherDatabase] = useState<string[]>(() =>
    getDatabaseUsers().map((u) => u.email.toLowerCase())
  );

  // Currently logged in teacher user
  const [loggedInUser, setLoggedInUser] = useState<TeacherUser | undefined>();

  // Sync database with server/file on initial mount
  useEffect(() => {
    syncDatabaseWithServer().then((users) => {
      setTeacherDatabase(users.map((u) => u.email.toLowerCase()));
    });
  }, []);

  // Browser Navigation History & Back/Forward Support (including Android back button)
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Normalize initial entry in browser history without creating a duplicate entry
    const initialHash = window.location.hash;
    const initialView = hashToView(initialHash);
    const expectedHash = viewToHash[initialView];

    if (!initialHash || initialHash === "#" || initialHash === "") {
      window.history.replaceState({ view: initialView }, "", expectedHash);
    } else if (!window.history.state || window.history.state.view !== initialView) {
      window.history.replaceState({ view: initialView }, "", initialHash);
    }

    // Handles browser Back, Forward, and Android Back button
    const handlePopState = (e: PopStateEvent) => {
      const targetView: ViewMode =
        (e.state && e.state.view) || hashToView(window.location.hash);
      
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }

      setView((prev) => {
        if (prev !== targetView) {
          setPanelAnimClass("panel-spatial-exit");
          setIsTransitioning(true);
          transitionTimerRef.current = setTimeout(() => {
            setView(targetView);
            if (targetView !== "login" && targetView !== "portal") {
              setLoginNotice(undefined);
            }
            setPanelAnimClass("panel-spatial-enter");
            transitionTimerRef.current = setTimeout(() => {
              setIsTransitioning(false);
              transitionTimerRef.current = null;
            }, 360);
          }, 300);
          return prev;
        }
        return prev;
      });
    };

    const handleHashChange = () => {
      const targetView = hashToView(window.location.hash);

      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }

      setView((prev) => {
        if (prev !== targetView) {
          setPanelAnimClass("panel-spatial-exit");
          setIsTransitioning(true);
          transitionTimerRef.current = setTimeout(() => {
            setView(targetView);
            if (targetView !== "login" && targetView !== "portal") {
              setLoginNotice(undefined);
            }
            setPanelAnimClass("panel-spatial-enter");
            transitionTimerRef.current = setTimeout(() => {
              setIsTransitioning(false);
              transitionTimerRef.current = null;
            }, 360);
          }, 300);
          return prev;
        }
        return prev;
      });
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("hashchange", handleHashChange);

    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  // Navigate to a new view with cinematic 3D receding exit and materializing entry
  const navigateTo = (newView: ViewMode, replace = false, immediate = false) => {
    if (newView !== "login" && newView !== "portal") {
      setLoginNotice(undefined);
    }
    if (newView === view) return;

    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }

    const targetHash = viewToHash[newView] || "#login";

    if (immediate) {
      if (typeof window !== "undefined") {
        if (replace) {
          window.history.replaceState({ view: newView }, "", targetHash);
        } else {
          window.history.pushState({ view: newView }, "", targetHash);
        }
      }
      setView(newView);
      setPanelAnimClass("panel-spatial-enter");
      setIsTransitioning(false);
      return;
    }

    setIsTransitioning(true);
    setPanelAnimClass("panel-spatial-exit");

    // Exit animation duration: 280ms (smoothly scales to 80% & fades out)
    transitionTimerRef.current = setTimeout(() => {
      if (typeof window !== "undefined") {
        if (replace) {
          window.history.replaceState({ view: newView }, "", targetHash);
        } else {
          window.history.pushState({ view: newView }, "", targetHash);
        }
      }
      setView(newView);
      // Entry animation: materializes from 80% scale & fades in to 100%
      setPanelAnimClass("panel-spatial-enter");

      // Locks firmly in foreground after 360ms
      transitionTimerRef.current = setTimeout(() => {
        setIsTransitioning(false);
        transitionTimerRef.current = null;
      }, 360);
    }, 280);
  };

  // Theme state: dark mode defaults to true for maximum backlit neon impact
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("theme");
      if (saved) return saved === "dark";
      return true;
    }
    return true;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  // --------------------------------------------------------------------------
  // 1. Login Form State
  // --------------------------------------------------------------------------
  const [loginValues, setLoginValues] = useState<LoginFormValues>({
    email: "",
    password: "",
    rememberMe: false,
  });
  const [loginErrors, setLoginErrors] = useState<LoginFormErrors>({});
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);

  const handleLoginSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoginNotice(undefined);

    const cleanEmail = loginValues.email.trim().toLowerCase();
    const newErrors: LoginFormErrors = {};
    if (!cleanEmail) {
      newErrors.email = "Email address is required.";
    } else if (!EMAIL_REGEX.test(cleanEmail)) {
      newErrors.email = "Please enter a valid email address.";
    }

    if (!loginValues.password) {
      newErrors.password = "Password is required.";
    }

    if (Object.keys(newErrors).length > 0) {
      setLoginErrors(newErrors);
      return;
    }

    setLoginErrors({});
    setIsLoginLoading(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Verifies each login attempt against the registered teacher database
      const result = verifyUserLogin(cleanEmail, loginValues.password);

      if (!result.success) {
        setLoginErrors({
          general: result.message || "Invalid email or password. Please verify your credentials.",
        });
        return;
      }

      setLoggedInUser(result.user);
      setLoginSuccess(true);
      setTimeout(() => {
        navigateTo("portal");
      }, 700);
    } catch {
      setLoginErrors({ general: "Sign in error. Please verify and try again." });
    } finally {
      setIsLoginLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // 2. Register Form State
  // --------------------------------------------------------------------------
  const [regValues, setRegValues] = useState<RegisterFormValues>({
    fullName: "",
    institutionName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [pendingRegistration, setPendingRegistration] = useState<RegisterFormValues | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem("teacher_portal_pending_reg");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return null;
  });
  const [regErrors, setRegErrors] = useState<RegisterFormErrors>({});
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [isRegLoading, setIsRegLoading] = useState(false);

  const regPasswordStrength = getPasswordStrength(regValues.password);

  const handleRegSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const cleanEmail = regValues.email.trim().toLowerCase();
    const errs: RegisterFormErrors = {};
    if (!regValues.fullName.trim()) errs.fullName = "Full Name is required.";
    if (!regValues.institutionName.trim()) errs.institutionName = "Institution Name is required.";
    if (!cleanEmail) errs.email = "Institution or personal email is required.";
    else if (!EMAIL_REGEX.test(cleanEmail)) errs.email = "Please enter a valid email address.";

    if (!regValues.password) errs.password = "Password is required.";
    else if (regValues.password.length < MIN_PASSWORD_LENGTH) {
      errs.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }

    if (!regValues.confirmPassword) errs.confirmPassword = "Please confirm your password.";
    else if (regValues.confirmPassword !== regValues.password) {
      errs.confirmPassword = "Passwords do not match.";
    }

    if (Object.keys(errs).length > 0) {
      setRegErrors(errs);
      return;
    }

    setRegErrors({});
    setIsRegLoading(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 350));

      // Prevent duplicate registration
      if (isEmailRegisteredInDatabase(cleanEmail)) {
        setRegErrors({
          email: "This email is already registered. Please sign in or use 'Forgot password?'.",
        });
        setIsRegLoading(false);
        return;
      }

      // Store pending registration data to finalize upon successful OTP verification
      const pendingData: RegisterFormValues = {
        fullName: regValues.fullName.trim(),
        institutionName: regValues.institutionName.trim(),
        email: cleanEmail,
        password: regValues.password,
        confirmPassword: regValues.confirmPassword,
      };
      setPendingRegistration(pendingData);
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem("teacher_portal_pending_reg", JSON.stringify(pendingData));
        } catch {}
      }

      // Clear any registration errors and advance to "Verify your email" page
      setRegErrors({});
      navigateTo("register_otp");
    } catch {
      setRegErrors({ general: "Registration failed. Please check your inputs and try again." });
    } finally {
      setIsRegLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // 3. Forgot Password Flow State (Recover -> OTP -> New Password)
  // --------------------------------------------------------------------------
  // Step 1: Recover Email
  const [recoverEmail, setRecoverEmail] = useState("");
  const [recoverEmailError, setRecoverEmailError] = useState<string | undefined>();
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);

  // Step 2 & 3: New Password Reset State
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [resetErrors, setResetErrors] = useState<{ password?: string; confirm?: string }>({});
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);

  const newPasswordStrength = getPasswordStrength(newPassword);

  // Handle checking email in database
  const handleRecoverEmailSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const cleanEmail = recoverEmail.trim().toLowerCase();

    if (!cleanEmail) {
      setRecoverEmailError("Email address is required.");
      return;
    }
    if (!EMAIL_REGEX.test(cleanEmail)) {
      setRecoverEmailError("Please enter a valid email address.");
      return;
    }

    setRecoverEmailError(undefined);
    setIsCheckingEmail(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Check if email exists in teacher database
      const exists = isEmailRegisteredInDatabase(cleanEmail) || teacherDatabase.includes(cleanEmail);

      if (!exists) {
        setRecoverEmailError(
          "No teacher portal account found for this email. Please check your spelling or register."
        );
        return;
      }

      // Found in database! Transition to OTP view
      navigateTo("forgot_otp");
    } catch {
      setRecoverEmailError("Database verification failed. Please try again.");
    } finally {
      setIsCheckingEmail(false);
    }
  };

  // Handle Final Password Recovery Submit
  const handleResetSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const errs: { password?: string; confirm?: string } = {};

    if (!newPassword) {
      errs.password = "New password is required.";
    } else if (newPassword.length < MIN_PASSWORD_LENGTH) {
      errs.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }

    if (!confirmNewPassword) {
      errs.confirm = "Please confirm your new password.";
    } else if (confirmNewPassword !== newPassword) {
      errs.confirm = "Passwords do not match.";
    }

    if (Object.keys(errs).length > 0) {
      setResetErrors(errs);
      return;
    }

    setResetErrors({});
    setIsRecovering(true);

    try {
      const cleanEmail = recoverEmail.trim().toLowerCase();

      // Update password in persistent database and file
      const updated = updateUserPasswordInDatabase(cleanEmail, newPassword);
      if (!updated) {
        setResetErrors({ password: "Could not locate account in database to update password." });
        setIsRecovering(false);
        return;
      }

      // Update in-memory database
      setTeacherDatabase(getDatabaseUsers().map((u) => u.email.toLowerCase()));

      // Pre-fill login email for seamless sign in
      setLoginValues({ email: cleanEmail, password: "", rememberMe: false });

      // Clear password reset fields
      setNewPassword("");
      setConfirmNewPassword("");
      setResetErrors({});

      // Set Welcome Sign-in notification
      setLoginNotice("Password reset successfully! Please sign in with your new password.");

      // As soon as new password is set, IMMEDIATELY navigate to the Welcome Sign In page
      navigateTo("login");
    } catch {
      setResetErrors({ password: "Could not reset password. Please try again." });
    } finally {
      setIsRecovering(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center bg-transparent px-4 py-8 sm:px-6 lg:px-8 font-sans antialiased text-zinc-900 dark:text-zinc-100 transition-colors selection:bg-slate-400/40 selection:text-white">
      {/* Dark Academic Wallpaper & Glowing Neon Mathematical Formulas Layer */}
      <AcademicBackground />

      {/* Theme Changing Button (Water Dewdrop Pill) */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-10">
        <button
          type="button"
          onClick={() => setIsDark(!isDark)}
          onMouseDown={handleWaterRipple}
          aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
          className="relative group flex items-center gap-2 px-4 py-2 rounded-full water-dewdrop-pill text-xs font-medium text-white shadow-lg cursor-pointer transition-all"
        >
          <div className="absolute -inset-0.5 rounded-full button-streak-overlay blur-sm opacity-0 group-hover:opacity-100 transition-opacity" />
          <span className="relative z-20 flex items-center gap-1.5 text-white">
            {isDark ? (
              <>
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span className="text-white">Light</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
                <span className="text-white">Dark</span>
              </>
            )}
          </span>
        </button>
      </div>

      {/* 3D Perspective Scene Container for Cinematic Spatial Transitions */}
      <div className="relative z-10 w-full flex justify-center perspective-spatial-container">
        <div className={`w-full flex justify-center ${panelAnimClass}`}>
          {/* ==================================================================== */}
          {/* 1. LOGIN PAGE VIEW                                                   */}
          {/* ==================================================================== */}
          {view === "login" && (
        <div className="relative z-10 w-full max-w-md">
          <main className="relative w-full login-card glass-panel glass-gradient-border glass-specular-top rounded-3xl p-7 sm:p-9 transition-all">
            <header className="flex flex-col items-center text-center mb-8">
              <LogoBadge />
              <h1 className="text-[25px] sm:text-[27px] tracking-normal bright-heading">
                Welcome back
              </h1>
            </header>

            {loginNotice && (
              <div
                role="status"
                className="mb-6 p-4 rounded-2xl water-dewdrop-pill border border-emerald-400/50 text-emerald-200 text-sm flex items-center gap-2.5 shadow-sm font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
              >
                <svg className="w-5 h-5 flex-shrink-0 text-emerald-300" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5z" clipRule="evenodd" />
                </svg>
                <span>{loginNotice}</span>
              </div>
            )}

            {loginSuccess && (
              <div
                role="status"
                className="mb-6 p-4 rounded-2xl water-dewdrop-pill border border-emerald-400/50 text-emerald-200 text-sm flex items-center gap-2 font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
              >
                <svg className="w-5 h-5 flex-shrink-0 text-emerald-300" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5z" clipRule="evenodd" />
                </svg>
                <span>
                  {loggedInUser?.fullName
                    ? `Welcome back, ${loggedInUser.fullName}! Loading Teacher Portal...`
                    : "Welcome back! Accessing Teacher Portal..."}
                </span>
              </div>
            )}

            {loginErrors.general && (
              <div
                role="alert"
                className="mb-6 p-4 rounded-2xl water-dewdrop-pill border border-red-400/50 text-red-200 text-sm flex items-center gap-2 font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
              >
                <svg className="w-5 h-5 flex-shrink-0 text-red-300" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" clipRule="evenodd" />
                </svg>
                <span>{loginErrors.general}</span>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} noValidate className="space-y-5">
              {/* Email Bar */}
              <div>
                <label
                  htmlFor="email"
                  className="font-label block text-[13px] tracking-wide bright-label mb-2"
                >
                  Enter your e-mail
                </label>

                <div className="relative group">
                  <div
                    className={`absolute -inset-0.5 rounded-full blur-sm transition-all duration-300 pointer-events-none ${
                      loginErrors.email
                        ? "bg-red-500/30 opacity-70"
                        : "opacity-0"
                    }`}
                    aria-hidden="true"
                  />

                  <div className="relative glass-input-wrapper">
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      spellCheck={false}
                      onBlur={(e) => {
                        e.currentTarget.scrollLeft = 0;
                      }}
                      required
                      disabled={isLoginLoading}
                      value={loginValues.email}
                      onChange={(e) => setLoginValues((prev) => ({ ...prev, email: e.target.value }))}
                      aria-invalid={Boolean(loginErrors.email)}
                      aria-describedby={loginErrors.email ? "email-error" : undefined}
                      className={`w-full px-5 py-3 rounded-full text-[14px] outline-none glass-input-box text-white disabled:opacity-60 disabled:cursor-not-allowed ${
                        loginErrors.email
                          ? "!text-red-200"
                          : ""
                      }`}
                    />
                  </div>
                </div>

                {loginErrors.email && (
                  <p id="email-error" role="alert" className="mt-1.5 text-xs text-red-400 font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    {loginErrors.email}
                  </p>
                )}
              </div>

              {/* Password Bar */}
              <div>
                <label
                  htmlFor="password"
                  className="font-label block text-[13px] tracking-wide bright-label mb-2"
                >
                  Password
                </label>

                <div className="relative group">
                  <div
                    className={`absolute -inset-0.5 rounded-full blur-sm transition-all duration-300 pointer-events-none ${
                      loginErrors.password
                        ? "bg-red-500/30 opacity-70"
                        : "opacity-0"
                    }`}
                    aria-hidden="true"
                  />

                  <div className="relative glass-input-wrapper">
                    <input
                      id="password"
                      name="password"
                      type={showLoginPassword ? "text" : "password"}
                      autoComplete="current-password"
                      spellCheck={false}
                      onBlur={(e) => {
                        e.currentTarget.scrollLeft = 0;
                      }}
                      required
                      disabled={isLoginLoading}
                      value={loginValues.password}
                      onChange={(e) => setLoginValues((prev) => ({ ...prev, password: e.target.value }))}
                      aria-invalid={Boolean(loginErrors.password)}
                      aria-describedby={loginErrors.password ? "password-error" : undefined}
                      className={`w-full pl-5 pr-12 py-3 rounded-full text-[14px] outline-none glass-input-box text-white disabled:opacity-60 disabled:cursor-not-allowed ${
                        loginErrors.password
                          ? "!text-red-200"
                          : ""
                      }`}
                    />
                    <button
                      type="button"
                      tabIndex={0}
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      disabled={isLoginLoading}
                      aria-label={showLoginPassword ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-zinc-300 hover:text-slate-100 transition-colors focus:outline-none focus:text-white"
                    >
                      {showLoginPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {loginErrors.password && (
                  <p id="password-error" role="alert" className="mt-1.5 text-xs text-red-400 font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    {loginErrors.password}
                  </p>
                )}
              </div>

              {/* Remember Me & Forgot Password Button */}
              <div className="flex items-center justify-between text-[13px]">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    name="rememberMe"
                    checked={loginValues.rememberMe}
                    onChange={(e) => setLoginValues((prev) => ({ ...prev, rememberMe: e.target.checked }))}
                    disabled={isLoginLoading}
                    className="glass-checkbox disabled:cursor-not-allowed"
                  />
                  <span className="bright-body text-[13px]">
                    Remember me
                  </span>
                </label>

                {/* Click Forgot Password triggers recovery flow */}
                <button
                  type="button"
                  onClick={() => navigateTo("forgot_email")}
                  className="text-[13px] bright-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 rounded cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>

              {/* Submit Button Bar: "Access Teacher Portal" */}
              <div className="relative pt-1">
                <button
                  type="submit"
                  disabled={isLoginLoading}
                  onMouseDown={handleWaterRipple}
                  className="relative group w-full flex items-center justify-center py-3.5 px-4 rounded-full water-dewdrop-pill text-[14px] font-medium text-white shadow-lg cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div
                    className="absolute -inset-0.5 rounded-full button-streak-overlay blur-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                    aria-hidden="true"
                  />
                  <span className="relative z-20 flex items-center justify-center gap-2 text-white">
                    {isLoginLoading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>Signing in to portal...</span>
                      </>
                    ) : (
                      "Access Teacher Portal"
                    )}
                  </span>
                </button>
              </div>
            </form>

            {/* Footer */}
            <footer className="mt-8 text-center text-[13px] bright-body">
              Need a new teacher account?{" "}
              <button
                type="button"
                onClick={() => navigateTo("register")}
                className="bright-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 rounded cursor-pointer"
              >
                Register
              </button>
            </footer>
          </main>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. REGISTER PAGE VIEW                                                */}
      {/* ==================================================================== */}
      {view === "register" && (
        <div className="relative z-10 w-full max-w-lg">
          <main className="relative w-full login-card glass-panel glass-gradient-border glass-specular-top rounded-3xl p-7 sm:p-9 transition-all">
            <header className="flex flex-col items-center text-center mb-7">
              <LogoBadge />
              <h1 className="text-[26px] sm:text-[28px] tracking-normal bright-heading">
                Register
              </h1>
            </header>

            {regErrors.general && (
              <div
                role="alert"
                className="mb-6 p-4 rounded-2xl water-dewdrop-pill border border-red-400/50 text-red-200 text-[14px] flex items-center gap-2 font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
              >
                <svg className="w-5 h-5 flex-shrink-0 text-red-300" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" clipRule="evenodd" />
                </svg>
                <span>{regErrors.general}</span>
              </div>
            )}

            <form onSubmit={handleRegSubmit} noValidate className="space-y-4">
              {/* Field 1: Enter Your Full Name */}
              <div>
                <label
                  htmlFor="reg-fullName"
                  className="font-label block text-[14px] tracking-wide bright-label mb-1.5"
                >
                  Enter Your Full Name
                </label>

                <div className="relative group">
                  <div
                    className={`absolute -inset-0.5 rounded-full blur-sm transition-all duration-300 pointer-events-none ${
                      regErrors.fullName
                        ? "bg-red-500/30 opacity-70"
                        : "opacity-0"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="relative glass-input-wrapper">
                    <input
                      id="reg-fullName"
                      name="fullName"
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      required
                      disabled={isRegLoading}
                      value={regValues.fullName}
                      onChange={(e) => setRegValues((prev) => ({ ...prev, fullName: e.target.value }))}
                      onBlur={(e) => { e.currentTarget.scrollLeft = 0; }}
                      className="w-full px-5 py-3 rounded-full text-[14px] outline-none glass-input-box text-white disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
                {regErrors.fullName && (
                  <p role="alert" className="mt-1.5 text-[13px] text-red-400 font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    {regErrors.fullName}
                  </p>
                )}
              </div>

              {/* Field 2: Enter Institution Name: */}
              <div>
                <label
                  htmlFor="reg-institutionName"
                  className="font-label block text-[14px] tracking-wide bright-label mb-1.5"
                >
                  Enter Institution Name:
                </label>

                <div className="relative group">
                  <div
                    className={`absolute -inset-0.5 rounded-full blur-sm transition-all duration-300 pointer-events-none ${
                      regErrors.institutionName
                        ? "bg-red-500/30 opacity-70"
                        : "opacity-0"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="relative glass-input-wrapper">
                    <input
                      id="reg-institutionName"
                      name="institutionName"
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      required
                      disabled={isRegLoading}
                      value={regValues.institutionName}
                      onChange={(e) => setRegValues((prev) => ({ ...prev, institutionName: e.target.value }))}
                      onBlur={(e) => { e.currentTarget.scrollLeft = 0; }}
                      className="w-full px-5 py-3 rounded-full text-[14px] outline-none glass-input-box text-white disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
                {regErrors.institutionName && (
                  <p role="alert" className="mt-1.5 text-[13px] text-red-400 font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    {regErrors.institutionName}
                  </p>
                )}
              </div>

              {/* Field 3: Enter Institution/Personal Mail */}
              <div>
                <label
                  htmlFor="reg-email"
                  className="font-label block text-[14px] tracking-wide bright-label mb-1.5"
                >
                  Enter Institution/Personal Mail
                </label>

                <div className="relative group">
                  <div
                    className={`absolute -inset-0.5 rounded-full blur-sm transition-all duration-300 pointer-events-none ${
                      regErrors.email
                        ? "bg-red-500/30 opacity-70"
                        : "opacity-0"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="relative glass-input-wrapper">
                    <input
                      id="reg-email"
                      name="email"
                      type="email"
                      autoComplete="off"
                      spellCheck={false}
                      required
                      disabled={isRegLoading}
                      value={regValues.email}
                      onChange={(e) => setRegValues((prev) => ({ ...prev, email: e.target.value }))}
                      onBlur={(e) => { e.currentTarget.scrollLeft = 0; }}
                      className="w-full px-5 py-3 rounded-full text-[14px] outline-none glass-input-box text-white disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
                {regErrors.email && (
                  <p role="alert" className="mt-1.5 text-[13px] text-red-400 font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    {regErrors.email}
                  </p>
                )}
              </div>

              {/* Field 4: Enter Password */}
              <div>
                <label
                  htmlFor="reg-password"
                  className="font-label block text-[14px] tracking-wide bright-label mb-1.5"
                >
                  Enter Password
                </label>

                <div className="relative group">
                  <div
                    className={`absolute -inset-0.5 rounded-full blur-sm transition-all duration-300 pointer-events-none ${
                      regErrors.password
                        ? "bg-red-500/30 opacity-70"
                        : "opacity-0"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="relative glass-input-wrapper">
                    <input
                      id="reg-password"
                      name="password"
                      type={showRegPassword ? "text" : "password"}
                      autoComplete="new-password"
                      spellCheck={false}
                      onBlur={(e) => {
                        e.currentTarget.scrollLeft = 0;
                      }}
                      required
                      disabled={isRegLoading}
                      value={regValues.password}
                      onChange={(e) => setRegValues((prev) => ({ ...prev, password: e.target.value }))}
                      className="w-full pl-5 pr-12 py-3 rounded-full text-[14px] outline-none glass-input-box text-white disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    <button
                      type="button"
                      tabIndex={0}
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      disabled={isRegLoading}
                      aria-label={showRegPassword ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-zinc-300 hover:text-slate-100 transition-colors focus:outline-none focus:text-white"
                    >
                      {showRegPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {regValues.password.length > 0 && (
                  <div className="mt-2 space-y-1 transition-all">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="bright-body text-[13px]">Password strength</span>
                      <span className="font-semibold text-[#ff66c4] drop-shadow-[0_0_8px_rgba(255,102,196,0.9)]">
                        {regPasswordStrength.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[1, 2, 3, 4].map((step) => {
                        const isActive = regPasswordStrength.score >= step;
                        return (
                          <div key={step} className="relative h-1.5 rounded-full overflow-hidden bg-white/20">
                            {isActive && (
                              <div className="h-full w-full rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-500 shadow-[0_0_8px_rgba(217,70,239,0.9)] transition-all duration-300" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {regErrors.password && (
                  <p role="alert" className="mt-1.5 text-[13px] text-red-400 font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    {regErrors.password}
                  </p>
                )}
              </div>

              {/* Field 5: Enter Password Again */}
              <div>
                <label
                  htmlFor="reg-confirmPassword"
                  className="font-label block text-[14px] tracking-wide bright-label mb-1.5"
                >
                  Enter Password Again
                </label>

                <div className="relative group">
                  <div
                    className={`absolute -inset-0.5 rounded-full blur-sm transition-all duration-300 pointer-events-none ${
                      regErrors.confirmPassword
                        ? "bg-red-500/30 opacity-70"
                        : "opacity-0"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="relative glass-input-wrapper">
                    <input
                      id="reg-confirmPassword"
                      name="confirmPassword"
                      type={showRegConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      spellCheck={false}
                      onBlur={(e) => {
                        e.currentTarget.scrollLeft = 0;
                      }}
                      required
                      disabled={isRegLoading}
                      value={regValues.confirmPassword}
                      onChange={(e) => setRegValues((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                      className="w-full pl-5 pr-12 py-3 rounded-full text-[14px] outline-none glass-input-box text-white disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    <button
                      type="button"
                      tabIndex={0}
                      onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                      disabled={isRegLoading}
                      aria-label={showRegConfirmPassword ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-zinc-300 hover:text-slate-100 transition-colors focus:outline-none focus:text-white"
                    >
                      {showRegConfirmPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                {regErrors.confirmPassword && (
                  <p role="alert" className="mt-1.5 text-[13px] text-red-400 font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    {regErrors.confirmPassword}
                  </p>
                )}
              </div>

              {/* Submit Button Bar: "Register" */}
              <div className="relative pt-3">
                <button
                  type="submit"
                  disabled={isRegLoading}
                  onMouseDown={handleWaterRipple}
                  className="relative group w-full flex items-center justify-center py-3.5 px-4 rounded-full water-dewdrop-pill text-[15px] font-medium text-white shadow-lg cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div
                    className="absolute -inset-0.5 rounded-full button-streak-overlay blur-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                    aria-hidden="true"
                  />
                  <span className="relative z-20 flex items-center justify-center gap-2 text-white">
                    {isRegLoading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>Creating teacher account...</span>
                      </>
                    ) : (
                      "Register"
                    )}
                  </span>
                </button>
              </div>
            </form>

            <footer className="mt-7 text-center text-[14px] bright-body">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => navigateTo("login")}
                className="bright-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 rounded cursor-pointer"
              >
                Access teacher portal
              </button>
            </footer>
          </main>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2b. REGISTER STEP 2: "Verify your email" (Email Verification Page)     */}
      {/* ==================================================================== */}
      {view === "register_otp" && (
        (pendingRegistration?.email || regValues.email) ? (
          <OtpVerification
            email={(pendingRegistration?.email || regValues.email).trim().toLowerCase()}
            title="Verify your email"
            subtitle="Check your email and put down the OTP"
            showStaggeredDots={false}
            purpose="register"
            renderLogo={() => <LogoBadge />}
            onSuccess={() => {
              const dataToSave =
                pendingRegistration ||
                (regValues.email ? regValues : null) ||
                (() => {
                  if (typeof window !== "undefined") {
                    try {
                      const saved = sessionStorage.getItem("teacher_portal_pending_reg");
                      if (saved) return JSON.parse(saved);
                    } catch {}
                  }
                  return null;
                })();

              if (dataToSave && dataToSave.email) {
                const registeredName = dataToSave.fullName.trim();
                const userEmail = dataToSave.email.trim().toLowerCase();

                // Save newly verified teacher WITH password to database and persistent file
                saveUserToDatabase({
                  fullName: registeredName,
                  email: userEmail,
                  institutionName: dataToSave.institutionName.trim(),
                  password: dataToSave.password,
                });

                // Update in-memory database
                setTeacherDatabase(getDatabaseUsers().map((u) => u.email.toLowerCase()));

                // Pre-fill login email for convenience so user immediately sees their verified email
                setLoginValues({ email: userEmail, password: "", rememberMe: false });

                // Set Welcome Sign-in notification on login card
                setLoginNotice(
                  `Email verified & account registered successfully! Welcome, ${registeredName || "Teacher"}. Please enter your password to sign in.`
                );

                if (typeof window !== "undefined") {
                  try {
                    sessionStorage.removeItem("teacher_portal_pending_reg");
                    sessionStorage.removeItem("teacher_portal_active_otp");
                  } catch {}
                }
              }

              // Immediately bring user to the very first login page with 3D entry
              navigateTo("login", true, true);

              // Clean up registration state now that login page is active
              setPendingRegistration(null);
              setRegValues({
                fullName: "",
                institutionName: "",
                email: "",
                password: "",
                confirmPassword: "",
              });
              setRegErrors({});
            }}
            onCancel={() => navigateTo("register")}
          />
        ) : (
          <EmptyOtpFallback onRedirect={() => navigateTo("login", true, true)} />
        )
      )}

      {/* ==================================================================== */}
      {/* 3. FORGOT PASSWORD STEP 1: "Recover Your Portal"                      */}
      {/* ==================================================================== */}
      {view === "forgot_email" && (
        <div className="relative z-10 w-full max-w-md">
          <main className="relative w-full login-card glass-panel glass-gradient-border glass-specular-top rounded-3xl p-7 sm:p-9 transition-all">
            <header className="flex flex-col items-center text-center mb-7">
              <LogoBadge />
              <h1 className="text-[25px] sm:text-[27px] tracking-normal bright-heading">
                Recover Your Portal
              </h1>
              <p className="mt-1.5 text-xs bright-body">
                Enter your registered email address to check our database and receive an OTP.
              </p>
            </header>

            <form onSubmit={handleRecoverEmailSubmit} noValidate className="space-y-5">
              {/* Field: "Enter Your E-mail" */}
              <div>
                <label
                  htmlFor="recover-email"
                  className="font-label block text-[13px] tracking-wide bright-label mb-2"
                >
                  Enter Your E-mail
                </label>

                <div className="relative group">
                  <div
                    className={`absolute -inset-0.5 rounded-full blur-sm transition-all duration-300 pointer-events-none ${
                      recoverEmailError
                        ? "bg-red-500/30 opacity-70"
                        : "opacity-0"
                    }`}
                    aria-hidden="true"
                  />

                  <div className="relative glass-input-wrapper">
                    <input
                      id="recover-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      spellCheck={false}
                      onBlur={(e) => {
                        e.currentTarget.scrollLeft = 0;
                      }}
                      required
                      disabled={isCheckingEmail}
                      value={recoverEmail}
                      onChange={(e) => {
                        setRecoverEmail(e.target.value);
                        if (recoverEmailError) setRecoverEmailError(undefined);
                      }}
                      className="w-full px-5 py-3 rounded-full text-[14px] outline-none glass-input-box text-white disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                {recoverEmailError && (
                  <p role="alert" className="mt-1.5 text-xs text-red-400 font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    {recoverEmailError}
                  </p>
                )}
              </div>

              {/* Submit Button Bar */}
              <div className="relative pt-1">
                <button
                  type="submit"
                  disabled={isCheckingEmail}
                  onMouseDown={handleWaterRipple}
                  className="relative group w-full flex items-center justify-center py-3.5 px-4 rounded-full water-dewdrop-pill text-[14px] font-medium text-white shadow-lg cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div
                    className="absolute -inset-0.5 rounded-full button-streak-overlay blur-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                    aria-hidden="true"
                  />
                  <span className="relative z-20 flex items-center justify-center gap-2 text-white">
                    {isCheckingEmail ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>Checking database...</span>
                      </>
                    ) : (
                      "Verify Account & Send OTP"
                    )}
                  </span>
                </button>
              </div>
            </form>

            <footer className="mt-7 text-center text-[13px] bright-body">
              Remembered your credentials?{" "}
              <button
                type="button"
                onClick={() => navigateTo("login")}
                className="bright-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 rounded cursor-pointer"
              >
                Sign in
              </button>
            </footer>
          </main>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4. FORGOT PASSWORD STEP 2: "Please Wait....." (OTP Verification)      */}
      {/* ==================================================================== */}
      {view === "forgot_otp" && (
        <OtpVerification
          email={recoverEmail}
          title="Please Wait"
          subtitle="Check your email and put down the OTP"
          showStaggeredDots={true}
          purpose="forgot"
          renderLogo={() => <LogoBadge />}
          onSuccess={() => {
            navigateTo("forgot_reset");
            setNewPassword("");
            setConfirmNewPassword("");
            setResetErrors({});
          }}
          onCancel={() => navigateTo("login")}
        />
      )}

      {/* ==================================================================== */}
      {/* 5. FORGOT PASSWORD STEP 3: "Welcome Back" (Reset Password)            */}
      {/* ==================================================================== */}
      {view === "forgot_reset" && (
        <div className="relative z-10 w-full max-w-md">
          <main className="relative w-full login-card glass-panel glass-gradient-border glass-specular-top rounded-3xl p-7 sm:p-9 transition-all">
            <header className="flex flex-col items-center text-center mb-7">
              <LogoBadge />
              {/* Required Heading: "Welcome Back" */}
              <h1 className="text-[25px] sm:text-[27px] tracking-normal bright-heading">
                Welcome Back
              </h1>
              <p className="mt-1.5 text-xs bright-body">
                Create a strong new password to secure your teacher workspace.
              </p>
            </header>

            <form onSubmit={handleResetSubmit} noValidate className="space-y-5">
              {/* Field 1: "Enter New password" */}
              <div>
                <label
                  htmlFor="new-password"
                  className="font-label block text-[13px] tracking-wide bright-label mb-2"
                >
                  Enter New password
                </label>

                <div className="relative group">
                  <div
                    className={`absolute -inset-0.5 rounded-full blur-sm transition-all duration-300 pointer-events-none ${
                      resetErrors.password
                        ? "bg-red-500/30 opacity-70"
                        : "opacity-0"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="relative glass-input-wrapper">
                    <input
                      id="new-password"
                      name="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      autoComplete="new-password"
                      spellCheck={false}
                      onBlur={(e) => {
                        e.currentTarget.scrollLeft = 0;
                      }}
                      required
                      disabled={isRecovering}
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        if (resetErrors.password) setResetErrors((prev) => ({ ...prev, password: undefined }));
                      }}
                      className="w-full pl-5 pr-12 py-3 rounded-full text-[14px] outline-none glass-input-box text-white disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    <button
                      type="button"
                      tabIndex={0}
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      disabled={isRecovering}
                      aria-label={showNewPassword ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-zinc-300 hover:text-slate-100 transition-colors focus:outline-none focus:text-white"
                    >
                      {showNewPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {newPassword.length > 0 && (
                  <div className="mt-2 space-y-1 transition-all">
                    <div className="flex items-center justify-between text-xs">
                      <span className="bright-body text-xs">Password strength</span>
                      <span className="font-semibold text-[#ff66c4] drop-shadow-[0_0_8px_rgba(255,102,196,0.9)]">
                        {newPasswordStrength.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[1, 2, 3, 4].map((step) => {
                        const isActive = newPasswordStrength.score >= step;
                        return (
                          <div key={step} className="relative h-1.5 rounded-full overflow-hidden bg-white/20">
                            {isActive && (
                              <div className="h-full w-full rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-500 shadow-[0_0_8px_rgba(217,70,239,0.9)] transition-all duration-300" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {resetErrors.password && (
                  <p role="alert" className="mt-1.5 text-xs text-red-400 font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    {resetErrors.password}
                  </p>
                )}
              </div>

              {/* Field 2: "Enter your password again" */}
              <div>
                <label
                  htmlFor="confirm-new-password"
                  className="font-label block text-[13px] tracking-wide bright-label mb-2"
                >
                  Enter your password again
                </label>

                <div className="relative group">
                  <div
                    className={`absolute -inset-0.5 rounded-full blur-sm transition-all duration-300 pointer-events-none ${
                      resetErrors.confirm
                        ? "bg-red-500/30 opacity-70"
                        : "opacity-0"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="relative glass-input-wrapper">
                    <input
                      id="confirm-new-password"
                      name="confirmNewPassword"
                      type={showConfirmNewPassword ? "text" : "password"}
                      autoComplete="new-password"
                      spellCheck={false}
                      onBlur={(e) => {
                        e.currentTarget.scrollLeft = 0;
                      }}
                      required
                      disabled={isRecovering}
                      value={confirmNewPassword}
                      onChange={(e) => {
                        setConfirmNewPassword(e.target.value);
                        if (resetErrors.confirm) setResetErrors((prev) => ({ ...prev, confirm: undefined }));
                      }}
                      className="w-full pl-5 pr-12 py-3 rounded-full text-[14px] outline-none glass-input-box text-white disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    <button
                      type="button"
                      tabIndex={0}
                      onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                      disabled={isRecovering}
                      aria-label={showConfirmNewPassword ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-zinc-300 hover:text-slate-100 transition-colors focus:outline-none focus:text-white"
                    >
                      {showConfirmNewPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {resetErrors.confirm && (
                  <p role="alert" className="mt-1.5 text-xs text-red-400 font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    {resetErrors.confirm}
                  </p>
                )}
              </div>

              {/* Action Button at Bottom Middle: "Recover" */}
              <div className="relative pt-2">
                <button
                  type="submit"
                  disabled={isRecovering}
                  onMouseDown={handleWaterRipple}
                  className="relative group w-full flex items-center justify-center py-3.5 px-4 rounded-full water-dewdrop-pill text-[14px] font-medium text-white shadow-lg cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div
                    className="absolute -inset-0.5 rounded-full button-streak-overlay blur-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                    aria-hidden="true"
                  />
                  <span className="relative z-20 flex items-center justify-center gap-2 text-white">
                    {isRecovering ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>Recovering password...</span>
                      </>
                    ) : (
                      "Recover"
                    )}
                  </span>
                </button>
              </div>
            </form>

            <footer className="mt-7 text-center text-[13px] bright-body">
              Back to portal?{" "}
              <button
                type="button"
                onClick={() => navigateTo("login")}
                className="bright-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 rounded cursor-pointer"
              >
                Sign in
              </button>
            </footer>
          </main>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 6. TEACHER PORTAL ACTIVE SESSION DASHBOARD VIEW                      */}
      {/* ==================================================================== */}
      {view === "portal" && (
        <div className="relative z-10 w-full max-w-lg">
          <main className="relative w-full login-card glass-panel glass-gradient-border glass-specular-top rounded-3xl p-7 sm:p-9 transition-all">
            <header className="flex flex-col items-center text-center mb-6">
              <LogoBadge />
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full water-dewdrop-pill border border-emerald-400/50 text-emerald-300 text-xs font-medium mb-3 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Teacher Session Active
              </div>
              <h1 className="text-[26px] sm:text-[28px] tracking-normal bright-heading">
                Teacher's Portal
              </h1>
              <p className="mt-1.5 text-sm bright-body">
                Welcome, <span className="text-white font-semibold drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]">{loggedInUser?.fullName || "Faculty Member"}</span>
              </p>
            </header>

            {/* Teacher Information Summary Card */}
            <div className="p-4 rounded-2xl glass-panel border border-white/20 mb-6 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300">Department / Institution:</span>
                <span className="text-white font-medium">{loggedInUser?.institutionName || "Faculty of Academics"}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300">Authenticated Email:</span>
                <span className="text-[#daaceb] font-mono font-medium drop-shadow-[0_0_6px_rgba(218,172,235,0.8)]">
                  {loggedInUser?.email || "verified.teacher@portal.edu"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300">Portal Security:</span>
                <span className="text-emerald-300 font-medium flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 text-emerald-300" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Verified Credentials
                </span>
              </div>
            </div>

            {/* Quick Workspace Modules */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="p-3.5 rounded-2xl glass-panel border border-white/15 hover:border-white/35 transition-all text-center">
                <div className="w-8 h-8 mx-auto mb-1.5 rounded-full water-dewdrop-pill flex items-center justify-center text-white text-xs">
                  📚
                </div>
                <div className="text-xs font-semibold text-white">Course Materials</div>
                <div className="text-[10px] text-zinc-300">Class Syllabi & Notes</div>
              </div>
              <div className="p-3.5 rounded-2xl glass-panel border border-white/15 hover:border-white/35 transition-all text-center">
                <div className="w-8 h-8 mx-auto mb-1.5 rounded-full water-dewdrop-pill flex items-center justify-center text-white text-xs">
                  📊
                </div>
                <div className="text-xs font-semibold text-white">Student Grades</div>
                <div className="text-[10px] text-zinc-300">Evaluation Records</div>
              </div>
            </div>

            {/* Sign Out Button (Returns to Login via 3D Transition) */}
            <div className="relative pt-1">
              <button
                type="button"
                onClick={() => {
                  setLoggedInUser(undefined);
                  setLoginSuccess(false);
                  navigateTo("login");
                }}
                onMouseDown={handleWaterRipple}
                className="relative group w-full flex items-center justify-center py-3.5 px-4 rounded-full water-dewdrop-pill text-[14px] font-medium text-white shadow-lg cursor-pointer transition-all"
              >
                <span className="relative z-20 flex items-center justify-center gap-2 text-white">
                  <span>Sign Out of Portal</span>
                </span>
              </button>
            </div>
          </main>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
