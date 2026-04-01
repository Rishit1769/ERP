"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";
import { Save, Settings } from "lucide-react";

interface Assignment {
  id: number;
  subject_name: string;
  division_name: string;
  type: "THEORY" | "PRACTICAL";
  batch_label: string | null;
}

interface Student {
  erp_id: string;
  name: string;
  roll_no: string;
}

interface ExperimentConfig {
  experiment_count: number;
  marks_per_experiment: number;
}

// marks[student_erp_id][experiment_no (0-indexed)] = value
type ExperimentMarks = Record<string, number[]>;

const EXAM_TYPES = [
  { value: "UT1",      label: "Unit Test 1" },
  { value: "UT2",      label: "Unit Test 2" },
  { value: "PRELIM",   label: "Prelim" },
  { value: "END_SEM",  label: "End Sem" },
  { value: "INTERNAL", label: "Internal" },
];

export default function TeacherMarksPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Theory state
  const [examType, setExamType] = useState("UT1");
  const [maxMarks, setMaxMarks] = useState(30);
  const [theoryMarks, setTheoryMarks] = useState<Record<string, number>>({});

  // Practical experiment state
  const [config, setConfig] = useState<ExperimentConfig>({ experiment_count: 10, marks_per_experiment: 10 });
  const [configDraft, setConfigDraft] = useState<ExperimentConfig>({ experiment_count: 10, marks_per_experiment: 10 });
  const [savingConfig, setSavingConfig] = useState(false);
  const [expMarks, setExpMarks] = useState<ExperimentMarks>({});

  const assignment = assignments.find((a) => String(a.id) === selectedId);
  const isPractical = assignment?.type === "PRACTICAL";

  // Load assignments on mount
  useEffect(() => {
    api.get("/attendance/my-assignments").then(({ data }) => setAssignments(data)).catch(() => {});
  }, []);

  // Load students + marks whenever selection changes
  const loadForAssignment = useCallback(async (assignmentId: string) => {
    if (!assignmentId) return;
    setLoadingStudents(true);
    try {
      const { data: studs } = await api.get(`/marks/students/${assignmentId}`);
      setStudents(studs);

      const asgn = assignments.find((a) => String(a.id) === assignmentId);
      if (!asgn) return;

      if (asgn.type === "PRACTICAL") {
        // Load experiment config
        const { data: cfg } = await api.get(`/marks/practical/config/${assignmentId}`);
        setConfig(cfg);
        setConfigDraft(cfg);

        // Load existing experiment marks
        const { data: existing } = await api.get(`/marks/practical/experiments/${assignmentId}`);
        const grid: ExperimentMarks = {};
        for (const s of studs) {
          grid[s.erp_id] = Array(cfg.experiment_count).fill(0);
        }
        for (const row of existing) {
          if (grid[row.student_erp_id]) {
            grid[row.student_erp_id][row.experiment_no - 1] = Number(row.marks_obtained);
          }
        }
        setExpMarks(grid);
      } else {
        // Theory: reset theory marks to 0
        const init: Record<string, number> = {};
        for (const s of studs) init[s.erp_id] = 0;
        setTheoryMarks(init);
      }
    } catch {
      toast.error("Failed to load student data");
    } finally {
      setLoadingStudents(false);
    }
  }, [assignments]);

  useEffect(() => {
    if (selectedId) loadForAssignment(selectedId);
  }, [selectedId, loadForAssignment]);

  async function handleSaveConfig() {
    if (!selectedId) return;
    setSavingConfig(true);
    try {
      const { data } = await api.post("/marks/practical/config", {
        subject_assignment_id: Number(selectedId),
        experiment_count: configDraft.experiment_count,
        marks_per_experiment: configDraft.marks_per_experiment,
      });
      setConfig(data);

      // Rebuild grid with new experiment count
      const newGrid: ExperimentMarks = {};
      for (const s of students) {
        const existing = expMarks[s.erp_id] ?? [];
        newGrid[s.erp_id] = Array.from(
          { length: data.experiment_count },
          (_, i) => existing[i] ?? 0
        );
      }
      setExpMarks(newGrid);
      toast.success(`Config saved: ${data.experiment_count} experiments × ${data.marks_per_experiment} marks`);
    } catch {
      toast.error("Failed to save config");
    } finally {
      setSavingConfig(false);
    }
  }

  function setExpMark(erpId: string, expIdx: number, value: number) {
    setExpMarks((prev) => {
      const row = [...(prev[erpId] ?? [])];
      row[expIdx] = value;
      return { ...prev, [erpId]: row };
    });
  }

  async function handleSaveExperimentMarks() {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      const records: Array<{ student_erp_id: string; experiment_no: number; marks_obtained: number }> = [];
      for (const s of students) {
        const row = expMarks[s.erp_id] ?? [];
        for (let i = 0; i < config.experiment_count; i++) {
          records.push({ student_erp_id: s.erp_id, experiment_no: i + 1, marks_obtained: row[i] ?? 0 });
        }
      }
      await api.post("/marks/practical/experiments", {
        subject_assignment_id: Number(selectedId),
        records,
      });
      toast.success("Experiment marks saved");
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveTheory() {
    if (!selectedId || !assignment) return;
    setSubmitting(true);
    try {
      await api.post("/marks/theory/assignment", {
        subject_assignment_id: Number(selectedId),
        exam_type: examType,
        max_marks: maxMarks,
        records: students.map((s) => ({
          student_erp_id: s.erp_id,
          marks: theoryMarks[s.erp_id] ?? 0,
        })),
      });
      toast.success("Theory marks saved");
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Enter Marks</h2>

      {/* Assignment selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Assignment</label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm min-w-[300px]"
        >
          <option value="">Select…</option>
          {assignments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.subject_name} — {a.division_name} ({a.type}{a.batch_label ? ` / Batch ${a.batch_label}` : ""})
            </option>
          ))}
        </select>
      </div>

      {loadingStudents && <Spinner />}

      {/* ── THEORY ── */}
      {!loadingStudents && !isPractical && students.length > 0 && (
        <>
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Exam Type</label>
              <select
                value={examType}
                onChange={(e) => setExamType(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {EXAM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Marks</label>
              <input
                type="number"
                min={1}
                max={200}
                value={maxMarks}
                onChange={(e) => setMaxMarks(Number(e.target.value))}
                className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <Card>
            <CardHeader><CardTitle>Student Marks</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {students.map((s) => (
                  <div key={s.erp_id} className="flex items-center gap-4 rounded-lg border px-4 py-2">
                    <span className="w-12 text-xs text-gray-400 shrink-0">{s.roll_no}</span>
                    <span className="flex-1 font-medium text-sm">{s.name}</span>
                    <input
                      type="number"
                      min={0}
                      max={maxMarks}
                      value={theoryMarks[s.erp_id] ?? 0}
                      onChange={(e) => setTheoryMarks((prev) => ({ ...prev, [s.erp_id]: Number(e.target.value) }))}
                      className="w-20 rounded border border-gray-300 px-2 py-1 text-sm text-center"
                    />
                    <span className="text-sm text-gray-400 w-12">/ {maxMarks}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <Button onClick={handleSaveTheory} disabled={submitting}>
                  <Save className="mr-2 h-4 w-4" />
                  {submitting ? "Saving…" : "Save Marks"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── PRACTICAL EXPERIMENTS ── */}
      {!loadingStudents && isPractical && (
        <>
          {/* Config card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Experiment Configuration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Number of Experiments
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={configDraft.experiment_count}
                    onChange={(e) =>
                      setConfigDraft((p) => ({ ...p, experiment_count: Number(e.target.value) }))
                    }
                    className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Marks per Experiment
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={configDraft.marks_per_experiment}
                    onChange={(e) =>
                      setConfigDraft((p) => ({ ...p, marks_per_experiment: Number(e.target.value) }))
                    }
                    className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <Button onClick={handleSaveConfig} disabled={savingConfig} variant="outline">
                  {savingConfig ? "Saving…" : "Save Configuration"}
                </Button>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                Total per student: {config.experiment_count} × {config.marks_per_experiment} ={" "}
                <span className="font-semibold text-gray-600">
                  {config.experiment_count * config.marks_per_experiment}
                </span>
              </p>
            </CardContent>
          </Card>

          {/* Experiment marks grid */}
          {students.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Experiment Marks</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-12">Roll</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 min-w-[140px]">Student</th>
                        {Array.from({ length: config.experiment_count }, (_, i) => (
                          <th key={i} className="px-2 py-2 text-center text-xs font-medium text-gray-500 w-16">
                            E{i + 1}
                          </th>
                        ))}
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 w-20">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s) => {
                        const row = expMarks[s.erp_id] ?? Array(config.experiment_count).fill(0);
                        const total = row.slice(0, config.experiment_count).reduce((a, b) => a + (b || 0), 0);
                        return (
                          <tr key={s.erp_id} className="border-b hover:bg-gray-50">
                            <td className="px-3 py-2 text-xs text-gray-400">{s.roll_no}</td>
                            <td className="px-3 py-2 font-medium">{s.name}</td>
                            {Array.from({ length: config.experiment_count }, (_, i) => (
                              <td key={i} className="px-1 py-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={config.marks_per_experiment}
                                  value={row[i] ?? 0}
                                  onChange={(e) => setExpMark(s.erp_id, i, Number(e.target.value))}
                                  className="w-14 rounded border border-gray-300 px-1 py-1 text-xs text-center"
                                />
                              </td>
                            ))}
                            <td className="px-3 py-2 text-center font-semibold text-sm">
                              {total}
                              <span className="text-xs text-gray-400">
                                /{config.experiment_count * config.marks_per_experiment}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4">
                  <Button onClick={handleSaveExperimentMarks} disabled={submitting}>
                    <Save className="mr-2 h-4 w-4" />
                    {submitting ? "Saving…" : "Save All Marks"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {students.length === 0 && !loadingStudents && selectedId && (
            <p className="text-gray-500">No students found for this assignment.</p>
          )}
        </>
      )}

      {!loadingStudents && !isPractical && students.length === 0 && selectedId && (
        <p className="text-gray-500">No students found for this assignment.</p>
      )}
    </div>
  );
}
