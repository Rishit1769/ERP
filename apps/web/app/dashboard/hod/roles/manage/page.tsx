"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";

interface SubjectAssignment {
  id: number;
  teacher_erp_id: string;
  teacher_name: string;
  subject_code: string;
  subject_name: string;
  year: number;
  division: string;
  type: "THEORY" | "PRACTICAL";
  batch_label: string | null;
}

interface ClassIncharge {
  teacher_erp_id: string;
  teacher_name: string;
  year: number;
  division: string;
}

interface Teacher {
  erp_id: string;
  name: string;
  roles: string;
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

interface EditingAssignment {
  id: number;
  teacher_erp_id: string;
  subject_id: string;
  type: "THEORY" | "PRACTICAL";
  batch_label: string;
}

export default function ManageAssignmentsPage() {
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<SubjectAssignment[]>([]);
  const [classIncharges, setClassIncharges] = useState<ClassIncharge[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);

  // Editing state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditingAssignment | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Bulk reassign state
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkDivision, setBulkDivision] = useState("");
  const [bulkRows, setBulkRows] = useState<
    Array<{ teacher_erp_id: string; subject_id: string; type: "THEORY" | "PRACTICAL"; batch_label: string }>
  >([{ teacher_erp_id: "", subject_id: "", type: "THEORY", batch_label: "" }]);

  const loadData = useCallback(async () => {
    try {
      const [aRes, tRes, sRes, dRes] = await Promise.all([
        api.get("/roles/assignments"),
        api.get("/roles/teachers"),
        api.get("/roles/subjects"),
        api.get("/roles/divisions"),
      ]);
      setAssignments(aRes.data.subject_assignments || []);
      setClassIncharges(aRes.data.class_incharges || []);
      setTeachers(tRes.data);
      setSubjects(sRes.data);
      setDivisions(dRes.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function startEdit(a: SubjectAssignment) {
    setEditingId(a.id);
    setEditForm({
      id: a.id,
      teacher_erp_id: a.teacher_erp_id,
      subject_id: subjects.find((s) => s.code === a.subject_code)?.id.toString() || "",
      type: a.type,
      batch_label: a.batch_label || "",
    });
  }

  async function saveEdit() {
    if (!editForm) return;
    setSubmitting(true);
    try {
      await api.put(`/roles/assignment/${editForm.id}`, {
        teacher_erp_id: editForm.teacher_erp_id,
        subject_id: Number(editForm.subject_id) || undefined,
        type: editForm.type,
        batch_label: editForm.batch_label || null,
      });
      toast.success("Assignment updated");
      setEditingId(null);
      setEditForm(null);
      await loadData();
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Update failed"
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteAssignment(id: number) {
    if (!confirm("Remove this subject assignment? Related timetable slots will also be removed.")) return;
    try {
      await api.delete(`/roles/assignment/${id}`);
      toast.success("Assignment removed");
      await loadData();
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Delete failed"
      );
    }
  }

  async function updateClassIncharge(divisionLabel: string, year: number, teacherErpId: string) {
    const div = divisions.find((d) => d.label === divisionLabel && d.year === year);
    if (!div) return;
    try {
      await api.put(`/roles/class-incharge/${div.id}`, { teacher_erp_id: teacherErpId });
      toast.success("Class incharge updated");
      await loadData();
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Update failed"
      );
    }
  }

  async function handleBulkReassign() {
    if (!bulkDivision) { toast.error("Select a division"); return; }
    const valid = bulkRows.filter((r) => r.teacher_erp_id && r.subject_id);
    if (valid.length === 0) { toast.error("Add at least one assignment"); return; }

    if (!confirm(`This will remove ALL existing subject assignments for this division and create ${valid.length} new ones. Continue?`)) return;

    setSubmitting(true);
    try {
      await api.post("/roles/bulk-reassign", {
        division_id: Number(bulkDivision),
        assignments: valid.map((r) => ({
          teacher_erp_id: r.teacher_erp_id,
          subject_id: Number(r.subject_id),
          type: r.type,
          batch_label: r.batch_label || null,
        })),
      });
      toast.success("Bulk reassignment complete");
      setBulkMode(false);
      setBulkRows([{ teacher_erp_id: "", subject_id: "", type: "THEORY", batch_label: "" }]);
      await loadData();
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Bulk reassign failed"
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Manage Teacher Assignments</h2>
        <Button variant={bulkMode ? "destructive" : "primary"} onClick={() => setBulkMode(!bulkMode)}>
          {bulkMode ? "Cancel Bulk Mode" : "Semester Bulk Reassign"}
        </Button>
      </div>

      {/* ── Bulk Reassign Panel ─────────────────────────────────────── */}
      {bulkMode && (
        <Card className="border-orange-300">
          <CardHeader>
            <CardTitle>Semester Bulk Reassign</CardTitle>
            <p className="text-sm text-gray-500">
              Clear all subject assignments for a division and create new ones.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Division</label>
              <select
                value={bulkDivision}
                onChange={(e) => setBulkDivision(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Select division…</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    Year {d.year} – {d.label}
                  </option>
                ))}
              </select>
            </div>

            {bulkRows.map((row, i) => (
              <div key={i} className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500">Teacher</label>
                  <select
                    value={row.teacher_erp_id}
                    onChange={(e) => {
                      const next = [...bulkRows];
                      next[i].teacher_erp_id = e.target.value;
                      setBulkRows(next);
                    }}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">Select…</option>
                    {teachers.map((t) => (
                      <option key={t.erp_id} value={t.erp_id}>{t.name} ({t.erp_id})</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-500">Subject</label>
                  <select
                    value={row.subject_id}
                    onChange={(e) => {
                      const next = [...bulkRows];
                      next[i].subject_id = e.target.value;
                      setBulkRows(next);
                    }}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">Select…</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                </div>
                <div className="w-28">
                  <label className="block text-xs text-gray-500">Type</label>
                  <select
                    value={row.type}
                    onChange={(e) => {
                      const next = [...bulkRows];
                      next[i].type = e.target.value as "THEORY" | "PRACTICAL";
                      setBulkRows(next);
                    }}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    <option value="THEORY">Theory</option>
                    <option value="PRACTICAL">Practical</option>
                  </select>
                </div>
                <div className="w-24">
                  <label className="block text-xs text-gray-500">Batch</label>
                  <input
                    value={row.batch_label}
                    onChange={(e) => {
                      const next = [...bulkRows];
                      next[i].batch_label = e.target.value;
                      setBulkRows(next);
                    }}
                    placeholder="e.g. A"
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <Button
                  variant="ghost"
                  className="text-red-500 px-2"
                  onClick={() => setBulkRows(bulkRows.filter((_, j) => j !== i))}
                  disabled={bulkRows.length <= 1}
                >
                  ×
                </Button>
              </div>
            ))}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setBulkRows([...bulkRows, { teacher_erp_id: "", subject_id: "", type: "THEORY", batch_label: "" }])}
              >
                + Add Row
              </Button>
              <Button onClick={handleBulkReassign} disabled={submitting}>
                {submitting ? "Reassigning…" : "Apply Bulk Reassign"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Subject Assignments Table ───────────────────────────────── */}
      <Card>
        <CardHeader><CardTitle>Subject Assignments</CardTitle></CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <p className="text-gray-500 text-sm">No subject assignments found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2 pr-4">Teacher</th>
                    <th className="pb-2 pr-4">Subject</th>
                    <th className="pb-2 pr-4">Division</th>
                    <th className="pb-2 pr-4">Type</th>
                    <th className="pb-2 pr-4">Batch</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => (
                    <tr key={a.id} className="border-b last:border-0">
                      {editingId === a.id && editForm ? (
                        <>
                          <td className="py-2 pr-4">
                            <select
                              value={editForm.teacher_erp_id}
                              onChange={(e) => setEditForm({ ...editForm, teacher_erp_id: e.target.value })}
                              className="w-full rounded border px-2 py-1 text-sm"
                            >
                              {teachers.map((t) => (
                                <option key={t.erp_id} value={t.erp_id}>{t.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 pr-4">
                            <select
                              value={editForm.subject_id}
                              onChange={(e) => setEditForm({ ...editForm, subject_id: e.target.value })}
                              className="w-full rounded border px-2 py-1 text-sm"
                            >
                              {subjects.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 pr-4">Y{a.year} {a.division}</td>
                          <td className="py-2 pr-4">
                            <select
                              value={editForm.type}
                              onChange={(e) => setEditForm({ ...editForm, type: e.target.value as "THEORY" | "PRACTICAL" })}
                              className="rounded border px-2 py-1 text-sm"
                            >
                              <option value="THEORY">Theory</option>
                              <option value="PRACTICAL">Practical</option>
                            </select>
                          </td>
                          <td className="py-2 pr-4">
                            <input
                              value={editForm.batch_label}
                              onChange={(e) => setEditForm({ ...editForm, batch_label: e.target.value })}
                              className="w-16 rounded border px-2 py-1 text-sm"
                              placeholder="–"
                            />
                          </td>
                          <td className="py-2 flex gap-1">
                            <Button size="sm" onClick={saveEdit} disabled={submitting}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditForm(null); }}>Cancel</Button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 pr-4">{a.teacher_name}<br /><span className="text-xs text-gray-400">{a.teacher_erp_id}</span></td>
                          <td className="py-2 pr-4">{a.subject_name}<br /><span className="text-xs text-gray-400">{a.subject_code}</span></td>
                          <td className="py-2 pr-4">Y{a.year} {a.division}</td>
                          <td className="py-2 pr-4">{a.type}</td>
                          <td className="py-2 pr-4">{a.batch_label || "–"}</td>
                          <td className="py-2 flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => startEdit(a)}>Edit</Button>
                            <Button size="sm" variant="destructive" onClick={() => deleteAssignment(a.id)}>Remove</Button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Class Incharges ─────────────────────────────────────────── */}
      <Card>
        <CardHeader><CardTitle>Class Incharges</CardTitle></CardHeader>
        <CardContent>
          {classIncharges.length === 0 ? (
            <p className="text-gray-500 text-sm">No class incharges assigned.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2 pr-4">Division</th>
                    <th className="pb-2 pr-4">Current Incharge</th>
                    <th className="pb-2">Reassign To</th>
                  </tr>
                </thead>
                <tbody>
                  {classIncharges.map((ci) => (
                    <tr key={`${ci.year}-${ci.division}`} className="border-b last:border-0">
                      <td className="py-2 pr-4">Y{ci.year} {ci.division}</td>
                      <td className="py-2 pr-4">{ci.teacher_name} ({ci.teacher_erp_id})</td>
                      <td className="py-2">
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) {
                              updateClassIncharge(ci.division, ci.year, e.target.value);
                              e.target.value = "";
                            }
                          }}
                          className="rounded border px-2 py-1 text-sm"
                        >
                          <option value="">Change…</option>
                          {teachers
                            .filter((t) => t.erp_id !== ci.teacher_erp_id)
                            .map((t) => (
                              <option key={t.erp_id} value={t.erp_id}>{t.name}</option>
                            ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
