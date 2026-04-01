"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

interface TgStudent {
  erp_id: string;
  name: string;
  phone: string;
  parent_phone: string;
  email: string;
  class_name: string;
  attendance_pct: number;
}

export default function TgStudentsPage() {
  const [students, setStudents] = useState<TgStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/attendance/tg-students")
      .then(({ data }) => setStudents(data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">TG Students</h2>
      {students.length === 0 ? (
        <p className="text-gray-500">No students assigned to you.</p>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto py-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-3">ERP ID</th>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Phone</th>
                  <th className="py-2 pr-3">Parent Phone</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.erp_id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs">{s.erp_id}</td>
                    <td className="py-2 pr-3">{s.name}</td>
                    <td className="py-2 pr-3 text-gray-600">{s.phone || "–"}</td>
                    <td className="py-2 pr-3 text-gray-600">{s.parent_phone || "–"}</td>
                    <td className="py-2 pr-3 text-gray-500 text-xs">{s.email || "–"}</td>
                    <td className={`py-2 font-medium ${(s.attendance_pct ?? 100) < 75 ? "text-red-600" : "text-green-600"}`}>
                      {s.attendance_pct != null ? `${s.attendance_pct}%` : "–"}
                    </td>
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
