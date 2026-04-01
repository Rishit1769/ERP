"use client";

import { useEffect, useState, type FormEvent } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";

interface Grievance {
  id: number;
  subject_name: string;
  date: string;
  reason: string;
  status: string;
  created_at: string;
}

export default function StudentGrievancesPage() {
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [loading, setLoading] = useState(true);

  // New grievance form
  const [attendanceId, setAttendanceId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const { data } = await api.get("/grievances/my");
      setGrievances(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!attendanceId || !reason.trim()) return;
    setSubmitting(true);
    try {
      await api.post("/grievances/submit", {
        attendance_id: Number(attendanceId),
        reason: reason.trim(),
      });
      toast.success("Grievance submitted");
      setAttendanceId("");
      setReason("");
      load();
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed"
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Attendance Grievances</h2>

      <Card>
        <CardHeader><CardTitle>Submit Grievance</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Attendance Record ID</label>
              <input
                type="number"
                value={attendanceId}
                onChange={(e) => setAttendanceId(e.target.value)}
                placeholder="Attendance ID from your calendar"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Explain why this attendance record is incorrect…"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit Grievance"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {grievances.length > 0 && (
        <Card>
          <CardHeader><CardTitle>My Grievances</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {grievances.map((g) => (
                <div key={g.id} className="rounded-lg border px-4 py-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-sm">{g.subject_name} — {g.date}</p>
                      <p className="text-sm text-gray-500 mt-1">{g.reason}</p>
                    </div>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        g.status === "APPROVED"
                          ? "bg-green-100 text-green-700"
                          : g.status === "REJECTED"
                          ? "bg-red-100 text-red-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {g.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
