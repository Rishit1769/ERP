"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Calendar,
  ClipboardList,
  BookOpen,
  FileText,
  Settings,
  LogOut,
  Upload,
  MapPin,
  AlertTriangle,
  GraduationCap,
  Award,
  MessageCircle,
  Menu,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { PageLoader } from "@/components/ui/spinner";

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

function getNavItems(baseRole: string, roles: string[]): NavItem[] {
  const base = `/dashboard`;

  if (baseRole === "SUPER_ADMIN" || baseRole === "ADMIN" || roles.includes("ADMIN") || roles.includes("SUPER_ADMIN")) {
    return [
      { label: "Overview", href: `${base}/admin`, icon: <LayoutDashboard className="h-5 w-5" /> },
      { label: "Departments", href: `${base}/admin/departments`, icon: <BookOpen className="h-5 w-5" /> },
      { label: "Import Users", href: `${base}/admin/import`, icon: <Upload className="h-5 w-5" /> },
      { label: "Thresholds", href: `${base}/admin/thresholds`, icon: <Settings className="h-5 w-5" /> },
      { label: "Risk Events", href: `${base}/admin/risk`, icon: <AlertTriangle className="h-5 w-5" /> },
      { label: "Semester", href: `${base}/admin/semester`, icon: <GraduationCap className="h-5 w-5" /> },
      { label: "Schedule", href: `${base}/admin/semester-schedule`, icon: <Calendar className="h-5 w-5" /> },
      { label: "Timetable", href: `${base}/admin/timetable`, icon: <ClipboardList className="h-5 w-5" /> },
    ];
  }

  if (baseRole === "EMPLOYEE" && roles.includes("HOD")) {
    return [
      { label: "Overview", href: `${base}/hod`, icon: <LayoutDashboard className="h-5 w-5" /> },
      { label: "Assign Roles", href: `${base}/hod/roles`, icon: <Users className="h-5 w-5" /> },
      { label: "Timetable", href: `${base}/hod/timetable`, icon: <Calendar className="h-5 w-5" /> },
      { label: "Attendance", href: `${base}/hod/attendance`, icon: <ClipboardList className="h-5 w-5" /> },
      { label: "At-Risk Students", href: `${base}/hod/risk`, icon: <AlertTriangle className="h-5 w-5" /> },
      { label: "Faculty Locator", href: `${base}/hod/locator`, icon: <MapPin className="h-5 w-5" /> },
    ];
  }

  if (baseRole === "EMPLOYEE") {
    return [
      { label: "Overview", href: `${base}/teacher`, icon: <LayoutDashboard className="h-5 w-5" /> },
      { label: "Attendance", href: `${base}/teacher/attendance`, icon: <ClipboardList className="h-5 w-5" /> },
      { label: "Marks", href: `${base}/teacher/marks`, icon: <FileText className="h-5 w-5" /> },
      { label: "Materials", href: `${base}/teacher/materials`, icon: <BookOpen className="h-5 w-5" /> },
      { label: "Timetable", href: `${base}/teacher/timetable`, icon: <Calendar className="h-5 w-5" /> },
      ...(roles.includes("TEACHER_GUARDIAN")
        ? [
            { label: "TG Students", href: `${base}/teacher/tg`, icon: <Users className="h-5 w-5" /> },
            { label: "Grievances", href: `${base}/teacher/grievances`, icon: <MessageCircle className="h-5 w-5" /> },
            { label: "Mentorship", href: `${base}/teacher/mentorship`, icon: <GraduationCap className="h-5 w-5" /> },
            { label: "AICTE Review", href: `${base}/teacher/aicte`, icon: <Award className="h-5 w-5" /> },
          ]
        : []),
    ];
  }

  // STUDENT
  return [
    { label: "Overview", href: `${base}/student`, icon: <LayoutDashboard className="h-5 w-5" /> },
    { label: "Attendance", href: `${base}/student/attendance`, icon: <ClipboardList className="h-5 w-5" /> },
    { label: "Results", href: `${base}/student/results`, icon: <FileText className="h-5 w-5" /> },
    { label: "Materials", href: `${base}/student/materials`, icon: <BookOpen className="h-5 w-5" /> },
    { label: "Grievances", href: `${base}/student/grievances`, icon: <MessageCircle className="h-5 w-5" /> },
    { label: "OD Requests", href: `${base}/student/od`, icon: <Calendar className="h-5 w-5" /> },
    { label: "Timetable", href: `${base}/student/timetable`, icon: <Calendar className="h-5 w-5" /> },
    { label: "Faculty Locator", href: `${base}/student/locator`, icon: <MapPin className="h-5 w-5" /> },
    { label: "AICTE Points", href: `${base}/student/aicte`, icon: <Award className="h-5 w-5" /> },
  ];
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) return <PageLoader />;
  if (!user) return null;

  const navItems = getNavItems(user.base_role, user.roles);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-white border-r border-gray-200 transition-transform lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b px-4">
          <span className="text-xl font-bold text-primary">CloudCampus</span>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href as any}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                pathname === item.href
                  ? "bg-primary/10 text-primary"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t p-4">
          <div className="mb-2 text-xs text-gray-500 truncate">{user.name}</div>
          <div className="mb-3 text-xs text-gray-400">{user.erp_id} · {user.base_role}</div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center gap-4 border-b bg-white px-4 lg:px-6">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden">
            <Menu className="h-6 w-6" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">
            {navItems.find((n) => n.href === pathname)?.label || "Dashboard"}
          </h1>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
