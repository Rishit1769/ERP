"use client";

import { useEffect, useState, type FormEvent } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";

interface MentorshipRecord {
  id: number;
  student_erp_id: string;
  student_name: string;
  note: string;
  version: number;
  created_at: string;
}

export default function MentorshipPage() {
  const [students, setStudents] = useState<{ erp_id: string; name: string }[]>([]);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [records, setRecords] = useState<MentorshipRecord[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get("/attendance/tg-students")
      .then(({ data }) => setStudents(data.map((s: Record<string, unknown>) => ({ erp_id: s.erp_id, name: s.name }))))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedStudent) return;
    api
      .get(`/aicte/mentorship/${selectedStudent}`)
      .then(({ data }) => setRecords(data))
      .catch(() => setRecords([]));
  }, [selectedStudent]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!selectedStudent || !note.trim()) return;
    setSubmitting(true);
    try {
      await api.post("/aicte/mentorship", {
        student_erp_id: selectedStudent,
        note: note.trim(),
      });
      toast.success("Record added");
      setNote("");
      const { data } = await api.get(`/aicte/mentorship/${selectedStudent}`);
      setRecords(data);
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
      <h2 className="text-2xl font-bold">Mentorship Records</h2>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Student</label>
        <select
          value={selectedStudent}
          onChange={(e) => setSelectedStudent(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Select student…</option>
          {students.map((s) => (
            <option key={s.erp_id} value={s.erp_id}>
              {s.name} ({s.erp_id})
            </option>
          ))}
        </select>
      </div>

      {selectedStudent && (
        <Card>
          <CardHeader><CardTitle>Add Record</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="space-y-3">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Mentorship note…"
                rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Add Record"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {records.length > 0 && (
        <Card>
          <CardHeader><CardTitle>History (append-only)</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {records.map((r) => (
                <div key={r.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                    <span>v{r.version}</span>
                    <span>{new Date(r.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.note}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
