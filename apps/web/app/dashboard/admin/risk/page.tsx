"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { AlertTriangle } from "lucide-react";

interface RiskEvent {
  id: number;
  student_erp_id: string;
  student_name: string;
  risk_type: string;
  detail: string;
  resolved: boolean;
  created_at: string;
}

export default function RiskDashboardPage() {
  const [risks, setRisks] = useState<RiskEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get("/admin/risk-dashboard");
        setRisks(data.risks || data);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  const active = risks.filter((r) => !r.resolved);
  const resolved = risks.filter((r) => r.resolved);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Risk Events</h2>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Active Risks ({active.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <p className="text-gray-500">No active risk events.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4">Student</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Detail</th>
                    <th className="py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        <span className="font-mono text-xs">{r.student_erp_id}</span>
                        {r.student_name && <span className="ml-2 text-gray-600">{r.student_name}</span>}
                      </td>
                      <td className="py-2 pr-4">
                        <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          {r.risk_type}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-gray-600">{r.detail}</td>
                      <td className="py-2 text-gray-400 text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {resolved.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resolved ({resolved.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4">Student</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Detail</th>
                    <th className="py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {resolved.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 text-gray-400">
                      <td className="py-2 pr-4 font-mono text-xs">{r.student_erp_id}</td>
                      <td className="py-2 pr-4 text-xs">{r.risk_type}</td>
                      <td className="py-2 pr-4">{r.detail}</td>
                      <td className="py-2 text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
