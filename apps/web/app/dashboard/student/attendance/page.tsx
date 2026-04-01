"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

interface SubjectSummary {
  subject_name: string;
  present_count: number;
  total_count: number;
  attendance_pct: number;
}

interface CalendarDay {
  date: string;
  status: string;
  subject_name: string;
}

export default function StudentAttendancePage() {
  const [summary, setSummary] = useState<SubjectSummary[]>([]);
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/attendance/student-summary").then(({ data }) => setSummary(data)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api
      .get(`/attendance/student-calendar?month=${month}`)
      .then(({ data }) => setCalendar(data))
      .catch(() => setCalendar([]));
  }, [month]);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">My Attendance</h2>

      {/* Subject-wise summary */}
      <Card>
        <CardHeader><CardTitle>Subject-wise Summary</CardTitle></CardHeader>
        <CardContent>
          {summary.length === 0 ? (
            <p className="text-gray-500">No attendance data yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4">Subject</th>
                  <th className="py-2 pr-4">Present</th>
                  <th className="py-2 pr-4">Total</th>
                  <th className="py-2">%</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 pr-4">{s.subject_name}</td>
                    <td className="py-2 pr-4">{s.present_count}</td>
                    <td className="py-2 pr-4">{s.total_count}</td>
                    <td className={`py-2 font-medium ${s.attendance_pct < 75 ? "text-red-600" : "text-green-600"}`}>
                      {s.attendance_pct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Calendar view */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Attendance Calendar</CardTitle>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1 text-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {calendar.length === 0 ? (
            <p className="text-gray-500">No records for this month.</p>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
              ))}
              {calendar.map((day, i) => {
                const d = new Date(day.date);
                const bg =
                  day.status === "PRESENT"
                    ? "bg-green-100 text-green-700"
                    : day.status === "ABSENT"
                    ? "bg-red-100 text-red-700"
                    : day.status === "OD"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-500";
                return (
                  <div
                    key={i}
                    className={`rounded p-1 text-center text-xs ${bg}`}
                    title={`${day.date} — ${day.subject_name} — ${day.status}`}
                  >
                    {d.getDate()}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
