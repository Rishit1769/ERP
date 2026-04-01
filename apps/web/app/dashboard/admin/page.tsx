"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, BookOpen, AlertTriangle, Building } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

interface Stats {
  departments: number;
  students: number;
  employees: number;
  riskEvents: number;
}

export default function AdminOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [depts, stats] = await Promise.all([
          api.get("/admin/departments"),
          api.get("/admin/stats"),
        ]);
        setStats({
          departments: depts.data.length,
          students: stats.data.students ?? 0,
          employees: stats.data.employees ?? 0,
          riskEvents: stats.data.active_risks ?? 0,
        });
      } catch {
        // Stats may not load if API is down
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  const cards = [
    { label: "Departments", value: stats?.departments ?? "–", icon: <Building className="h-8 w-8 text-blue-500" /> },
    { label: "Students", value: stats?.students ?? "–", icon: <Users className="h-8 w-8 text-green-500" /> },
    { label: "Employees", value: stats?.employees ?? "–", icon: <BookOpen className="h-8 w-8 text-purple-500" /> },
    { label: "Active Risk Events", value: stats?.riskEvents ?? "–", icon: <AlertTriangle className="h-8 w-8 text-red-500" /> },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Admin Dashboard</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="flex items-center gap-4 py-6">
              {c.icon}
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-sm text-gray-500">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
