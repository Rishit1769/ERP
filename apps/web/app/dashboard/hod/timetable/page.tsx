"use client";

import { useEffect, useState, useRef, type ChangeEvent, type FormEvent } from "react";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TeacherInfoPopup } from "@/components/ui/teacher-info-popup";
import toast from "react-hot-toast";
import { Upload, Download, Trash2 } from "lucide-react";

interface TimetableSlot {
  id: number;
  subject_name: string;
  teacher_name: string;
  teacher_erp_id: string;
  day: string;
  start_time: string;
  end_time: string;
  room: string;
  type: string;
  batch_label: string | null;
}

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAY_LABELS: Record<string, string> = {
  MON: "Monday", TUE: "Tuesday", WED: "Wednesday",
  THU: "Thursday", FRI: "Friday", SAT: "Saturday",
};

type Tab = "view" | "upload";

export default function HodTimetablePage() {
  const [tab, setTab] = useState<Tab>("view");

  // ── View tab ─────────────────────────────────────────────────────────────
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [divisions, setDivisions] = useState<{ id: number; year: number; label: string }[]>([]);
  const [selectedDiv, setSelectedDiv] = useState("");
  const [loading, setLoading] = useState(false);
  const [divsLoading, setDivsLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  // ── Upload tab ────────────────────────────────────────────────────────────
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    inserted: number; divisions_updated: number; errors: number; error_details: string[]
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<{ id: number; year: number; label: string }[]>("/roles/divisions").then(({ data }) => {
      setDivisions(data);
      setDivsLoading(false);
    }).catch(() => setDivsLoading(false));
  }, []);

  function loadSlots(divId: string) {
    if (!divId) return;
    setLoading(true);
    api.get<TimetableSlot[]>(`/timetable/division/${divId}`)
      .then(({ data }) => setSlots(data))
      .catch(() => setSlots([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (selectedDiv) loadSlots(selectedDiv);
    else setSlots([]);
  }, [selectedDiv]);

  async function handleClearDiv() {
    if (!selectedDiv) return;
    setClearing(true);
    try {
      await api.delete(`/timetable/division/${selectedDiv}`);
      toast.success("Timetable cleared for this division");
      setSlots([]);
    } catch {
      toast.error("Failed to clear timetable");
    } finally {
      setClearing(false);
    }
  }

  async function downloadTemplate() {
    try {
      const res = await api.get("/timetable/template", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "timetable_template.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not download template");
    }
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      const { data } = await api.post("/timetable/upload-csv", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadResult(data);
      toast.success(`${data.inserted} slot(s) uploaded across ${data.divisions_updated} division(s)`);
      // Refresh view tab if the updated division is selected
      if (selectedDiv) loadSlots(selectedDiv);
    } catch (err: any) {
      const d = err?.response?.data;
      setUploadResult(d ?? null);
      toast.error(d?.error || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      tab === t ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700"
    }`;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Timetable</h2>

      {/* Tabs */}
      <div className="flex border-b">
        <button className={tabClass("view")} onClick={() => setTab("view")}>View Timetable</button>
        <button className={tabClass("upload")} onClick={() => setTab("upload")}>Upload Timetable (CSV)</button>
      </div>

      {/* ── VIEW TAB ─────────────────────────────────────────────────────── */}
      {tab === "view" && (
        <>
          {divsLoading ? <Spinner /> : (
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedDiv}
                onChange={(e) => { setSelectedDiv(e.target.value); setSlots([]); }}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Select division…</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>Year {d.year} – Div {d.label}</option>
                ))}
              </select>

              {selectedDiv && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearDiv}
                  disabled={clearing}
                  className="text-red-600 border-red-300 hover:bg-red-50"
                >
                  {clearing ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4 mr-1" />}
                  Clear Timetable
                </Button>
              )}
            </div>
          )}

          {loading ? <Spinner /> : slots.length > 0 ? (
            <Card>
              <CardContent className="overflow-x-auto py-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-4">Day</th>
                      <th className="py-2 pr-4">Time</th>
                      <th className="py-2 pr-4">Subject</th>
                      <th className="py-2 pr-4">Teacher</th>
                      <th className="py-2 pr-4">Type</th>
                      <th className="py-2">Room</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DAYS.map((day) =>
                      slots
                        .filter((s) => s.day === day)
                        .sort((a, b) => a.start_time.localeCompare(b.start_time))
                        .map((s) => (
                          <tr key={s.id} className="border-b last:border-0">
                            <td className="py-2 pr-4 font-medium">{DAY_LABELS[day]}</td>
                            <td className="py-2 pr-4 text-gray-600">{s.start_time}–{s.end_time}</td>
                            <td className="py-2 pr-4">{s.subject_name}</td>
                            <td className="py-2 pr-4">
                              <TeacherInfoPopup erpId={s.teacher_erp_id} name={s.teacher_name} />
                            </td>
                            <td className="py-2 pr-4 text-xs text-gray-500">
                              {s.type}{s.batch_label ? ` (${s.batch_label})` : ""}
                            </td>
                            <td className="py-2 text-gray-500">{s.room}</td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : selectedDiv ? (
            <p className="text-gray-500">No timetable slots found for this division.</p>
          ) : null}
        </>
      )}

      {/* ── UPLOAD TAB ───────────────────────────────────────────────────── */}
      {tab === "upload" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Upload Timetable CSV</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800 space-y-1">
                <p className="font-medium">CSV format</p>
                <p className="text-xs font-mono">division_year, division_label, day, start_time, end_time, room, subject_code, teacher_erp_id, type, batch_label</p>
                <ul className="text-xs mt-1 space-y-0.5 text-blue-700">
                  <li>• <strong>day</strong>: MON, TUE, WED, THU, FRI, SAT</li>
                  <li>• <strong>time</strong>: HH:MM (24-hour, e.g. 09:00)</li>
                  <li>• <strong>type</strong>: THEORY or PRACTICAL</li>
                  <li>• <strong>batch_label</strong>: optional (e.g. Batch-A for practicals)</li>
                  <li>• Uploading <strong>replaces</strong> all existing slots for that division.</li>
                </ul>
              </div>

              <form onSubmit={handleUpload} className="space-y-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const f = e.target.files?.[0];
                    if (f?.name.endsWith(".csv")) { setUploadFile(f); setUploadResult(null); }
                    else toast.error("Please select a .csv file");
                  }}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                />
                {uploadFile && (
                  <p className="text-sm text-gray-600">
                    <strong>{uploadFile.name}</strong> ({(uploadFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
                <div className="flex gap-3">
                  <Button type="submit" disabled={uploading || !uploadFile}>
                    {uploading ? <><Spinner className="mr-2 h-4 w-4" />Uploading…</> : <><Upload className="mr-2 h-4 w-4" />Upload</>}
                  </Button>
                  <Button type="button" variant="outline" onClick={downloadTemplate}>
                    <Download className="mr-2 h-4 w-4" /> Download Template
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {uploadResult && (
            <Card>
              <CardHeader>
                <CardTitle>{uploadResult.errors === 0 ? "Upload Successful" : "Upload Complete with Errors"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-green-700">{uploadResult.inserted} slot(s) inserted across {uploadResult.divisions_updated} division(s).</p>
                {uploadResult.errors > 0 && (
                  <>
                    <p className="text-red-600">{uploadResult.errors} row(s) had errors:</p>
                    <ul className="space-y-1 text-sm text-red-500">
                      {uploadResult.error_details.map((e, i) => <li key={i}>• {e}</li>)}
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

