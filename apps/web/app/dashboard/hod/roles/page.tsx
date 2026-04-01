"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";

interface Teacher {
  erp_id: string;
  name: string;
}

interface Subject {
  id: number;
  code: string;
  name: string;
}

interface Division {
  id: number;
  year: number;
  label: string;
}

export default function RolesPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(true);

  // Assignment form state
  const [assignType, setAssignType] = useState<"subject" | "incharge" | "tg" | "auto-tg">("subject");
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedDivision, setSelectedDivision] = useState("");
  const [subjectType, setSubjectType] = useState<"THEORY" | "PRACTICAL">("THEORY");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [t, s, d] = await Promise.all([
          api.get("/roles/teachers"),
          api.get("/roles/subjects"),
          api.get("/roles/divisions"),
        ]);
        setTeachers(t.data);
        setSubjects(s.data);
        setDivisions(d.data);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleAssign() {
    setSubmitting(true);
    try {
      if (assignType === "subject") {
        await api.post("/roles/assign-subject", {
          teacher_erp_id: selectedTeacher,
          subject_id: Number(selectedSubject),
          division_id: Number(selectedDivision),
          type: subjectType,
        });
      } else if (assignType === "incharge") {
        await api.post("/roles/assign-class-incharge", {
          teacher_erp_id: selectedTeacher,
          division_id: Number(selectedDivision),
        });
      } else if (assignType === "tg") {
        await api.post("/roles/assign-tg", {
          teacher_erp_id: selectedTeacher,
          division_id: Number(selectedDivision),
        });
      } else {
        await api.post("/roles/auto-assign-tg", {
          division_id: Number(selectedDivision),
        });
      }
      toast.success("Assignment successful");
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
      <h2 className="text-2xl font-bold">Assign Roles</h2>

      <Card>
        <CardHeader><CardTitle>New Assignment</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assignment Type</label>
            <select
              value={assignType}
              onChange={(e) => setAssignType(e.target.value as typeof assignType)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="subject">Subject Teacher</option>
              <option value="incharge">Class Incharge</option>
              <option value="tg">Teacher Guardian</option>
              <option value="auto-tg">Auto-Assign TG (20 per group)</option>
            </select>
          </div>

          {assignType !== "auto-tg" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teacher</label>
              <select
                value={selectedTeacher}
                onChange={(e) => setSelectedTeacher(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Select teacher…</option>
                {teachers.map((t) => (
                  <option key={t.erp_id} value={t.erp_id}>
                    {t.name} ({t.erp_id})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Division</label>
            <select
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Select division…</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  Year {d.year} – Div {d.label}
                </option>
              ))}
            </select>
          </div>

          {assignType === "subject" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select subject…</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={subjectType}
                  onChange={(e) => setSubjectType(e.target.value as "THEORY" | "PRACTICAL")}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="THEORY">Theory</option>
                  <option value="PRACTICAL">Practical</option>
                </select>
              </div>
            </>
          )}

          <Button onClick={handleAssign} disabled={submitting}>
            {submitting ? "Assigning…" : "Assign"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
