"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { AlertTriangle } from "lucide-react";

interface RiskStudent {
  erp_id: string;
  name: string;
  attendance_pct: number;
  risk_type: string;
  tg_name?: string;
}

export default function HodRiskPage() {
  const [students, setStudents] = useState<RiskStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get("/admin/risk-dashboard");
        setStudents(data.risks || []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        <AlertTriangle className="h-6 w-6 text-red-500" />
        At-Risk Students
      </h2>

      {students.length === 0 ? (
        <p className="text-gray-500">No at-risk students in your department.</p>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto py-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4">ERP ID</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Risk Type</th>
                  <th className="py-2 pr-4">Attendance</th>
                  <th className="py-2">TG</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={`${s.erp_id}-${s.risk_type}`} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs">{s.erp_id}</td>
                    <td className="py-2 pr-4">{s.name}</td>
                    <td className="py-2 pr-4">
                      <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">{s.risk_type}</span>
                    </td>
                    <td className={`py-2 pr-4 font-medium ${(s.attendance_pct ?? 100) < 75 ? "text-red-600" : ""}`}>
                      {s.attendance_pct != null ? `${s.attendance_pct}%` : "–"}
                    </td>
                    <td className="py-2 text-gray-500">{s.tg_name || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
