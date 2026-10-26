// ============================================================================
// Teacher Portal Database Service
// Persistently stores teacher accounts
// Syncs with browser localStorage and the project database file via Vite API
// ============================================================================

export interface TeacherUser {
  id: string;
  fullName: string;
  email: string;
  institutionName: string;
  password?: string;
  role?: string;
  status?: string;
  createdAt?: string;
}

const STORAGE_KEY = "teacher_portal_database_v3";

// Initial seed database
export const INITIAL_DATABASE: TeacherUser[] = [];

/**
 * Returns all saved teacher users from persistent storage.
 */
export function getDatabaseUsers(): TeacherUser[] {
  if (typeof window === "undefined") return INITIAL_DATABASE;
  try {
    // Clean up older legacy storage if present
    localStorage.removeItem("teacher_portal_database_v2");

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_DATABASE));
      return INITIAL_DATABASE;
    }
    return JSON.parse(raw) as TeacherUser[];
  } catch {
    return INITIAL_DATABASE;
  }
}

/**
 * Checks if an email is registered in the database.
 */
export function isEmailRegisteredInDatabase(email: string): boolean {
  const clean = email.trim().toLowerCase();
  const users = getDatabaseUsers();
  return users.some((u) => u.email.toLowerCase() === clean);
}

/**
 * Returns a registered teacher user by email.
 */
export function getUserByEmail(email: string): TeacherUser | undefined {
  const clean = email.trim().toLowerCase();
  const users = getDatabaseUsers();
  return users.find((u) => u.email.toLowerCase() === clean);
}

export interface LoginVerificationResult {
  success: boolean;
  message?: string;
  user?: TeacherUser;
}

/**
 * Verifies teacher credentials against the database each time a user attempts to log in.
 * Checks:
 * 1. Does the account exist in the database?
 * 2. Does the password match the registered account password?
 */
export function verifyUserLogin(email: string, password: string): LoginVerificationResult {
  const clean = email.trim().toLowerCase();
  const user = getUserByEmail(clean);

  if (!user) {
    return {
      success: false,
      message: "No registered teacher account found for this email. Please check your spelling or register.",
    };
  }

  // Account found: now check password match
  if (!user.password || user.password !== password) {
    return {
      success: false,
      message: "Incorrect password. Please verify your password or use 'Forgot password?'.",
    };
  }

  return {
    success: true,
    user,
  };
}

/**
 * Saves a newly registered teacher into the database.
 * Updates both localStorage and disk database file via the Vite API.
 */
export function saveUserToDatabase(newUser: {
  fullName: string;
  email: string;
  institutionName: string;
  password: string;
  role?: string;
}): TeacherUser {
  const users = getDatabaseUsers();
  const cleanEmail = newUser.email.trim().toLowerCase();

  const user: TeacherUser = {
    id: `usr_${Date.now()}`,
    fullName: newUser.fullName.trim(),
    email: cleanEmail,
    institutionName: newUser.institutionName.trim(),
    password: newUser.password,
    role: newUser.role || "Educator",
    status: "active",
    createdAt: new Date().toISOString(),
  };

  const existingIdx = users.findIndex((u) => u.email.toLowerCase() === cleanEmail);
  let updated: TeacherUser[];
  if (existingIdx >= 0) {
    updated = [...users];
    updated[existingIdx] = user;
  } else {
    updated = [user, ...users];
  }

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore quota
    }

    // Also persist directly to database.json via Vite API middleware
    fetch("/api/database/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(user),
    }).catch(() => {
      // offline/fallback to localStorage
    });
  }

  return user;
}

/**
 * Updates a user's password in the database (used by password recovery flow).
 * Updates both localStorage and disk database file via the Vite API.
 */
export function updateUserPasswordInDatabase(email: string, newPassword: string): boolean {
  const users = getDatabaseUsers();
  const cleanEmail = email.trim().toLowerCase();

  const user = users.find((u) => u.email.toLowerCase() === cleanEmail);
  if (!user) {
    return false;
  }

  user.password = newPassword;

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
    } catch {
      // ignore
    }

    // Persist to database.json via Vite API middleware
    fetch("/api/database/update-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: cleanEmail, newPassword }),
    }).catch(() => {
      // offline/fallback
    });
  }

  return true;
}

/**
 * Syncs the database with the server's database.json on startup.
 */
export async function syncDatabaseWithServer(): Promise<TeacherUser[]> {
  if (typeof window === "undefined") return INITIAL_DATABASE;
  try {
    const res = await fetch("/api/database");
    if (!res.ok) return getDatabaseUsers();
    const data = await res.json();
    if (data && Array.isArray(data.users)) {
      const serverUsers = data.users;
      const localUsers = getDatabaseUsers();
      // Merge: server users + any local users not on server
      const mergedMap = new Map<string, TeacherUser>();
      for (const u of serverUsers) {
        if (u.email) mergedMap.set(u.email.toLowerCase(), u);
      }
      for (const u of localUsers) {
        if (u.email && !mergedMap.has(u.email.toLowerCase())) {
          mergedMap.set(u.email.toLowerCase(), u);
        }
      }
      const mergedList = Array.from(mergedMap.values());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedList));
      return mergedList;
    }
  } catch {
    // Ignore network errors in local dev
  }
  return getDatabaseUsers();
}
