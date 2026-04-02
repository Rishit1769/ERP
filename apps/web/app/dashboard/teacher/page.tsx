"use client";

import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList, FileText, BookOpen, Calendar, Users, MessageCircle, GraduationCap, Award } from "lucide-react";
import Link from "next/link";

export default function TeacherOverview() {
  const { user } = useAuth();
  const roles = user?.roles || [];
  const isTG = roles.includes("TEACHER_GUARDIAN");

  const cards = [
    { label: "Mark Attendance", href: "/dashboard/teacher/attendance", icon: <ClipboardList className="h-8 w-8 text-blue-500" /> },
    { label: "Enter Marks", href: "/dashboard/teacher/marks", icon: <FileText className="h-8 w-8 text-green-500" /> },
    { label: "Materials", href: "/dashboard/teacher/materials", icon: <BookOpen className="h-8 w-8 text-purple-500" /> },
    { label: "My Timetable", href: "/dashboard/teacher/timetable", icon: <Calendar className="h-8 w-8 text-orange-500" /> },
    { label: "Portion Planner", href: "/dashboard/teacher/lesson-plan", icon: <FileText className="h-8 w-8 text-indigo-500" /> },
    ...(isTG
      ? [
          { label: "TG Students", href: "/dashboard/teacher/tg", icon: <Users className="h-8 w-8 text-teal-500" /> },
          { label: "Grievances", href: "/dashboard/teacher/grievances", icon: <MessageCircle className="h-8 w-8 text-yellow-500" /> },
          { label: "Mentorship", href: "/dashboard/teacher/mentorship", icon: <GraduationCap className="h-8 w-8 text-indigo-500" /> },
          { label: "AICTE Review", href: "/dashboard/teacher/aicte", icon: <Award className="h-8 w-8 text-pink-500" /> },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">
        Welcome, {user?.name}
      </h2>
      <p className="text-gray-500">
        Roles: {roles.length > 0 ? roles.join(", ") : "Employee"}
      </p>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href as any}>
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 py-6">
                {c.icon}
                <p className="font-semibold">{c.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
