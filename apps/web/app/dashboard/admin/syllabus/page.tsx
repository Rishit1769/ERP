"use client";

import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";
import { Upload, Trash2, ChevronDown, ChevronRight } from "lucide-react";

interface Subject {
  id: number;
  code: string;
  name: string;
  dept_id: number;
}

interface SyllabusMaster {
  id: number;
  subject_id: number;
  subject_code: string;
  subject_name: string;
  type: "THEORY" | "PRACTICAL";
  semester: number;
  total_lecture_hours: number;
  uploaded_by_name: string;
  updated_at: string;
  unit_count: number;
  topic_count: number;
}

interface SyllabusUploadResponse {
  message: string;
  syllabus_id: number;
  units: number;
  topics: number;
  row_errors: string[];
}

interface SyllabusDetail {
  id: number;
  subject_name: string;
  subject_code: string;
  type: string;
  semester: number;
  total_lecture_hours: number;
  units: Array<{
    id: number;
    unit_name: string;
    order_no: number;
    topics: Array<{
      id: number;
      topic_name: string;
      topic_description: string | null;
      num_lectures: number;
      weightage: number;
      order_no: number;
    }>;
  }>;
}

const SAMPLE_CSV = `unit_name,topic_name,topic_description,num_lectures,weightage
Unit 1: Introduction,What is a Database,Overview of DBMS and its applications,2,5.00
Unit 1: Introduction,Types of Database Models,Relational vs NoSQL,2,5.00
Unit 2: SQL,DDL Commands,CREATE TABLE DROP ALTER,3,10.00
Unit 2: SQL,DML Commands,INSERT UPDATE DELETE SELECT,4,15.00`;

export default function AdminSyllabusPage() {
  const [activeTab, setActiveTab] = useState<"list" | "upload">("list");

  // ── List state ──────────────────────────────────────────────────────────────
  const [syllabi, setSyllabi] = useState<SyllabusMaster[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SyllabusDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // ── Upload state ────────────────────────────────────────────────────────────
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    subject_id: "",
    type: "THEORY",
    semester: "1",
    total_lecture_hours: "48",
  });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSyllabi();
    api.get<Subject[]>("/admin/subjects?all=true").then(({ data }) => {
      setSubjects(data);
      setSubjectsLoading(false);
    }).catch(() => setSubjectsLoading(false));
  }, []);

  function loadSyllabi() {
    setListLoading(true);
    api.get<SyllabusMaster[]>("/admin/syllabus").then(({ data }) => {
      setSyllabi(data);
    }).catch(() => {}).finally(() => setListLoading(false));
  }

  async function toggleDetail(id: number) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setDetailLoading(true);
    try {
      const { data } = await api.get<SyllabusDetail>(`/admin/syllabus/${id}`);
      setDetail(data);
    } catch {
      toast.error("Failed to load syllabus detail");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete syllabus for "${name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/syllabus/${id}`);
      toast.success("Syllabus deleted");
      setSyllabi((prev) => prev.filter((s) => s.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch {
      toast.error("Failed to delete");
    }
  }

  async function handleUpload() {
    if (!csvFile) { toast.error("Select a CSV file first"); return; }
    if (!form.subject_id) { toast.error("Select a subject"); return; }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", csvFile);
      fd.append("subject_id", form.subject_id);
      fd.append("type", form.type);
      fd.append("semester", form.semester);
      fd.append("total_lecture_hours", form.total_lecture_hours);

      const { data } = await api.post<SyllabusUploadResponse>("/admin/syllabus/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      toast.success(data.message);
      setCsvFile(null);
      if (fileRef.current) fileRef.current.value = "";
      loadSyllabi();
      setActiveTab("list");

      if (data.row_errors?.length > 0) {
        toast.error(`${data.row_errors.length} row errors — check console`, { duration: 5000 });
        console.warn("[Syllabus Upload] Row errors:", data.row_errors);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "syllabus_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Syllabus Management</h2>
        <div className="flex gap-2">
          <Button
            variant={activeTab === "list" ? "primary" : "outline"}
            onClick={() => setActiveTab("list")}
          >
            All Syllabi
          </Button>
          <Button
            variant={activeTab === "upload" ? "primary" : "outline"}
            onClick={() => setActiveTab("upload")}
          >
            <Upload className="h-4 w-4 mr-2" /> Upload CSV
          </Button>
        </div>
      </div>

      {/* ── LIST TAB ── */}
      {activeTab === "list" && (
        <div className="space-y-4">
          {listLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : syllabi.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                No syllabi uploaded yet. Use the Upload CSV tab to add one.
              </CardContent>
            </Card>
          ) : (
            syllabi.map((s) => (
              <Card key={s.id} className="overflow-hidden">
                <CardContent className="p-0">
                  {/* Header row */}
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleDetail(s.id)}
                  >
                    <div className="flex items-center gap-3">
                      {expandedId === s.id ? (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      )}
                      <div>
                        <p className="font-semibold">
                          {s.subject_name}{" "}
                          <span className="text-xs text-gray-500">({s.subject_code})</span>
                        </p>
                        <p className="text-sm text-gray-500">
                          Sem {s.semester} · {s.type} · {s.total_lecture_hours} hrs ·{" "}
                          {s.unit_count} units · {s.topic_count} topics
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">
                        by {s.uploaded_by_name} ·{" "}
                        {new Date(s.updated_at).toLocaleDateString()}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(s.id, `${s.subject_name} Sem ${s.semester} ${s.type}`);
                        }}
                        className="text-red-400 hover:text-red-600 p-1"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Detail expand */}
                  {expandedId === s.id && (
                    <div className="border-t px-4 pb-4 bg-gray-50">
                      {detailLoading || detail?.id !== s.id ? (
                        <div className="py-4 flex justify-center"><Spinner /></div>
                      ) : (
                        <div className="space-y-4 pt-4">
                          {detail?.units.map((unit) => (
                            <div key={unit.id}>
                              <p className="font-semibold text-sm text-blue-700 mb-2">
                                {unit.unit_name}
                              </p>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="text-left text-xs text-gray-500 border-b">
                                      <th className="pb-1 pr-4">#</th>
                                      <th className="pb-1 pr-4">Topic</th>
                                      <th className="pb-1 pr-4">Description</th>
                                      <th className="pb-1 pr-4 text-center">Lectures</th>
                                      <th className="pb-1 text-center">Weightage</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {unit.topics.map((t) => (
                                      <tr key={t.id} className="border-b border-gray-100 last:border-0">
                                        <td className="py-1 pr-4 text-gray-400">{t.order_no}</td>
                                        <td className="py-1 pr-4 font-medium">{t.topic_name}</td>
                                        <td className="py-1 pr-4 text-gray-500 max-w-xs truncate">
                                          {t.topic_description ?? "—"}
                                        </td>
                                        <td className="py-1 pr-4 text-center">{t.num_lectures}</td>
                                        <td className="py-1 text-center">{t.weightage}%</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── UPLOAD TAB ── */}
      {activeTab === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Syllabus CSV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* CSV format help */}
            <div className="rounded-md bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800 space-y-1">
              <p className="font-semibold">Required CSV columns:</p>
              <code className="block text-xs bg-white border border-blue-100 rounded px-2 py-1">
                unit_name, topic_name, topic_description, num_lectures, weightage
              </code>
              <p className="text-xs text-blue-600">
                Group topics under units by repeating the same unit_name. The upload will replace any
                existing syllabus for the selected subject / type / semester.
              </p>
              <button
                onClick={downloadTemplate}
                className="text-xs underline text-blue-700 hover:text-blue-900"
              >
                Download Template CSV
              </button>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
              {subjectsLoading ? (
                <Spinner />
              ) : (
                <select
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={form.subject_id}
                  onChange={(e) => setForm((f) => ({ ...f, subject_id: e.target.value }))}
                >
                  <option value="">Select subject…</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Type + Semester + Hours */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                <select
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                >
                  <option value="THEORY">Theory</option>
                  <option value="PRACTICAL">Practical</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Semester *</label>
                <select
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={form.semester}
                  onChange={(e) => setForm((f) => ({ ...f, semester: e.target.value }))}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                    <option key={s} value={s}>Semester {s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Lecture Hours *</label>
                <input
                  type="number"
                  min={1}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={form.total_lecture_hours}
                  onChange={(e) => setForm((f) => ({ ...f, total_lecture_hours: e.target.value }))}
                />
              </div>
            </div>

            {/* File */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CSV File *</label>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
                className="block text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0
                           file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold
                           file:text-blue-700 hover:file:bg-blue-100"
              />
              {csvFile && (
                <p className="mt-1 text-xs text-gray-500">Selected: {csvFile.name}</p>
              )}
            </div>

            <Button onClick={handleUpload} disabled={uploading || !csvFile || !form.subject_id}>
              {uploading ? <><Spinner className="h-4 w-4 mr-2" /> Uploading…</> : "Upload Syllabus"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
