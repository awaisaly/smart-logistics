import React from "react";
import { deriveUserInitials, deriveUserName, formatRole, type CurrentUser } from "@/lib/user";
import { useAuth } from "@/lib/auth";

export function useCurrentUser(): {
  user: CurrentUser | null;
  userName: string;
  firstName: string;
  userInitials: string;
  userRoleLabel: string;
  loading: boolean;
} {
  const { user: authUser, loading } = useAuth();
  const user: CurrentUser | null = authUser
    ? { id: authUser.id, email: authUser.email, role: authUser.role }
    : null;

  const userName = user ? deriveUserName(user.email) : "Guest user";
  const firstName = userName.split(" ")[0] ?? userName;

  return {
    user,
    userName,
    firstName,
    userInitials: user ? deriveUserInitials(user.email) : "GU",
    // Prefer the backend-provided role label (data-driven); fall back to a
    // formatted version of the role key.
    userRoleLabel: user ? authUser?.label ?? formatRole(user.role) : "Not signed in",
    loading,
  };
}

export function useTimeGreeting(firstName: string): string {
  return React.useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return `Good morning, ${firstName}`;
    if (h < 17) return `Good afternoon, ${firstName}`;
    return `Good evening, ${firstName}`;
  }, [firstName]);
}
