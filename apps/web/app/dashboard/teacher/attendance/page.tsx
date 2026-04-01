"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";

interface Student {
  erp_id: string;
  name: string;
  status: "PRESENT" | "ABSENT";
}

export default function TeacherAttendancePage() {
  const [assignments, setAssignments] = useState<{ id: number; subject_name: string; division_name: string }[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Fetch teacher's subject assignments
    api.get("/attendance/my-assignments").then(({ data }) => setAssignments(data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedAssignment) return;
    setLoading(true);
    api
      .get(`/attendance/class?assignment_id=${selectedAssignment}&date=${date}`)
      .then(({ data }) => {
        setStudents(
          data.map((s: Record<string, unknown>) => ({
            erp_id: s.erp_id || s.student_erp_id,
            name: s.name || s.student_name,
            status: s.status || "PRESENT",
          }))
        );
      })
      .finally(() => setLoading(false));
  }, [selectedAssignment, date]);

  function toggleStatus(erpId: string) {
    setStudents((prev) =>
      prev.map((s) =>
        s.erp_id === erpId
          ? { ...s, status: s.status === "PRESENT" ? "ABSENT" : "PRESENT" }
          : s
      )
    );
  }

  async function handleSubmit() {
    if (!selectedAssignment) return;
    setSubmitting(true);
    try {
      await api.post("/attendance/mark", {
        assignment_id: Number(selectedAssignment),
        date,
        records: students.map((s) => ({
          student_erp_id: s.erp_id,
          status: s.status,
        })),
      });
      toast.success("Attendance saved");
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Mark Attendance</h2>

      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Assignment</label>
          <select
            value={selectedAssignment}
            onChange={(e) => setSelectedAssignment(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Select…</option>
            {assignments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.subject_name} — {a.division_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : students.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Students</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {students.map((s) => (
                <div
                  key={s.erp_id}
                  className="flex items-center justify-between rounded-lg border px-4 py-2"
                >
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-gray-400">{s.erp_id}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleStatus(s.erp_id)}
                    className={`rounded px-3 py-1 text-sm font-medium ${
                      s.status === "PRESENT"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {s.status}
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Saving…" : "Save Attendance"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : selectedAssignment ? (
        <p className="text-gray-500">No students found for this assignment.</p>
      ) : null}
    </div>
  );
}
