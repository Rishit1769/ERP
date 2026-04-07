"use client";

import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { TeacherInfoPopup } from "@/components/ui/teacher-info-popup";

interface TimetableSlot {
  id: number;
  day: string;
  start_time: string;
  end_time: string;
  room: string;
  subject_name: string;
  teacher_name: string;
  teacher_erp_id: string;
  year: number;
  label: string;
}

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAY_LABELS: Record<string, string> = {
  MON: "Monday", TUE: "Tuesday", WED: "Wednesday",
  THU: "Thursday", FRI: "Friday", SAT: "Saturday",
};

const SAMPLE_CSV = `dept_code,year,division,subject_code,teacher_erp_id,type,batch,day,start_time,end_time,room
COMPS,2,A,DS,E1002,THEORY,,MON,09:00,10:00,C-301
COMPS,2,A,DSL,E1003,PRACTICAL,P1,WED,14:00,16:00,C-Lab1
IT,1,A,MFCS,E1010,THEORY,,TUE,11:00,12:00,A-201`;

export default function AdminTimetablePage() {
  const [activeTab, setActiveTab] = useState<"view" | "import">("import");

  // ── View state ──────────────────────────────────────────────────────────────
  const [divisions, setDivisions] = useState<{ id: number; year: number; label: string; dept_code: string }[]>([]);
  const [selectedDiv, setSelectedDiv] = useState("");
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [divsLoading, setDivsLoading] = useState(true);

  // ── Import state ────────────────────────────────────────────────────────────
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    message: string;
    inserted: number;
    skipped: number;
    errors: number;
    skipped_details: string[];
    error_details: string[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<{ id: number; year: number; label: string; dept_code: string }[]>("/admin/divisions").then(({ data }) => {
      setDivisions(data);
      setDivsLoading(false);
    }).catch(() => setDivsLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedDiv) return;
    setViewLoading(true);
    api
      .get<TimetableSlot[]>(`/timetable/division/${selectedDiv}`)
      .then(({ data }) => setSlots(data))
      .catch(() => setSlots([]))
      .finally(() => setViewLoading(false));
  }, [selectedDiv]);

  async function handleImport() {
    if (!csvFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const form = new FormData();
      form.append("file", csvFile);
      const { data } = await api.post<{ message: string; inserted: number; skipped: number; errors: number; skipped_details: string[]; error_details: string[] }>("/timetable/import-csv", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportResult(data);
      if (selectedDiv) {
        api.get<TimetableSlot[]>(`/timetable/division/${selectedDiv}`).then(({ data }) => setSlots(data)).catch(() => {});
      }
    } catch (err: any) {
      setImportResult(
        err?.response?.data ?? {
          message: "Upload failed",
          inserted: 0,
          skipped: 0,
          errors: 1,
          skipped_details: [],
          error_details: [String(err)],
        }
      );
    } finally {
      setImporting(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "timetable_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Timetable Management</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("import")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "import" ? "bg-primary text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Import CSV
          </button>
          <button
            onClick={() => setActiveTab("view")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "view" ? "bg-primary text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            View
          </button>
        </div>
      </div>

      {/* ── Import Tab ───────────────────────────────────────────── */}
      {activeTab === "import" && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Upload Timetable CSV</CardTitle>
              <button
                onClick={downloadTemplate}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-100"
              >
                Download Template CSV
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-primary/90"
                onChange={(e) => {
                  setCsvFile(e.target.files?.[0] ?? null);
                  setImportResult(null);
                }}
              />
              <button
                onClick={handleImport}
                disabled={!csvFile || importing}
                className="rounded-md bg-primary px-4 py-2 text-sm text-white disabled:opacity-50 hover:bg-primary/90"
              >
                {importing ? "Uploading…" : "Import"}
              </button>

              {importResult && (
                <div
                  className={`rounded-md border p-4 text-sm ${
                    importResult.errors > 0 || importResult.skipped > 0
                      ? "border-yellow-300 bg-yellow-50"
                      : "border-green-300 bg-green-50"
                  }`}
                >
                  <p className="font-semibold">{importResult.message}</p>
                  <p className="text-gray-600">
                    Inserted: {importResult.inserted} · Skipped: {importResult.skipped} · Errors: {importResult.errors}
                  </p>
                  {importResult.skipped_details.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-yellow-700">Skipped rows ({importResult.skipped})</summary>
                      <ul className="mt-1 space-y-0.5 text-xs text-yellow-800">
                        {importResult.skipped_details.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </details>
                  )}
                  {importResult.error_details.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-red-700">Errors ({importResult.errors})</summary>
                      <ul className="mt-1 space-y-0.5 text-xs text-red-800">
                        {importResult.error_details.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── View Tab ─────────────────────────────────────────────── */}
      {activeTab === "view" && (
        <div className="space-y-4">
          {divsLoading ? (
            <Spinner />
          ) : (
            <select
              value={selectedDiv}
              onChange={(e) => setSelectedDiv(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Select division…</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.dept_code} · Year {d.year} – Div {d.label}
                </option>
              ))}
            </select>
          )}

          {viewLoading ? (
            <Spinner />
          ) : slots.length > 0 ? (
            <Card>
              <CardContent className="overflow-x-auto py-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-4">Day</th>
                      <th className="py-2 pr-4">Time</th>
                      <th className="py-2 pr-4">Subject</th>
                      <th className="py-2 pr-4">Teacher</th>
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
                            <td className="py-2 pr-4"><TeacherInfoPopup erpId={s.teacher_erp_id} name={s.teacher_name} /></td>
                            <td className="py-2 text-gray-500">{s.room}</td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : selectedDiv ? (
            <p className="text-gray-500">No timetable slots for this division.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
