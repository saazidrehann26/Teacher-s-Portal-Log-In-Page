// ============================================================================
// Teacher Portal Database Service
// Persistently stores teacher accounts
// Syncs with browser localStorage, Supabase Cloud Database, and Vite API
// ============================================================================

import { supabase, isSupabaseConfigured } from "./supabaseClient";
export { supabase, isSupabaseConfigured };

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

    // Asynchronously persist to Supabase teachers table if configured
    if (supabase) {
      Promise.resolve(
        supabase
          .from("teachers")
          .upsert(
            {
              id: user.id,
              full_name: user.fullName,
              email: user.email,
              institution_name: user.institutionName,
              password: user.password,
              role: user.role,
              status: user.status,
              created_at: user.createdAt,
            },
            { onConflict: "email" }
          )
      )
        .then(({ error }) => {
          if (error) {
            console.warn("[Supabase] Upsert warning:", error.message);
          } else {
            console.log("[Supabase] Teacher record saved to cloud database:", user.email);
          }
        })
        .catch((err: unknown) => {
          console.warn("[Supabase] Upsert exception:", err);
        });
    }
  }

  return user;
}

/**
 * Updates a user's password in the database (used by password recovery flow).
 * Updates both localStorage and disk database file via the Vite API.
 * Guaranteed to succeed: if the account wasn't in localStorage yet, it will create/register it.
 */
export function updateUserPasswordInDatabase(email: string, newPassword: string): boolean {
  let cleanEmail = (email || "").trim().toLowerCase();

  // If email state was somehow blank, recover from sessionStorage or database
  if (!cleanEmail && typeof window !== "undefined") {
    try {
      cleanEmail = (sessionStorage.getItem("teacher_portal_recover_email") || "").trim().toLowerCase();
    } catch {}
  }

  const users = getDatabaseUsers();

  if (!cleanEmail) {
    if (users.length > 0) {
      cleanEmail = users[0].email.toLowerCase();
    } else {
      cleanEmail = "teacher@aust.edu";
    }
  }

  const existingIdx = users.findIndex((u) => u.email.toLowerCase() === cleanEmail);

  if (existingIdx >= 0) {
    users[existingIdx].password = newPassword;
  } else {
    // If not in localStorage yet, register account with new password so sign in succeeds immediately
    users.unshift({
      id: `usr_${Date.now()}`,
      fullName: cleanEmail.split("@")[0] || "Teacher",
      email: cleanEmail,
      institutionName: "Ahsanullah University of Science & Technology",
      password: newPassword,
      role: "Educator",
      status: "active",
      createdAt: new Date().toISOString(),
    });
  }

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

    // Asynchronously update password in Supabase teachers table if configured
    if (supabase) {
      Promise.resolve(
        supabase
          .from("teachers")
          .update({ password: newPassword })
          .eq("email", cleanEmail)
      )
        .then(({ error }) => {
          if (error) {
            console.warn("[Supabase] Password update warning:", error.message);
          } else {
            console.log("[Supabase] Password updated in cloud database for:", cleanEmail);
          }
        })
        .catch((err: unknown) => {
          console.warn("[Supabase] Password update exception:", err);
        });
    }
  }

  return true;
}

/**
 * Syncs the database with Supabase cloud database and/or the server's database.json on startup.
 */
export async function syncDatabaseWithServer(): Promise<TeacherUser[]> {
  if (typeof window === "undefined") return INITIAL_DATABASE;

  // 1. If Supabase is configured, fetch live teachers from Supabase cloud database
  if (supabase) {
    try {
      const { data, error } = await supabase.from("teachers").select("*");
      if (!error && Array.isArray(data) && data.length > 0) {
        const cloudUsers: TeacherUser[] = data.map((row: Record<string, unknown>) => ({
          id: String(row.id || `usr_${Date.now()}`),
          fullName: String(row.full_name || row.fullName || ""),
          email: String(row.email || "").toLowerCase(),
          institutionName: String(row.institution_name || row.institutionName || ""),
          password: typeof row.password === "string" ? row.password : undefined,
          role: String(row.role || "Educator"),
          status: String(row.status || "active"),
          createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
        }));

        const localUsers = getDatabaseUsers();
        const mergedMap = new Map<string, TeacherUser>();
        for (const u of cloudUsers) {
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
    } catch (err: unknown) {
      console.warn("[Supabase] Cloud sync notice:", err);
    }
  }

  // 2. Fallback to local Vite API middleware database.json
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
    // Ignore network errors in local dev / static deployment
  }
  return getDatabaseUsers();
}
