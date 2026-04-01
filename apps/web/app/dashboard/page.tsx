"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { PageLoader } from "@/components/ui/spinner";
import { useRouter } from "next/navigation";

export default function DashboardRedirect() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    if (user.must_change_password) {
      router.replace("/set-password");
      return;
    }

    if (
      user.base_role === "SUPER_ADMIN" ||
      user.base_role === "ADMIN" ||
      user.roles.includes("ADMIN") ||
      user.roles.includes("SUPER_ADMIN")
    ) {
      router.replace("/dashboard/admin");
      return;
    }

    if (user.base_role === "EMPLOYEE") {
      router.replace(user.roles.includes("HOD") ? "/dashboard/hod" : "/dashboard/teacher");
      return;
    }

    if (user.base_role === "STUDENT") {
      router.replace("/dashboard/student");
      return;
    }

    router.replace("/login");
  }, [user, loading, router]);

  return <PageLoader />;
}
