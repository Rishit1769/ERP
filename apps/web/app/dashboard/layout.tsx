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
  Bell,
  Trophy,
  ChevronDown,
  Briefcase,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { PageLoader } from "@/components/ui/spinner";
import api from "@/lib/api";

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

interface NavGroup {
  groupLabel: string;
  groupIcon: ReactNode;
  items: NavItem[];
}

function getTeacherNavGroups(roles: string[]): NavGroup[] {
  const base = `/dashboard/teacher`;
  const groups: NavGroup[] = [];

  if (roles.includes("SUBJECT_TEACHER") || roles.includes("PRACTICAL_TEACHER")) {
    groups.push({
      groupLabel: "Subject Teacher",
      groupIcon: <BookOpen className="h-5 w-5" />,
      items: [
        { label: "Attendance", href: `${base}/attendance`, icon: <ClipboardList className="h-4 w-4" /> },
        { label: "Marks", href: `${base}/marks`, icon: <FileText className="h-4 w-4" /> },
        { label: "Materials", href: `${base}/materials`, icon: <BookOpen className="h-4 w-4" /> },
        { label: "Timetable", href: `${base}/timetable`, icon: <Calendar className="h-4 w-4" /> },
        { label: "Portion Planner", href: `${base}/lesson-plan`, icon: <FileText className="h-4 w-4" /> },
      ],
    });
  }

  if (roles.includes("CLASS_INCHARGE")) {
    groups.push({
      groupLabel: "Class Incharge",
      groupIcon: <Users className="h-5 w-5" />,
      items: [
        { label: "Attendance", href: `${base}/attendance`, icon: <ClipboardList className="h-4 w-4" /> },
        { label: "Timetable", href: `${base}/timetable`, icon: <Calendar className="h-4 w-4" /> },
      ],
    });
  }

  if (roles.includes("TEACHER_GUARDIAN")) {
    groups.push({
      groupLabel: "Teacher Guardian",
      groupIcon: <GraduationCap className="h-5 w-5" />,
      items: [
        { label: "TG Students", href: `${base}/tg`, icon: <Users className="h-4 w-4" /> },
        { label: "Grievances", href: `${base}/grievances`, icon: <MessageCircle className="h-4 w-4" /> },
        { label: "Mentorship", href: `${base}/mentorship`, icon: <GraduationCap className="h-4 w-4" /> },
        { label: "AICTE Review", href: `${base}/aicte`, icon: <Award className="h-4 w-4" /> },
      ],
    });
  }

  if (roles.includes("PLACEMENT_OFFICER")) {
    groups.push({
      groupLabel: "Placement",
      groupIcon: <Briefcase className="h-5 w-5" />,
      items: [
        { label: "Placement", href: `/dashboard/placement`, icon: <Briefcase className="h-4 w-4" /> },
      ],
    });
  }

  return groups;
}

function getNavItems(baseRole: string, roles: string[]): NavItem[] {
  const base = `/dashboard`;

  if (baseRole === "SUPER_ADMIN" || baseRole === "ADMIN" || roles.includes("ADMIN") || roles.includes("SUPER_ADMIN")) {
    return [
      { label: "Overview", href: `${base}/admin`, icon: <LayoutDashboard className="h-5 w-5" /> },
      { label: "Departments", href: `${base}/admin/departments`, icon: <BookOpen className="h-5 w-5" /> },
      { label: "Import Users", href: `${base}/admin/import`, icon: <Upload className="h-5 w-5" /> },
      { label: "Thresholds", href: `${base}/admin/thresholds`, icon: <Settings className="h-5 w-5" /> },
      { label: "Semester", href: `${base}/admin/semester`, icon: <GraduationCap className="h-5 w-5" /> },
      { label: "Schedule", href: `${base}/admin/semester-schedule`, icon: <Calendar className="h-5 w-5" /> },
      { label: "Timetable", href: `${base}/admin/timetable`, icon: <ClipboardList className="h-5 w-5" /> },
      { label: "Syllabus", href: `${base}/admin/syllabus`, icon: <BookOpen className="h-5 w-5" /> },
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
    // Teacher nav is handled via role groups (getTeacherNavGroups); return empty here.
    return [];
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
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  // Auto-open the group that contains the active route
  useEffect(() => {
    if (!user || user.base_role !== "EMPLOYEE" || user.roles.includes("HOD")) return;
    const groups = getTeacherNavGroups(user.roles);
    const active = groups.find((g) => g.items.some((item) => item.href === pathname));
    if (active) setOpenGroups((prev) => new Set([...prev, active.groupLabel]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  // ── Bell notifications ───────────────────────────────────────────────────
  const [bellOpen, setBellOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Array<{
    id: number; title: string; body: string; is_read: number; created_at: string; link?: string;
  }>>([]);
  const bellRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await api.get<{ unread_count: number; notifications: Array<{ id: number; title: string; body: string; is_read: number; created_at: string; link?: string }> }>("/notifications");
      setUnreadCount(data.unread_count ?? 0);
      setNotifications(data.notifications ?? []);
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, [user, fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function openBell() {
    setBellOpen((o) => !o);
    if (!bellOpen && unreadCount > 0) {
      try {
        await api.patch("/notifications/read", {});
        setUnreadCount(0);
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      } catch {
        // ignore
      }
    }
  }
  // ────────────────────────────────────────────────────────────────────────────

  if (loading) return <PageLoader />;
  if (!user) return null;

  const isTeacher = user.base_role === "EMPLOYEE" && !user.roles.includes("HOD");
  const teacherGroups = isTeacher ? getTeacherNavGroups(user.roles) : [];
  const navItems = isTeacher ? [] : getNavItems(user.base_role, user.roles);

  // Top-level links always shown for teacher (outside groups)
  const teacherTopItems: NavItem[] = isTeacher
    ? [
        { label: "Overview", href: "/dashboard/teacher", icon: <LayoutDashboard className="h-5 w-5" /> },
        { label: "Achievements", href: "/dashboard/teacher/achievements", icon: <Trophy className="h-5 w-5" /> },
      ]
    : [];

  // Resolve the active page title for the header
  const activeTitle =
    navItems.find((n) => n.href === pathname)?.label ||
    teacherTopItems.find((n) => n.href === pathname)?.label ||
    teacherGroups.flatMap((g) => g.items).find((n) => n.href === pathname)?.label ||
    "Dashboard";

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
          {/* Flat nav for admin / HOD / student */}
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

          {/* Teacher: top-level links */}
          {teacherTopItems.map((item) => (
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

          {/* Teacher: collapsible role groups */}
          {teacherGroups.map((group) => {
            const isOpen = openGroups.has(group.groupLabel);
            const groupActive = group.items.some((item) => item.href === pathname);
            return (
              <div key={group.groupLabel}>
                <button
                  onClick={() => toggleGroup(group.groupLabel)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    groupActive
                      ? "bg-primary/10 text-primary"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  )}
                >
                  {group.groupIcon}
                  <span className="flex-1 text-left">{group.groupLabel}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform duration-200",
                      isOpen ? "rotate-180" : ""
                    )}
                  />
                </button>
                {isOpen && (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l border-gray-200 pl-3">
                    {group.items.map((item) => (
                      <Link
                        key={`${group.groupLabel}-${item.href}`}
                        href={item.href as any}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                          pathname === item.href
                            ? "font-medium text-primary"
                            : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                        )}
                      >
                        {item.icon}
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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
          <h1 className="text-lg font-semibold text-gray-900 flex-1">
            {activeTitle}
          </h1>

          {/* Bell notification button */}
          <div ref={bellRef} className="relative">
            <button
              onClick={openBell}
              className="relative rounded-full p-2 hover:bg-gray-100 transition-colors"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5 text-gray-600" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {bellOpen && (
              <div className="absolute right-0 top-10 z-50 w-80 rounded-lg border bg-white shadow-lg">
                <div className="flex items-center justify-between border-b px-4 py-2.5">
                  <span className="text-sm font-semibold">Notifications</span>
                  <button onClick={() => setBellOpen(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="py-8 text-center text-xs text-gray-400">No notifications</p>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`flex gap-3 border-b px-4 py-3 last:border-b-0 ${!n.is_read ? "bg-blue-50" : ""}`}
                      >
                        <Bell className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                        <div className="min-w-0">
                          <p className={`text-xs ${!n.is_read ? "font-semibold text-gray-900" : "text-gray-700"}`}>
                            {n.title}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-400">
                            {new Date(n.created_at).toLocaleString("en-IN", {
                              day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
