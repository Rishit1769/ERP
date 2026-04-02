"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";
import { X } from "lucide-react";

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

interface Student {
  erp_id: string;
  name: string;
  roll_no: string;
}

export default function RolesPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(true);

  // Assignment form state
  const [assignType, setAssignType] = useState<"subject" | "incharge" | "tg">("subject");
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedDivision, setSelectedDivision] = useState("");
  const [subjectType, setSubjectType] = useState<"THEORY" | "PRACTICAL">("THEORY");
  const [submitting, setSubmitting] = useState(false);

  // TG student picker state
  const [availableStudents, setAvailableStudents] = useState<Student[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [t, s, d] = await Promise.all([
          api.get<Teacher[]>("/roles/teachers"),
          api.get<Subject[]>("/roles/subjects"),
          api.get<Division[]>("/roles/divisions"),
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

  // Load available students when division changes for TG assignment
  useEffect(() => {
    if (assignType !== "tg" || !selectedDivision) {
      setAvailableStudents([]);
      setSelectedStudentIds([]);
      return;
    }
    setStudentsLoading(true);
    api.get<Student[]>(`/roles/students/${selectedDivision}`)
      .then(({ data }) => setAvailableStudents(data))
      .catch(() => setAvailableStudents([]))
      .finally(() => setStudentsLoading(false));
    setSelectedStudentIds([]);
  }, [assignType, selectedDivision]);

  function toggleStudent(erpId: string) {
    setSelectedStudentIds((prev) =>
      prev.includes(erpId) ? prev.filter((id) => id !== erpId) : [...prev, erpId]
    );
  }

  async function handleAssign() {
    if (!selectedTeacher && assignType !== "auto-tg") return;
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
        if (selectedStudentIds.length === 0) {
          toast.error("Please select at least 1 student");
          setSubmitting(false);
          return;
        }
        await api.post("/roles/assign-tg", {
          teacher_erp_id: selectedTeacher,
          division_id: Number(selectedDivision),
          student_erp_ids: selectedStudentIds,
        });
        // Refresh student list
        const { data } = await api.get<Student[]>(`/roles/students/${selectedDivision}`);
        setAvailableStudents(data);
        setSelectedStudentIds([]);
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
              onChange={(e) => {
                setAssignType(e.target.value as typeof assignType);
                setSelectedStudentIds([]);
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="subject">Subject Teacher</option>
              <option value="incharge">Class Incharge (max 2 per division)</option>
              <option value="tg">Teacher Guardian (select students manually)</option>
            </select>
          </div>

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

          {/* TG Student Picker */}
          {assignType === "tg" && selectedDivision && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Students ({selectedStudentIds.length} selected)
              </label>
              {studentsLoading ? (
                <Spinner />
              ) : availableStudents.length === 0 ? (
                <p className="text-sm text-gray-400">All students in this division are already assigned to a TG group.</p>
              ) : (
                <>
                  {/* Selected badges */}
                  {selectedStudentIds.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {selectedStudentIds.map((id) => {
                        const s = availableStudents.find((st) => st.erp_id === id);
                        return (
                          <span key={id} className="flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 text-xs px-2 py-0.5">
                            {s?.name ?? id}
                            <button onClick={() => toggleStudent(id)}><X className="h-3 w-3" /></button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <div className="max-h-48 overflow-y-auto rounded-md border border-gray-200 divide-y">
                    {availableStudents.map((st) => (
                      <label key={st.erp_id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.includes(st.erp_id)}
                          onChange={() => toggleStudent(st.erp_id)}
                          className="h-4 w-4 rounded border-gray-300 accent-blue-600"
                        />
                        <span className="text-sm">
                          <span className="font-medium">{st.name}</span>
                          <span className="text-gray-400 ml-2 text-xs">Roll {st.roll_no} · {st.erp_id}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-gray-400">Recommended: 20 students per TG group</p>
                </>
              )}
            </div>
          )}

          <Button
            onClick={handleAssign}
            disabled={
              submitting ||
              !selectedTeacher ||
              !selectedDivision ||
              (assignType === "subject" && !selectedSubject) ||
              (assignType === "tg" && selectedStudentIds.length === 0)
            }
          >
            {submitting ? "Assigning…" : "Assign"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
