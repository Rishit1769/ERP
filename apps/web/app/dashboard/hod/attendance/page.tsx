"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

export default function HodAttendancePage() {
  const [divisions, setDivisions] = useState<{ id: number; year: number; label: string }[]>([]);
  const [selectedDiv, setSelectedDiv] = useState("");
  const [matrix, setMatrix] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/roles/divisions").then(({ data }) => setDivisions(data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedDiv) return;
    setLoading(true);
    api
      .get(`/attendance/division-matrix/${selectedDiv}`)
      .then(({ data }) => setMatrix(data))
      .finally(() => setLoading(false));
  }, [selectedDiv]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Division Attendance Matrix</h2>

      <select
        value={selectedDiv}
        onChange={(e) => setSelectedDiv(e.target.value)}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm"
      >
        <option value="">Select division…</option>
        {divisions.map((d) => (
          <option key={d.id} value={d.id}>Year {d.year} – Div {d.label}</option>
        ))}
      </select>

      {loading ? (
        <Spinner />
      ) : matrix.length > 0 ? (
        <Card>
          <CardContent className="overflow-x-auto py-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4">Student</th>
                  <th className="py-2 pr-4">ERP ID</th>
                  <th className="py-2 pr-4">Present</th>
                  <th className="py-2 pr-4">Total</th>
                  <th className="py-2">%</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((row: Record<string, unknown>, i: number) => {
                  const pct = Number(row.attendance_pct ?? 0);
                  return (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 pr-4">{String(row.student_name ?? "")}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{String(row.erp_id ?? "")}</td>
                      <td className="py-2 pr-4">{String(row.present_count ?? 0)}</td>
                      <td className="py-2 pr-4">{String(row.total_count ?? 0)}</td>
                      <td className={`py-2 font-medium ${pct < 75 ? "text-red-600" : "text-green-600"}`}>
                        {pct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : selectedDiv ? (
        <p className="text-gray-500">No attendance data found.</p>
      ) : null}
    </div>
  );
}
