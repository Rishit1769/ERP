"use client";

import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

interface ScheduleEvent {
  id: number;
  event_date: string;
  event_type: "HOLIDAY" | "EXAM" | "EVENT" | "EXTRA_CLASS" | "OTHER";
  title: string;
  description: string | null;
  dept_code: string | null;
  created_by: string;
}

const EVENT_BADGES: Record<string, string> = {
  HOLIDAY:     "bg-red-100 text-red-700",
  EXAM:        "bg-orange-100 text-orange-700",
  EVENT:       "bg-blue-100 text-blue-700",
  EXTRA_CLASS: "bg-green-100 text-green-700",
  OTHER:       "bg-gray-100 text-gray-700",
};

const SAMPLE_CSV = `date,type,title,description,dept_code
2026-01-26,HOLIDAY,Republic Day,,
2026-04-14,HOLIDAY,Dr. Ambedkar Jayanti,,
2026-04-18,EVENT,Cultural Fest,Annual inter-college cultural festival,
2026-05-10,EXAM,Mid Term 1 Begins,,COMPS`;

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export default function SemesterSchedulePage() {
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    message: string;
    inserted: number;
    errors: number;
    error_details: string[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function loadEvents() {
    setLoading(true);
    api
      .get<ScheduleEvent[]>("/admin/semester-schedule", { params: { year: filterYear } })
      .then(({ data }) => setEvents(data))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadEvents(); }, [filterYear]);

  async function handleImport() {
    if (!csvFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const form = new FormData();
      form.append("file", csvFile);
      const { data } = await api.post<{ message: string; inserted: number; errors: number; error_details: string[] }>("/admin/semester-schedule/import", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportResult(data);
      loadEvents();
    } catch (err: any) {
      setImportResult(
        err?.response?.data ?? {
          message: "Upload failed",
          inserted: 0,
          errors: 1,
          error_details: [String(err)],
        }
      );
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
      setCsvFile(null);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this event?")) return;
    await api.delete(`/admin/semester-schedule/${id}`);
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  function downloadTemplate() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "semester_schedule_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Semester Schedule</h2>

      {/* ── Import Section ──────────────────────────────────────────── */}
      <Card>
        <CardHeader><CardTitle>Import Academic Calendar CSV</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-gray-50 p-3 space-y-2">
            <p className="text-sm font-medium text-gray-700">CSV Format</p>
            <div className="font-mono text-xs text-gray-600">
              date, type, title, description, dept_code
            </div>
            <ul className="space-y-1 text-xs text-gray-500">
              <li><strong>date</strong>: YYYY-MM-DD</li>
              <li><strong>type</strong>: HOLIDAY | EXAM | EVENT | EXTRA_CLASS | OTHER</li>
              <li><strong>description</strong>: optional</li>
              <li><strong>dept_code</strong>: optional — leave blank for institute-wide events</li>
            </ul>
            <button
              onClick={downloadTemplate}
              className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-100"
            >
              Download Template CSV
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="block text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-primary/90"
              onChange={(e) => { setCsvFile(e.target.files?.[0] ?? null); setImportResult(null); }}
            />
            <button
              onClick={handleImport}
              disabled={!csvFile || importing}
              className="rounded-md bg-primary px-4 py-2 text-sm text-white disabled:opacity-50 hover:bg-primary/90"
            >
              {importing ? "Uploading…" : "Import"}
            </button>
          </div>

          {importResult && (
            <div
              className={`rounded-md border p-4 text-sm ${
                importResult.errors > 0 ? "border-yellow-300 bg-yellow-50" : "border-green-300 bg-green-50"
              }`}
            >
              <p className="font-semibold">{importResult.message}</p>
              <p className="text-gray-600">Inserted: {importResult.inserted} · Errors: {importResult.errors}</p>
              {importResult.error_details.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-red-700">Errors</summary>
                  <ul className="mt-1 space-y-0.5 text-xs text-red-800">
                    {importResult.error_details.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Event List ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Schedule Events</CardTitle>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : events.length === 0 ? (
            <p className="text-center text-gray-500 py-6">No events for {filterYear}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500 text-xs uppercase">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Title</th>
                    <th className="py-2 pr-4">Description</th>
                    <th className="py-2 pr-4">Scope</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2 pr-4 whitespace-nowrap text-gray-700">{formatDate(ev.event_date)}</td>
                      <td className="py-2 pr-4">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${EVENT_BADGES[ev.event_type]}`}>
                          {ev.event_type}
                        </span>
                      </td>
                      <td className="py-2 pr-4 font-medium">{ev.title}</td>
                      <td className="py-2 pr-4 text-gray-500 max-w-xs truncate">{ev.description ?? "—"}</td>
                      <td className="py-2 pr-4">
                        {ev.dept_code ? (
                          <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{ev.dept_code}</span>
                        ) : (
                          <span className="text-xs text-gray-400">All depts</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => handleDelete(ev.id)}
                          className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
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
