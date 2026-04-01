"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Calendar, AlertTriangle, ClipboardList, RefreshCw } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import Link from "next/link";

export default function HodOverview() {
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get("/roles/assignments-overview");
        setOverview(data);
      } catch {
        // API may not be ready
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  const cards = [
    { label: "Assign Roles", desc: "Subject teachers, class incharges, TGs", href: "/dashboard/hod/roles", icon: <Users className="h-8 w-8 text-blue-500" /> },
    { label: "Manage Assignments", desc: "Edit, reassign, or remove teacher subjects & roles", href: "/dashboard/hod/roles/manage", icon: <RefreshCw className="h-8 w-8 text-orange-500" /> },
    { label: "Timetable", desc: "Manage division timetables", href: "/dashboard/hod/timetable", icon: <Calendar className="h-8 w-8 text-green-500" /> },
    { label: "Attendance", desc: "Division-wide attendance matrix", href: "/dashboard/hod/attendance", icon: <ClipboardList className="h-8 w-8 text-purple-500" /> },
    { label: "At-Risk Students", desc: "Below attendance / marks threshold", href: "/dashboard/hod/risk", icon: <AlertTriangle className="h-8 w-8 text-red-500" /> },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">HOD Dashboard</h2>
      <div className="grid gap-4 md:grid-cols-2">
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

      {overview && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-gray-500">
              Assignments: {JSON.stringify(overview).slice(0, 200)}…
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
