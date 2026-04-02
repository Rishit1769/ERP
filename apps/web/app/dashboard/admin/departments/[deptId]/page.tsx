"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { AlertTriangle, Users, BookOpen, TrendingUp } from "lucide-react";

const YEAR_LABELS: Record<number, string> = {
  1: "FY (1st Year)",
  2: "SY (2nd Year)",
  3: "TY (3rd Year)",
  4: "LY (4th Year)",
};

const SEM_LABEL = (sem: number | null) =>
  sem == null ? "—" : `Sem ${sem} (${sem % 2 === 1 ? "Odd" : "Even"})`;

interface DivisionAnalytics {
  division_id: number;
  label: string;
  total_students: number;
  semester: number | null;
  at_risk: number;
  avg_attendance_pct: number | null;
}

interface Dept {
  id: number;
  code: string;
  name: string;
}

export default function DeptAnalyticsPage() {
  const params = useParams<{ deptId: string }>();
  const deptId = params.deptId;

  const [dept, setDept] = useState<Dept | null>(null);
  const [activeYear, setActiveYear] = useState<number>(1);
  const [data, setData] = useState<DivisionAnalytics[]>([]);
  const [loading, setLoading] = useState(false);
  const [deptLoading, setDeptLoading] = useState(true);

  // Load dept info
  useEffect(() => {
    api.get<Dept[]>("/admin/departments").then(({ data: depts }) => {
      const found = depts.find((d: Dept) => String(d.id) === deptId);
      setDept(found ?? null);
    }).finally(() => setDeptLoading(false));
  }, [deptId]);

  // Load analytics whenever year changes
  useEffect(() => {
    setLoading(true);
    api
      .get<DivisionAnalytics[]>("/admin/dept-year-analytics", { params: { dept_id: deptId, year: activeYear } })
      .then(({ data }) => setData(data))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [deptId, activeYear]);

  if (deptLoading) return <div className="flex justify-center py-12"><Spinner /></div>;

  // Aggregate totals across all divisions in this year
  const totalStudents = data.reduce((s, d) => s + d.total_students, 0);
  const totalRisk = data.reduce((s, d) => s + d.at_risk, 0);
  const avgAtt =
    data.filter((d) => d.avg_attendance_pct != null).length > 0
      ? (
          data
            .filter((d) => d.avg_attendance_pct != null)
            .reduce((s, d) => s + (d.avg_attendance_pct ?? 0), 0) /
          data.filter((d) => d.avg_attendance_pct != null).length
        ).toFixed(1)
      : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-sm text-gray-500 mb-1">
          <a href="/dashboard/admin/departments" className="hover:underline">Departments</a>
          {" / "}
          {dept ? `${dept.code} — ${dept.name}` : `Dept #${deptId}`}
        </p>
        <h2 className="text-2xl font-bold">
          {dept ? `${dept.code} — ${dept.name}` : "Department Analytics"}
        </h2>
      </div>

      {/* Year tabs */}
      <div className="flex gap-2 border-b pb-0">
        {[1, 2, 3, 4].map((y) => (
          <button
            key={y}
            onClick={() => setActiveYear(y)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeYear === y
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {YEAR_LABELS[y].split(" ")[0]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : data.length === 0 ? (
        <p className="text-gray-500">No divisions found for {YEAR_LABELS[activeYear]}.</p>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-4 py-5">
                <Users className="h-8 w-8 text-blue-500 shrink-0" />
                <div>
                  <p className="text-2xl font-bold">{totalStudents}</p>
                  <p className="text-sm text-gray-500">Total Students</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 py-5">
                <AlertTriangle className="h-8 w-8 text-red-500 shrink-0" />
                <div>
                  <p className="text-2xl font-bold">{totalRisk}</p>
                  <p className="text-sm text-gray-500">At-Risk Students</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 py-5">
                <TrendingUp className="h-8 w-8 text-green-500 shrink-0" />
                <div>
                  <p className="text-2xl font-bold">{avgAtt != null ? `${avgAtt}%` : "—"}</p>
                  <p className="text-sm text-gray-500">Avg Attendance</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Per-division breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {YEAR_LABELS[activeYear]} — Division Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-6">Division</th>
                    <th className="py-2 pr-6">Current Semester</th>
                    <th className="py-2 pr-6">Students</th>
                    <th className="py-2 pr-6">At-Risk</th>
                    <th className="py-2">Avg Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((div) => (
                    <tr key={div.division_id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2 pr-6 font-semibold">{div.label}</td>
                      <td className="py-2 pr-6 text-gray-600">{SEM_LABEL(div.semester)}</td>
                      <td className="py-2 pr-6">{div.total_students}</td>
                      <td className="py-2 pr-6">
                        {div.at_risk > 0 ? (
                          <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {div.at_risk}
                          </span>
                        ) : (
                          <span className="text-green-600">0</span>
                        )}
                      </td>
                      <td className="py-2">
                        {div.avg_attendance_pct != null ? (
                          <span
                            className={
                              div.avg_attendance_pct < 75 ? "text-red-600 font-medium" : "text-gray-700"
                            }
                          >
                            {div.avg_attendance_pct}%
                          </span>
                        ) : (
                          <span className="text-gray-400">No data</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
