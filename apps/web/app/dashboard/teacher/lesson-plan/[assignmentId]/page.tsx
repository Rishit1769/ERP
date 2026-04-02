"use client";

import { use, useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";
import { Plus, X, CheckCircle2, Clock, Circle, ChevronLeft } from "lucide-react";
import Link from "next/link";

interface Topic {
  id: number;
  syllabus_topic_id: number | null;
  unit_name: string;
  topic_name: string;
  topic_description: string | null;
  num_lectures: number;
  weightage: number;
  order_no: number;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  lectures_taken: number;
  is_additional: number;
  notes: string | null;
  completed_at: string | null;
}

interface Unit {
  unit_name: string;
  topics: Topic[];
}

interface AssignmentInfo {
  subject_name: string;
  subject_code: string;
  type: string;
  batch_label: string | null;
  year: number;
  division_label: string;
  semester: number | null;
  total_lecture_hours: number | null;
}

const STATUS_ICONS = {
  PENDING: <Circle className="h-4 w-4 text-gray-400" />,
  IN_PROGRESS: <Clock className="h-4 w-4 text-blue-500" />,
  COMPLETED: <CheckCircle2 className="h-4 w-4 text-green-500" />,
};

const STATUS_LABELS = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
};

interface LessonPlanResponse {
  assignment: AssignmentInfo;
  lesson_plan_id: number | null;
  units: Unit[];
}

export default function LessonPlanDetailPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = use(params);

  const [assignment, setAssignment] = useState<AssignmentInfo | null>(null);
  const [lessonPlanId, setLessonPlanId] = useState<number | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  // Inline edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{
    status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
    lectures_taken: number;
    notes: string;
  }>({ status: "PENDING", lectures_taken: 0, notes: "" });
  const [saving, setSaving] = useState(false);

  // Additional topic modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTopic, setNewTopic] = useState({
    unit_name: "",
    topic_name: "",
    topic_description: "",
    num_lectures: "1",
    notes: "",
  });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadPlan();
  }, [assignmentId]);

  function loadPlan() {
    api.get<LessonPlanResponse>(`/lesson-plan/${assignmentId}`)
      .then(({ data }) => {
        setAssignment(data.assignment);
        setLessonPlanId(data.lesson_plan_id ?? null);
        setUnits(data.units ?? []);
      })
      .catch(() => toast.error("Failed to load lesson plan"))
      .finally(() => setLoading(false));
  }

  function startEdit(t: Topic) {
    setEditingId(t.id);
    setEditForm({
      status: t.status,
      lectures_taken: t.lectures_taken,
      notes: t.notes ?? "",
    });
  }

  async function saveEdit(topicId: number) {
    setSaving(true);
    try {
      await api.patch(`/lesson-plan/topic/${topicId}`, {
        status: editForm.status,
        lectures_taken: editForm.lectures_taken,
        notes: editForm.notes,
      });
      toast.success("Saved");
      setEditingId(null);
      loadPlan();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function quickStatus(topicId: number, next: "PENDING" | "IN_PROGRESS" | "COMPLETED") {
    try {
      await api.patch(`/lesson-plan/topic/${topicId}`, { status: next });
      loadPlan();
    } catch {
      toast.error("Update failed");
    }
  }

  async function deleteAdditional(topicId: number) {
    if (!confirm("Remove this additional topic?")) return;
    try {
      await api.delete(`/lesson-plan/additional-topic/${topicId}`);
      toast.success("Removed");
      loadPlan();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed");
    }
  }

  async function handleAddTopic() {
    if (!newTopic.unit_name.trim() || !newTopic.topic_name.trim()) {
      toast.error("Unit name and topic name are required");
      return;
    }
    setAdding(true);
    try {
      await api.post(`/lesson-plan/${assignmentId}/additional-topic`, {
        unit_name: newTopic.unit_name.trim(),
        topic_name: newTopic.topic_name.trim(),
        topic_description: newTopic.topic_description.trim() || undefined,
        num_lectures: parseInt(newTopic.num_lectures) || 1,
        notes: newTopic.notes.trim() || undefined,
      });
      toast.success("Additional topic added");
      setShowAddModal(false);
      setNewTopic({ unit_name: "", topic_name: "", topic_description: "", num_lectures: "1", notes: "" });
      loadPlan();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to add topic");
    } finally {
      setAdding(false);
    }
  }

  // Aggregate stats
  const allTopics = units.flatMap((u) => u.topics);
  const totalTopics = allTopics.length;
  const completedTopics = allTopics.filter((t) => t.status === "COMPLETED").length;
  const totalLecturesTaken = allTopics.reduce((s, t) => s + t.lectures_taken, 0);
  const progressPct = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        href={"/dashboard/teacher/lesson-plan" as any}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" /> Back to Lesson Plans
      </Link>

      {/* Assignment header */}
      {assignment && (
        <div>
          <h2 className="text-2xl font-bold">{assignment.subject_name}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {assignment.subject_code} · {assignment.type}
            {assignment.batch_label ? ` (${assignment.batch_label})` : ""} · Year{" "}
            {assignment.year} Div {assignment.division_label}
            {assignment.semester ? ` · Sem ${assignment.semester}` : ""}
            {assignment.total_lecture_hours ? ` · ${assignment.total_lecture_hours} hrs total` : ""}
          </p>
        </div>
      )}

      {/* Progress summary */}
      {lessonPlanId && (
        <Card>
          <CardContent className="py-4 space-y-2">
            <div className="flex justify-between text-sm font-medium">
              <span>
                {completedTopics}/{totalTopics} topics completed
              </span>
              <span>{progressPct}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-blue-500 h-3 rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">
              Total lectures taken: {totalLecturesTaken}
              {assignment?.total_lecture_hours ? ` / ${assignment.total_lecture_hours}` : ""}
            </p>
          </CardContent>
        </Card>
      )}

      {!lessonPlanId && (
        <Card>
          <CardContent className="py-8 text-center text-amber-700 bg-amber-50">
            No lesson plan exists for this assignment yet. The admin needs to upload a syllabus first.
          </CardContent>
        </Card>
      )}

      {/* Units + Topics */}
      {units.map((unit) => (
        <Card key={unit.unit_name}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-blue-700">{unit.unit_name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {unit.topics.map((t) => (
              <div
                key={t.id}
                className={`rounded-lg border p-3 ${
                  t.is_additional ? "border-dashed border-purple-300 bg-purple-50" : "bg-white"
                }`}
              >
                {editingId === t.id ? (
                  /* ── Inline Edit Form ── */
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">{t.topic_name}</p>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Status</label>
                        <select
                          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                          value={editForm.status}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              status: e.target.value as typeof f.status,
                            }))
                          }
                        >
                          <option value="PENDING">Pending</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="COMPLETED">Completed</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Lectures Taken</label>
                        <input
                          type="number"
                          min={0}
                          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                          value={editForm.lectures_taken}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              lectures_taken: parseInt(e.target.value) || 0,
                            }))
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Notes</label>
                      <textarea
                        rows={2}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm resize-none"
                        value={editForm.notes}
                        onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                        placeholder="Optional teaching notes…"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveEdit(t.id)} disabled={saving}>
                        {saving ? <Spinner className="h-3 w-3" /> : "Save"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* ── Read View ── */
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <button
                        title={`Current: ${STATUS_LABELS[t.status]}. Click to cycle.`}
                        onClick={() => {
                          const next =
                            t.status === "PENDING"
                              ? "IN_PROGRESS"
                              : t.status === "IN_PROGRESS"
                              ? "COMPLETED"
                              : "PENDING";
                          quickStatus(t.id, next);
                        }}
                        className="mt-0.5 shrink-0"
                      >
                        {STATUS_ICONS[t.status]}
                      </button>
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-medium ${
                            t.status === "COMPLETED" ? "line-through text-gray-400" : ""
                          }`}
                        >
                          {t.topic_name}
                          {t.is_additional ? (
                            <span className="ml-2 text-xs font-normal text-purple-600 bg-purple-100 rounded px-1">
                              Additional
                            </span>
                          ) : null}
                        </p>
                        {t.topic_description && (
                          <p className="text-xs text-gray-500 truncate mt-0.5">
                            {t.topic_description}
                          </p>
                        )}
                        <div className="flex gap-3 mt-1 text-xs text-gray-400">
                          <span>Planned: {t.num_lectures} lec</span>
                          <span>Taken: {t.lectures_taken}</span>
                          {t.weightage > 0 && <span>Wt: {t.weightage}%</span>}
                          {t.notes && (
                            <span className="italic truncate max-w-xs">"{t.notes}"</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => startEdit(t)}
                        className="text-xs text-blue-500 hover:text-blue-700 px-2 py-0.5 rounded hover:bg-blue-50"
                      >
                        Edit
                      </button>
                      {t.is_additional ? (
                        <button
                          onClick={() => deleteAdditional(t.id)}
                          className="text-red-400 hover:text-red-600 p-1"
                          title="Remove"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {/* Add additional topic button */}
      {lessonPlanId && (
        <Button variant="outline" onClick={() => setShowAddModal(true)} className="w-full">
          <Plus className="h-4 w-4 mr-2" /> Add Additional Topic
        </Button>
      )}

      {/* Add Additional Topic Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Add Additional Topic</h3>
              <button onClick={() => setShowAddModal(false)}>
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Add a topic you taught that was not in the official syllabus.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Unit Name *</label>
                <input
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  value={newTopic.unit_name}
                  onChange={(e) => setNewTopic((f) => ({ ...f, unit_name: e.target.value }))}
                  placeholder="e.g. Unit 3: Advanced Topics"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Topic Name *</label>
                <input
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  value={newTopic.topic_name}
                  onChange={(e) => setNewTopic((f) => ({ ...f, topic_name: e.target.value }))}
                  placeholder="e.g. Bonus: Graph Algorithms"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Description</label>
                <textarea
                  rows={2}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm resize-none"
                  value={newTopic.topic_description}
                  onChange={(e) =>
                    setNewTopic((f) => ({ ...f, topic_description: e.target.value }))
                  }
                  placeholder="Optional description…"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Lectures</label>
                <input
                  type="number"
                  min={1}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  value={newTopic.num_lectures}
                  onChange={(e) => setNewTopic((f) => ({ ...f, num_lectures: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Notes</label>
                <input
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  value={newTopic.notes}
                  onChange={(e) => setNewTopic((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Teaching notes…"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <Button onClick={handleAddTopic} disabled={adding}>
                {adding ? <Spinner className="h-4 w-4" /> : "Add Topic"}
              </Button>
              <Button variant="outline" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
