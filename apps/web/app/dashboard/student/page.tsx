"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ClipboardList, FileText, BookOpen, Calendar, MessageCircle, Award } from "lucide-react";
import Link from "next/link";

export default function StudentOverview() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<{ attendance_pct?: number; risk_alerts?: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get("/attendance/student-summary");
        const overallPct =
          data.length > 0
            ? data.reduce((sum: number, s: Record<string, unknown>) => sum + Number(s.attendance_pct ?? 0), 0) / data.length
            : null;
        setSummary({ attendance_pct: overallPct ? Math.round(overallPct * 10) / 10 : undefined });
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  const cards = [
    { label: "Attendance", desc: "View calendar & summary", href: "/dashboard/student/attendance", icon: <ClipboardList className="h-8 w-8 text-blue-500" /> },
    { label: "Results", desc: "Theory & practical marks", href: "/dashboard/student/results", icon: <FileText className="h-8 w-8 text-green-500" /> },
    { label: "Materials", desc: "Download notes & resources", href: "/dashboard/student/materials", icon: <BookOpen className="h-8 w-8 text-purple-500" /> },
    { label: "Grievances", desc: "Dispute attendance records", href: "/dashboard/student/grievances", icon: <MessageCircle className="h-8 w-8 text-yellow-500" /> },
    { label: "OD Requests", desc: "On-duty leave requests", href: "/dashboard/student/od", icon: <Calendar className="h-8 w-8 text-orange-500" /> },
    { label: "AICTE Points", desc: "Activity points tracker", href: "/dashboard/student/aicte", icon: <Award className="h-8 w-8 text-pink-500" /> },
  ];

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Welcome, {user?.name}</h2>
        {summary?.attendance_pct != null && (
          <p className={`text-sm mt-1 ${summary.attendance_pct < 75 ? "text-red-600 font-medium" : "text-gray-500"}`}>
            Overall Attendance: {summary.attendance_pct}%
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href as any}>
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 py-6">
                {c.icon}
                <div>
                  <p className="font-semibold">{c.label}</p>
                  <p className="text-sm text-gray-500">{c.desc}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
