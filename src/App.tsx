import {
  useState,
  useEffect,
  type FormEvent,
} from "react";
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

// ============================================================================
// Types & Validation Helpers
// ============================================================================

type ViewMode = "login" | "register" | "forgot_email" | "forgot_otp" | "forgot_reset";

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
// Minimal Logo Component (White Badge with Pure White Backlit Halo)
// ============================================================================

function MinimalLogo({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="magentaGrad" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F472B6" />
          <stop offset="50%" stopColor="#D946EF" />
          <stop offset="100%" stopColor="#A21CAF" />
        </linearGradient>
        <linearGradient id="magentaSpark" x1="38" y1="16" x2="52" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FB7185" />
          <stop offset="100%" stopColor="#E11D48" />
        </linearGradient>
      </defs>

      {/* Left Folio: Study Materials & Syllabus Tracking */}
      <path
        d="M11 16C11 13.79 12.79 12 15 12H28C30.21 12 32 13.79 32 16V48C32 45.79 30.21 44 28 44H15C12.79 44 11 45.79 11 48V16Z"
        stroke="url(#magentaGrad)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Right Folio: Question Crafting */}
      <path
        d="M53 16C53 13.79 51.21 12 49 12H36C33.79 12 32 13.79 32 16V48C32 45.79 33.79 44 36 44H49C51.21 44 53 45.79 53 48V16Z"
        stroke="url(#magentaGrad)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Center Spine */}
      <line x1="32" y1="14" x2="32" y2="46" stroke="url(#magentaGrad)" strokeWidth="3" strokeLinecap="round" opacity="0.8" />

      {/* Syllabus Check-lines on Left Page */}
      <line x1="17" y1="21" x2="26" y2="21" stroke="#D946EF" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="17" y1="28" x2="26" y2="28" stroke="#D946EF" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="17" y1="35" x2="23" y2="35" stroke="#D946EF" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />

      {/* Question Mark on Right Page */}
      <path
        d="M39 21C39 18.79 40.79 17 43 17C45.21 17 47 18.79 47 21C47 23.2 45 24.5 43.5 25.8C44 26.3 44 27.2 44 28"
        stroke="url(#magentaSpark)"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="44" cy="34" r="1.8" fill="url(#magentaSpark)" />

      {/* Top Knowledge Beacon */}
      <circle cx="32" cy="7" r="2.5" fill="#F43F5E" />
    </svg>
  );
}

// Logo Badge with White Background and Pure White Backlit Glow
export function LogoBadge() {
  return (
    <div className="relative group/badge mb-4">
      {/* White backlit halo */}
      <div
        className="absolute -inset-2 rounded-2xl bg-white blur-xl opacity-75 dark:opacity-85 group-hover/badge:opacity-100 group-hover/badge:blur-2xl transition-all duration-300 shadow-[0_0_25px_rgba(255,255,255,0.7)]"
        aria-hidden="true"
      />
      {/* Solid white badge container */}
      <div className="relative h-16 w-16 rounded-2xl bg-white border border-zinc-200/90 dark:border-white/20 shadow-xl shadow-black/20 flex items-center justify-center p-2.5 transition-transform duration-200 group-hover/badge:scale-105">
        <MinimalLogo className="w-full h-full" />
      </div>
    </div>
  );
}

// ============================================================================
// Main Application Component
// ============================================================================

export default function App() {
  // Navigation State
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      if (hash === "#register") return "register";
      if (hash === "#forgot-password") return "forgot_email";
    }
    return "login";
  });

  // Database of Registered Teachers (Loaded from persistent database with itssrehann2324@gmail.com)
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

  // Sync with window.location.hash
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash === "#register") setView("register");
      else if (hash === "#forgot-password") setView("forgot_email");
      else if (hash === "#login" || hash === "" || hash === "#") setView("login");
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  // Update hash when view changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    const targetHash =
      view === "register"
        ? "#register"
        : view === "forgot_email"
        ? "#forgot-password"
        : "#login";
    if (window.location.hash !== targetHash) {
      window.history.replaceState(null, "", targetHash);
    }
  }, [view]);

  const navigateTo = (newView: ViewMode) => {
    setView(newView);
    if (newView !== "login") {
      setLoginNotice(undefined);
    }
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
  const [loginNotice, setLoginNotice] = useState<string | undefined>();

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
      // Prevent duplicate registration
      if (isEmailRegisteredInDatabase(cleanEmail)) {
        setRegErrors({
          email: "This email is already registered. Please sign in or use 'Forgot password?'.",
        });
        setIsRegLoading(false);
        return;
      }

      const registeredName = regValues.fullName.trim();

      // Save newly registered teacher WITH password to database and persistent file
      saveUserToDatabase({
        fullName: registeredName,
        email: cleanEmail,
        institutionName: regValues.institutionName.trim(),
        password: regValues.password,
      });

      // Update in-memory database
      setTeacherDatabase(getDatabaseUsers().map((u) => u.email.toLowerCase()));

      // Pre-fill login email for convenience
      setLoginValues({ email: cleanEmail, password: "", rememberMe: false });

      // Clear registration form fields
      setRegValues({
        fullName: "",
        institutionName: "",
        email: "",
        password: "",
        confirmPassword: "",
      });
      setRegErrors({});

      // Set Welcome Sign-in notification
      setLoginNotice(
        `Account registered successfully! Welcome, ${registeredName || "Teacher"}. Please enter your password to sign in.`
      );

      // As soon as registration is completed, IMMEDIATELY navigate to the Welcome Sign In page
      navigateTo("login");
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

      // Check if email exists in teacher database (including itssrehann2324@gmail.com)
      const exists = isEmailRegisteredInDatabase(cleanEmail) || teacherDatabase.includes(cleanEmail);

      if (!exists) {
        setRecoverEmailError(
          "No teacher portal account found for this email. Please check your spelling or register."
        );
        return;
      }

      // Found in database! Transition to OTP view
      setView("forgot_otp");
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
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center bg-slate-900/5 dark:bg-[#0b030e] px-4 py-8 sm:px-6 lg:px-8 font-sans antialiased text-zinc-900 dark:text-zinc-100 transition-colors selection:bg-fuchsia-500 selection:text-white">
      {/* Ambient Radial Magenta Lighting Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10" aria-hidden="true">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] h-[400px] bg-gradient-to-tr from-fuchsia-600/25 via-pink-500/20 to-rose-600/15 rounded-full blur-[140px]" />
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[560px] h-[300px] bg-gradient-to-r from-fuchsia-800/20 via-pink-600/15 to-rose-950/20 rounded-full blur-[130px]" />
      </div>

      {/* Theme Changing Button */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <button
          type="button"
          onClick={() => setIsDark(!isDark)}
          aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
          className="relative group flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-fuchsia-200/80 dark:border-fuchsia-800/60 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-fuchsia-600 dark:hover:text-fuchsia-300 shadow-sm transition-all"
        >
          <div className="absolute -inset-0.5 rounded-full bg-fuchsia-500/25 blur-sm opacity-0 group-hover:opacity-100 transition-opacity" />
          <span className="relative flex items-center gap-1.5">
            {isDark ? (
              <>
                <svg className="w-3.5 h-3.5 text-fuchsia-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span>Light</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-fuchsia-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
                <span>Dark</span>
              </>
            )}
          </span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* 1. LOGIN PAGE VIEW                                                   */}
      {/* ==================================================================== */}
      {view === "login" && (
        <div className="relative w-full max-w-md">
          {/* Soft Ambient Card Backlight (Magenta) */}
          <div
            className="absolute -inset-1.5 rounded-3xl bg-gradient-to-b from-fuchsia-500/25 via-pink-600/15 to-transparent blur-xl pointer-events-none"
            aria-hidden="true"
          />

          <main className="relative w-full bg-white/95 dark:bg-[#130616]/95 backdrop-blur-xl border border-fuchsia-200/60 dark:border-fuchsia-900/40 rounded-2xl shadow-2xl shadow-fuchsia-950/20 p-6 sm:p-8 transition-all">
            <header className="flex flex-col items-center text-center mb-8">
              <LogoBadge />
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                Welcome back
              </h1>
            </header>

            {loginNotice && (
              <div
                role="status"
                className="mb-6 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-700/60 text-emerald-850 dark:text-emerald-200 text-sm flex items-center gap-2.5 shadow-sm"
              >
                <svg className="w-5 h-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5z" clipRule="evenodd" />
                </svg>
                <span>{loginNotice}</span>
              </div>
            )}

            {loginSuccess && (
              <div
                role="status"
                className="mb-6 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-sm flex items-center gap-2"
              >
                <svg className="w-5 h-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
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
                className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 text-sm flex items-center gap-2"
              >
                <svg className="w-5 h-5 flex-shrink-0 text-red-600 dark:text-red-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" clipRule="evenodd" />
                </svg>
                <span>{loginErrors.general}</span>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} noValidate className="space-y-5">
              {/* Email Bar: "Enter you e-mail" */}
              <div>
                <label
                  htmlFor="email"
                  className="font-label block text-sm font-semibold tracking-wide text-zinc-800 dark:text-zinc-200 mb-1.5"
                >
                  Enter you e-mail
                </label>

                <div className="relative group">
                  <div
                    className={`absolute -inset-0.5 rounded-xl bg-gradient-to-r from-fuchsia-600 via-pink-500 to-rose-500 blur-md transition-all duration-300 pointer-events-none ${
                      loginErrors.email
                        ? "from-red-500 to-rose-600 opacity-60 blur-md"
                        : "opacity-30 group-hover:opacity-75 group-focus-within:opacity-100 group-focus-within:blur-lg"
                    }`}
                    aria-hidden="true"
                  />

                  <div className="relative">
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      disabled={isLoginLoading}
                      value={loginValues.email}
                      onChange={(e) => setLoginValues((prev) => ({ ...prev, email: e.target.value }))}
                      aria-invalid={Boolean(loginErrors.email)}
                      aria-describedby={loginErrors.email ? "email-error" : undefined}
                      className={`w-full px-4 py-2.5 rounded-lg border text-sm transition-all outline-none bg-white dark:bg-[#18081c] disabled:opacity-60 disabled:cursor-not-allowed ${
                        loginErrors.email
                          ? "border-red-500 text-red-900 dark:text-red-200 focus:ring-2 focus:ring-red-500/20"
                          : "border-fuchsia-200/70 dark:border-fuchsia-900/40 hover:border-fuchsia-400/80 dark:hover:border-fuchsia-600/70 focus:border-fuchsia-500 dark:focus:border-fuchsia-400 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-fuchsia-500/20"
                      }`}
                    />
                  </div>
                </div>

                {loginErrors.email && (
                  <p id="email-error" role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400 font-medium">
                    {loginErrors.email}
                  </p>
                )}
              </div>

              {/* Password Bar */}
              <div>
                <label
                  htmlFor="password"
                  className="font-label block text-sm font-semibold tracking-wide text-zinc-800 dark:text-zinc-200 mb-1.5"
                >
                  Password
                </label>

                <div className="relative group">
                  <div
                    className={`absolute -inset-0.5 rounded-xl bg-gradient-to-r from-fuchsia-600 via-pink-500 to-rose-500 blur-md transition-all duration-300 pointer-events-none ${
                      loginErrors.password
                        ? "from-red-500 to-rose-600 opacity-60 blur-md"
                        : "opacity-30 group-hover:opacity-75 group-focus-within:opacity-100 group-focus-within:blur-lg"
                    }`}
                    aria-hidden="true"
                  />

                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showLoginPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      disabled={isLoginLoading}
                      value={loginValues.password}
                      onChange={(e) => setLoginValues((prev) => ({ ...prev, password: e.target.value }))}
                      aria-invalid={Boolean(loginErrors.password)}
                      aria-describedby={loginErrors.password ? "password-error" : undefined}
                      className={`w-full pl-4 pr-11 py-2.5 rounded-lg border text-sm transition-all outline-none bg-white dark:bg-[#18081c] disabled:opacity-60 disabled:cursor-not-allowed ${
                        loginErrors.password
                          ? "border-red-500 text-red-900 dark:text-red-200 focus:ring-2 focus:ring-red-500/20"
                          : "border-fuchsia-200/70 dark:border-fuchsia-900/40 hover:border-fuchsia-400/80 dark:hover:border-fuchsia-600/70 focus:border-fuchsia-500 dark:focus:border-fuchsia-400 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-fuchsia-500/20"
                      }`}
                    />
                    <button
                      type="button"
                      tabIndex={0}
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      disabled={isLoginLoading}
                      aria-label={showLoginPassword ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-400 hover:text-fuchsia-600 dark:hover:text-fuchsia-300 transition-colors focus:outline-none focus:text-fuchsia-600 dark:focus:text-fuchsia-400"
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
                  <p id="password-error" role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400 font-medium">
                    {loginErrors.password}
                  </p>
                )}
              </div>

              {/* Remember Me & Forgot Password Button */}
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    name="rememberMe"
                    checked={loginValues.rememberMe}
                    onChange={(e) => setLoginValues((prev) => ({ ...prev, rememberMe: e.target.checked }))}
                    disabled={isLoginLoading}
                    className="w-4 h-4 rounded border-fuchsia-300 dark:border-fuchsia-900/60 text-fuchsia-600 focus:ring-fuchsia-500/30 dark:focus:ring-offset-zinc-900 cursor-pointer disabled:cursor-not-allowed accent-fuchsia-600"
                  />
                  <span className="text-zinc-600 dark:text-zinc-400 text-sm">
                    Remember me
                  </span>
                </label>

                {/* Click Forgot Password triggers recovery flow */}
                <button
                  type="button"
                  onClick={() => navigateTo("forgot_email")}
                  className="text-sm font-medium text-fuchsia-600 hover:text-fuchsia-500 dark:text-fuchsia-400 dark:hover:text-fuchsia-300 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500 rounded cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>

              {/* Submit Button Bar */}
              <div className="relative group pt-1">
                <div
                  className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-fuchsia-600 via-pink-500 to-rose-500 opacity-60 blur-md group-hover:opacity-100 group-hover:blur-lg transition-all duration-300 pointer-events-none"
                  aria-hidden="true"
                />

                <button
                  type="submit"
                  disabled={isLoginLoading}
                  className="relative w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-600 hover:from-fuchsia-500 hover:via-pink-500 hover:to-rose-500 active:from-fuchsia-700 active:to-rose-700 text-white font-medium text-sm transition-all duration-150 focus:outline-none focus-visible:ring-4 focus-visible:ring-fuchsia-500/40 disabled:opacity-70 disabled:cursor-not-allowed shadow-md shadow-fuchsia-950/30 active:scale-[0.99] cursor-pointer"
                >
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
                </button>
              </div>
            </form>

            {/* Footer */}
            <footer className="mt-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Need a new teacher account?{" "}
              <button
                type="button"
                onClick={() => navigateTo("register")}
                className="font-medium text-fuchsia-600 hover:text-fuchsia-500 dark:text-fuchsia-400 dark:hover:text-fuchsia-300 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500 rounded cursor-pointer"
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
        <div className="relative w-full max-w-lg">
          <div
            className="absolute -inset-1.5 rounded-3xl bg-gradient-to-b from-fuchsia-500/25 via-pink-600/15 to-transparent blur-xl pointer-events-none"
            aria-hidden="true"
          />

          <main className="relative w-full bg-white/95 dark:bg-[#130616]/95 backdrop-blur-xl border border-fuchsia-200/60 dark:border-fuchsia-900/40 rounded-2xl shadow-2xl shadow-fuchsia-950/20 p-6 sm:p-8 transition-all">
            <header className="flex flex-col items-center text-center mb-7">
              <LogoBadge />
              <h1 className="text-[25px] font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                Register
              </h1>
            </header>

            {regErrors.general && (
              <div
                role="alert"
                className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 text-[15px] flex items-center gap-2"
              >
                <svg className="w-5 h-5 flex-shrink-0 text-red-600 dark:text-red-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
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
                  className="font-label block text-[15px] font-semibold tracking-wide text-zinc-800 dark:text-zinc-200 mb-1.5"
                >
                  Enter Your Full Name
                </label>

                <div className="relative group">
                  <div
                    className={`absolute -inset-0.5 rounded-xl bg-gradient-to-r from-fuchsia-600 via-pink-500 to-rose-500 blur-md transition-all duration-300 pointer-events-none ${
                      regErrors.fullName
                        ? "from-red-500 to-rose-600 opacity-60 blur-md"
                        : "opacity-30 group-hover:opacity-75 group-focus-within:opacity-100 group-focus-within:blur-lg"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="relative">
                    <input
                      id="reg-fullName"
                      name="fullName"
                      type="text"
                      autoComplete="name"
                      required
                      disabled={isRegLoading}
                      value={regValues.fullName}
                      onChange={(e) => setRegValues((prev) => ({ ...prev, fullName: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-lg border text-[15px] transition-all outline-none bg-white dark:bg-[#18081c] border-fuchsia-200/70 dark:border-fuchsia-900/40 hover:border-fuchsia-400/80 dark:hover:border-fuchsia-600/70 focus:border-fuchsia-500 dark:focus:border-fuchsia-400 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-fuchsia-500/20"
                    />
                  </div>
                </div>
                {regErrors.fullName && (
                  <p role="alert" className="mt-1.5 text-[13px] text-red-600 dark:text-red-400 font-medium">
                    {regErrors.fullName}
                  </p>
                )}
              </div>

              {/* Field 2: Enter Institution Name: */}
              <div>
                <label
                  htmlFor="reg-institutionName"
                  className="font-label block text-[15px] font-semibold tracking-wide text-zinc-800 dark:text-zinc-200 mb-1.5"
                >
                  Enter Institution Name:
                </label>

                <div className="relative group">
                  <div
                    className={`absolute -inset-0.5 rounded-xl bg-gradient-to-r from-fuchsia-600 via-pink-500 to-rose-500 blur-md transition-all duration-300 pointer-events-none ${
                      regErrors.institutionName
                        ? "from-red-500 to-rose-600 opacity-60 blur-md"
                        : "opacity-30 group-hover:opacity-75 group-focus-within:opacity-100 group-focus-within:blur-lg"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="relative">
                    <input
                      id="reg-institutionName"
                      name="institutionName"
                      type="text"
                      autoComplete="organization"
                      required
                      disabled={isRegLoading}
                      value={regValues.institutionName}
                      onChange={(e) => setRegValues((prev) => ({ ...prev, institutionName: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-lg border text-[15px] transition-all outline-none bg-white dark:bg-[#18081c] border-fuchsia-200/70 dark:border-fuchsia-900/40 hover:border-fuchsia-400/80 dark:hover:border-fuchsia-600/70 focus:border-fuchsia-500 dark:focus:border-fuchsia-400 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-fuchsia-500/20"
                    />
                  </div>
                </div>
                {regErrors.institutionName && (
                  <p role="alert" className="mt-1.5 text-[13px] text-red-600 dark:text-red-400 font-medium">
                    {regErrors.institutionName}
                  </p>
                )}
              </div>

              {/* Field 3: Enter Institution/Personal Mail */}
              <div>
                <label
                  htmlFor="reg-email"
                  className="font-label block text-[15px] font-semibold tracking-wide text-zinc-800 dark:text-zinc-200 mb-1.5"
                >
                  Enter Institution/Personal Mail
                </label>

                <div className="relative group">
                  <div
                    className={`absolute -inset-0.5 rounded-xl bg-gradient-to-r from-fuchsia-600 via-pink-500 to-rose-500 blur-md transition-all duration-300 pointer-events-none ${
                      regErrors.email
                        ? "from-red-500 to-rose-600 opacity-60 blur-md"
                        : "opacity-30 group-hover:opacity-75 group-focus-within:opacity-100 group-focus-within:blur-lg"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="relative">
                    <input
                      id="reg-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      disabled={isRegLoading}
                      value={regValues.email}
                      onChange={(e) => setRegValues((prev) => ({ ...prev, email: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-lg border text-[15px] transition-all outline-none bg-white dark:bg-[#18081c] border-fuchsia-200/70 dark:border-fuchsia-900/40 hover:border-fuchsia-400/80 dark:hover:border-fuchsia-600/70 focus:border-fuchsia-500 dark:focus:border-fuchsia-400 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-fuchsia-500/20"
                    />
                  </div>
                </div>
                {regErrors.email && (
                  <p role="alert" className="mt-1.5 text-[13px] text-red-600 dark:text-red-400 font-medium">
                    {regErrors.email}
                  </p>
                )}
              </div>

              {/* Field 4: Enter Password */}
              <div>
                <label
                  htmlFor="reg-password"
                  className="font-label block text-[15px] font-semibold tracking-wide text-zinc-800 dark:text-zinc-200 mb-1.5"
                >
                  Enter Password
                </label>

                <div className="relative group">
                  <div
                    className={`absolute -inset-0.5 rounded-xl bg-gradient-to-r from-fuchsia-600 via-pink-500 to-rose-500 blur-md transition-all duration-300 pointer-events-none ${
                      regErrors.password
                        ? "from-red-500 to-rose-600 opacity-60 blur-md"
                        : "opacity-30 group-hover:opacity-75 group-focus-within:opacity-100 group-focus-within:blur-lg"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="relative">
                    <input
                      id="reg-password"
                      name="password"
                      type={showRegPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      disabled={isRegLoading}
                      value={regValues.password}
                      onChange={(e) => setRegValues((prev) => ({ ...prev, password: e.target.value }))}
                      className="w-full pl-4 pr-11 py-2.5 rounded-lg border text-[15px] transition-all outline-none bg-white dark:bg-[#18081c] border-fuchsia-200/70 dark:border-fuchsia-900/40 hover:border-fuchsia-400/80 dark:hover:border-fuchsia-600/70 focus:border-fuchsia-500 dark:focus:border-fuchsia-400 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-fuchsia-500/20"
                    />
                    <button
                      type="button"
                      tabIndex={0}
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      disabled={isRegLoading}
                      aria-label={showRegPassword ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-400 hover:text-fuchsia-600 dark:hover:text-fuchsia-300 transition-colors focus:outline-none focus:text-fuchsia-600 dark:focus:text-fuchsia-400"
                    >
                      {showRegPassword ? (
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

                {regValues.password.length > 0 && (
                  <div className="mt-2 space-y-1 transition-all">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-zinc-500 dark:text-zinc-400">Password strength</span>
                      <span className="font-medium text-fuchsia-600 dark:text-fuchsia-400">
                        {regPasswordStrength.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[1, 2, 3, 4].map((step) => {
                        const isActive = regPasswordStrength.score >= step;
                        return (
                          <div key={step} className="relative h-1.5 rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-800">
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
                  <p role="alert" className="mt-1.5 text-[13px] text-red-600 dark:text-red-400 font-medium">
                    {regErrors.password}
                  </p>
                )}
              </div>

              {/* Field 5: Enter Password Again */}
              <div>
                <label
                  htmlFor="reg-confirmPassword"
                  className="font-label block text-[15px] font-semibold tracking-wide text-zinc-800 dark:text-zinc-200 mb-1.5"
                >
                  Enter Password Again
                </label>

                <div className="relative group">
                  <div
                    className={`absolute -inset-0.5 rounded-xl bg-gradient-to-r from-fuchsia-600 via-pink-500 to-rose-500 blur-md transition-all duration-300 pointer-events-none ${
                      regErrors.confirmPassword
                        ? "from-red-500 to-rose-600 opacity-60 blur-md"
                        : "opacity-30 group-hover:opacity-75 group-focus-within:opacity-100 group-focus-within:blur-lg"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="relative">
                    <input
                      id="reg-confirmPassword"
                      name="confirmPassword"
                      type={showRegConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      disabled={isRegLoading}
                      value={regValues.confirmPassword}
                      onChange={(e) => setRegValues((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                      className="w-full pl-4 pr-11 py-2.5 rounded-lg border text-[15px] transition-all outline-none bg-white dark:bg-[#18081c] border-fuchsia-200/70 dark:border-fuchsia-900/40 hover:border-fuchsia-400/80 dark:hover:border-fuchsia-600/70 focus:border-fuchsia-500 dark:focus:border-fuchsia-400 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-fuchsia-500/20"
                    />
                    <button
                      type="button"
                      tabIndex={0}
                      onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                      disabled={isRegLoading}
                      aria-label={showRegConfirmPassword ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-400 hover:text-fuchsia-600 dark:hover:text-fuchsia-300 transition-colors focus:outline-none focus:text-fuchsia-600 dark:focus:text-fuchsia-400"
                    >
                      {showRegConfirmPassword ? (
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
                {regErrors.confirmPassword && (
                  <p role="alert" className="mt-1.5 text-[13px] text-red-600 dark:text-red-400 font-medium">
                    {regErrors.confirmPassword}
                  </p>
                )}
              </div>

              {/* Submit Button Bar: "Register" */}
              <div className="relative group pt-3">
                <div
                  className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-fuchsia-600 via-pink-500 to-rose-500 opacity-60 blur-md group-hover:opacity-100 group-hover:blur-lg transition-all duration-300 pointer-events-none"
                  aria-hidden="true"
                />

                <button
                  type="submit"
                  disabled={isRegLoading}
                  className="relative w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-600 hover:from-fuchsia-500 hover:via-pink-500 hover:to-rose-500 active:from-fuchsia-700 active:to-rose-700 text-white font-medium text-[15px] transition-all duration-150 focus:outline-none focus-visible:ring-4 focus-visible:ring-fuchsia-500/40 disabled:opacity-70 disabled:cursor-not-allowed shadow-md shadow-fuchsia-950/30 active:scale-[0.99] cursor-pointer"
                >
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
                </button>
              </div>
            </form>

            <footer className="mt-7 text-center text-[15px] text-zinc-500 dark:text-zinc-400">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => navigateTo("login")}
                className="font-medium text-fuchsia-600 hover:text-fuchsia-500 dark:text-fuchsia-400 dark:hover:text-fuchsia-300 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500 rounded cursor-pointer"
              >
                Sign in
              </button>
            </footer>
          </main>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 3. FORGOT PASSWORD STEP 1: "Recover Your Portal"                      */}
      {/* ==================================================================== */}
      {view === "forgot_email" && (
        <div className="relative w-full max-w-md">
          <div
            className="absolute -inset-1.5 rounded-3xl bg-gradient-to-b from-fuchsia-500/25 via-pink-600/15 to-transparent blur-xl pointer-events-none"
            aria-hidden="true"
          />

          <main className="relative w-full bg-white/95 dark:bg-[#130616]/95 backdrop-blur-xl border border-fuchsia-200/60 dark:border-fuchsia-900/40 rounded-2xl shadow-2xl shadow-fuchsia-950/20 p-6 sm:p-8 transition-all">
            <header className="flex flex-col items-center text-center mb-7">
              <LogoBadge />
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                Recover Your Portal
              </h1>
              <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                Enter your registered email address to check our database and receive an OTP.
              </p>
            </header>

            <form onSubmit={handleRecoverEmailSubmit} noValidate className="space-y-5">
              {/* Field: "Enter Your E-mail" */}
              <div>
                <label
                  htmlFor="recover-email"
                  className="font-label block text-sm font-semibold tracking-wide text-zinc-800 dark:text-zinc-200 mb-1.5"
                >
                  Enter Your E-mail
                </label>

                <div className="relative group">
                  <div
                    className={`absolute -inset-0.5 rounded-xl bg-gradient-to-r from-fuchsia-600 via-pink-500 to-rose-500 blur-md transition-all duration-300 pointer-events-none ${
                      recoverEmailError
                        ? "from-red-500 to-rose-600 opacity-60 blur-md"
                        : "opacity-30 group-hover:opacity-75 group-focus-within:opacity-100 group-focus-within:blur-lg"
                    }`}
                    aria-hidden="true"
                  />

                  <div className="relative">
                    <input
                      id="recover-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      disabled={isCheckingEmail}
                      value={recoverEmail}
                      onChange={(e) => {
                        setRecoverEmail(e.target.value);
                        if (recoverEmailError) setRecoverEmailError(undefined);
                      }}
                      className="w-full px-4 py-2.5 rounded-lg border text-sm transition-all outline-none bg-white dark:bg-[#18081c] border-fuchsia-200/70 dark:border-fuchsia-900/40 hover:border-fuchsia-400/80 dark:hover:border-fuchsia-600/70 focus:border-fuchsia-500 dark:focus:border-fuchsia-400 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-fuchsia-500/20"
                    />
                  </div>
                </div>

                {recoverEmailError && (
                  <p role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400 font-medium">
                    {recoverEmailError}
                  </p>
                )}
              </div>

              {/* Submit Button Bar */}
              <div className="relative group pt-1">
                <div
                  className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-fuchsia-600 via-pink-500 to-rose-500 opacity-60 blur-md group-hover:opacity-100 group-hover:blur-lg transition-all duration-300 pointer-events-none"
                  aria-hidden="true"
                />

                <button
                  type="submit"
                  disabled={isCheckingEmail}
                  className="relative w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-600 hover:from-fuchsia-500 hover:via-pink-500 hover:to-rose-500 active:from-fuchsia-700 active:to-rose-700 text-white font-medium text-sm transition-all duration-150 focus:outline-none focus-visible:ring-4 focus-visible:ring-fuchsia-500/40 disabled:opacity-70 disabled:cursor-not-allowed shadow-md shadow-fuchsia-950/30 active:scale-[0.99] cursor-pointer"
                >
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
                </button>
              </div>
            </form>

            <footer className="mt-7 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Remembered your credentials?{" "}
              <button
                type="button"
                onClick={() => navigateTo("login")}
                className="font-medium text-fuchsia-600 hover:text-fuchsia-500 dark:text-fuchsia-400 dark:hover:text-fuchsia-300 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500 rounded cursor-pointer"
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
          renderLogo={() => <LogoBadge />}
          onSuccess={() => {
            setView("forgot_reset");
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
        <div className="relative w-full max-w-md">
          <div
            className="absolute -inset-1.5 rounded-3xl bg-gradient-to-b from-fuchsia-500/25 via-pink-600/15 to-transparent blur-xl pointer-events-none"
            aria-hidden="true"
          />

          <main className="relative w-full bg-white/95 dark:bg-[#130616]/95 backdrop-blur-xl border border-fuchsia-200/60 dark:border-fuchsia-900/40 rounded-2xl shadow-2xl shadow-fuchsia-950/20 p-6 sm:p-8 transition-all">
            <header className="flex flex-col items-center text-center mb-7">
              <LogoBadge />
              {/* Required Heading: "Welcome Back" */}
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                Welcome Back
              </h1>
              <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                Create a strong new password to secure your teacher workspace.
              </p>
            </header>

            <form onSubmit={handleResetSubmit} noValidate className="space-y-5">
              {/* Field 1: "Enter New password" */}
              <div>
                <label
                  htmlFor="new-password"
                  className="font-label block text-sm font-semibold tracking-wide text-zinc-800 dark:text-zinc-200 mb-1.5"
                >
                  Enter New password
                </label>

                <div className="relative group">
                  <div
                    className={`absolute -inset-0.5 rounded-xl bg-gradient-to-r from-fuchsia-600 via-pink-500 to-rose-500 blur-md transition-all duration-300 pointer-events-none ${
                      resetErrors.password
                        ? "from-red-500 to-rose-600 opacity-60 blur-md"
                        : "opacity-30 group-hover:opacity-75 group-focus-within:opacity-100 group-focus-within:blur-lg"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="relative">
                    <input
                      id="new-password"
                      name="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      disabled={isRecovering}
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        if (resetErrors.password) setResetErrors((prev) => ({ ...prev, password: undefined }));
                      }}
                      className="w-full pl-4 pr-11 py-2.5 rounded-lg border text-sm transition-all outline-none bg-white dark:bg-[#18081c] border-fuchsia-200/70 dark:border-fuchsia-900/40 hover:border-fuchsia-400/80 dark:hover:border-fuchsia-600/70 focus:border-fuchsia-500 dark:focus:border-fuchsia-400 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-fuchsia-500/20"
                    />
                    <button
                      type="button"
                      tabIndex={0}
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      disabled={isRecovering}
                      aria-label={showNewPassword ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-400 hover:text-fuchsia-600 dark:hover:text-fuchsia-300 transition-colors focus:outline-none focus:text-fuchsia-600 dark:focus:text-fuchsia-400"
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
                      <span className="text-zinc-500 dark:text-zinc-400">Password strength</span>
                      <span className="font-medium text-fuchsia-600 dark:text-fuchsia-400">
                        {newPasswordStrength.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[1, 2, 3, 4].map((step) => {
                        const isActive = newPasswordStrength.score >= step;
                        return (
                          <div key={step} className="relative h-1.5 rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-800">
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
                  <p role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400 font-medium">
                    {resetErrors.password}
                  </p>
                )}
              </div>

              {/* Field 2: "Enter your password again" */}
              <div>
                <label
                  htmlFor="confirm-new-password"
                  className="font-label block text-sm font-semibold tracking-wide text-zinc-800 dark:text-zinc-200 mb-1.5"
                >
                  Enter your password again
                </label>

                <div className="relative group">
                  <div
                    className={`absolute -inset-0.5 rounded-xl bg-gradient-to-r from-fuchsia-600 via-pink-500 to-rose-500 blur-md transition-all duration-300 pointer-events-none ${
                      resetErrors.confirm
                        ? "from-red-500 to-rose-600 opacity-60 blur-md"
                        : "opacity-30 group-hover:opacity-75 group-focus-within:opacity-100 group-focus-within:blur-lg"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="relative">
                    <input
                      id="confirm-new-password"
                      name="confirmNewPassword"
                      type={showConfirmNewPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      disabled={isRecovering}
                      value={confirmNewPassword}
                      onChange={(e) => {
                        setConfirmNewPassword(e.target.value);
                        if (resetErrors.confirm) setResetErrors((prev) => ({ ...prev, confirm: undefined }));
                      }}
                      className="w-full pl-4 pr-11 py-2.5 rounded-lg border text-sm transition-all outline-none bg-white dark:bg-[#18081c] border-fuchsia-200/70 dark:border-fuchsia-900/40 hover:border-fuchsia-400/80 dark:hover:border-fuchsia-600/70 focus:border-fuchsia-500 dark:focus:border-fuchsia-400 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-fuchsia-500/20"
                    />
                    <button
                      type="button"
                      tabIndex={0}
                      onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                      disabled={isRecovering}
                      aria-label={showConfirmNewPassword ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-400 hover:text-fuchsia-600 dark:hover:text-fuchsia-300 transition-colors focus:outline-none focus:text-fuchsia-600 dark:focus:text-fuchsia-400"
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
                  <p role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400 font-medium">
                    {resetErrors.confirm}
                  </p>
                )}
              </div>

              {/* Action Button at Bottom Middle: "Recover" */}
              <div className="relative group pt-2">
                <div
                  className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-fuchsia-600 via-pink-500 to-rose-500 opacity-60 blur-md group-hover:opacity-100 group-hover:blur-lg transition-all duration-300 pointer-events-none"
                  aria-hidden="true"
                />

                <button
                  type="submit"
                  disabled={isRecovering}
                  className="relative w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-600 hover:from-fuchsia-500 hover:via-pink-500 hover:to-rose-500 active:from-fuchsia-700 active:to-rose-700 text-white font-medium text-sm transition-all duration-150 focus:outline-none focus-visible:ring-4 focus-visible:ring-fuchsia-500/40 disabled:opacity-70 disabled:cursor-not-allowed shadow-md shadow-fuchsia-950/30 active:scale-[0.99] cursor-pointer"
                >
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
                </button>
              </div>
            </form>

            <footer className="mt-7 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Back to portal?{" "}
              <button
                type="button"
                onClick={() => navigateTo("login")}
                className="font-medium text-fuchsia-600 hover:text-fuchsia-500 dark:text-fuchsia-400 dark:hover:text-fuchsia-300 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500 rounded cursor-pointer"
              >
                Sign in
              </button>
            </footer>
          </main>
        </div>
      )}
    </div>
  );
}
