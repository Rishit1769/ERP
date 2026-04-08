"use client";

import { useState, useRef, type ChangeEvent, type FormEvent } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";
import { Upload, CheckCircle, XCircle, Download } from "lucide-react";

interface ValidationRow {
  _rowIndex: number;
  _errors?: Record<string, string>;
  _valid: boolean;
  [key: string]: unknown;
}

interface UserImportResult {
  imported: number;
  students: number;
  employees: number;
  skippedDuplicates?: number;
  validationErrors?: ValidationRow[];
}

interface SubjectImportResult {
  inserted: number;
  skipped: number;
  errors: number;
  error_details: string[];
}

const USERS_TEMPLATE_CSV = `erp_id,name,email,phone,role,department,year,semester
S2025COMPSA01,Jane Smith,jane.smith@tcetmumbai.in,9876543210,student,COMPS,1,1
E1001,Prof. Raj Kumar,raj.kumar@tcetmumbai.in,9123456780,teacher,COMPS,,
E1002,Dr. Priya HOD,priya.hod@tcetmumbai.in,9012345678,HOD,IT,,
`;

type Tab = "users" | "subjects";

export default function ImportPage() {
  const [tab, setTab] = useState<Tab>("users");

  // ── Users import state ──
  const [userFile, setUserFile] = useState<File | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [userResult, setUserResult] = useState<UserImportResult | null>(null);
  const userFileRef = useRef<HTMLInputElement>(null);

  // ── Subjects import state ──
  const [subFile, setSubFile] = useState<File | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [subResult, setSubResult] = useState<SubjectImportResult | null>(null);
  const subFileRef = useRef<HTMLInputElement>(null);

  // ── Users import ─────────────────────────────────────────────────────────
  function downloadUserTemplate() {
    const blob = new Blob([USERS_TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "users_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleUserUpload(e: FormEvent) {
    e.preventDefault();
    if (!userFile) return;
    setUserLoading(true);
    setUserResult(null);
    try {
      const formData = new FormData();
      formData.append("file", userFile);
      const { data } = await api.post("/import/csv", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUserResult({
        imported: data.imported,
        students: data.students,
        employees: data.employees,
        skippedDuplicates: data.skipped_duplicates ?? 0,
      });
      const msg = data.skipped_duplicates > 0
        ? `Imported ${data.imported} users (${data.skipped_duplicates} skipped — already exist)`
        : `Successfully imported ${data.imported} users`;
      toast.success(msg);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { error?: string; message?: string; rows?: ValidationRow[]; error_count?: number } } };
      if (axiosErr.response?.status === 422 && axiosErr.response.data?.rows) {
        const rows = axiosErr.response.data.rows;
        const errorRows = rows.filter((r: ValidationRow) => r._errors);
        setUserResult({ imported: 0, students: 0, employees: 0, validationErrors: errorRows });
        toast.error(`${axiosErr.response.data.error_count} validation errors found`);
      } else if (axiosErr.response?.status === 422) {
        toast.error(axiosErr.response.data?.error || "Validation failed", { duration: 8000 });
      } else {
        const errMsg = axiosErr.response?.data?.message || axiosErr.response?.data?.error || "Import failed";
        toast.error(errMsg, { duration: 8000 });
      }
    } finally {
      setUserLoading(false);
    }
  }

  // ── Subjects import ──────────────────────────────────────────────────────
  async function downloadSubjectTemplate() {
    try {
      const res = await api.get("/admin/subjects/template", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "subjects_template.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not download template");
    }
  }

  async function handleSubjectUpload(e: FormEvent) {
    e.preventDefault();
    if (!subFile) return;
    setSubLoading(true);
    setSubResult(null);
    try {
      const formData = new FormData();
      formData.append("file", subFile);
      const { data } = await api.post("/admin/subjects/import-csv", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setSubResult(data);
      toast.success(`${data.inserted} subject(s) imported`);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string; error_details?: string[] } } };
      const detail = axiosErr.response?.data?.error_details?.[0] || axiosErr.response?.data?.error || "Import failed";
      setSubResult(axiosErr.response?.data as SubjectImportResult ?? null);
      toast.error(detail);
    } finally {
      setSubLoading(false);
    }
  }

  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      tab === t ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700"
    }`;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Import</h2>

      {/* Tabs */}
      <div className="flex border-b">
        <button className={tabClass("users")} onClick={() => setTab("users")}>Import Users</button>
        <button className={tabClass("subjects")} onClick={() => setTab("subjects")}>Import Subjects</button>
      </div>

      {/* ── USERS TAB ──────────────────────────────────────────────────────── */}
      {tab === "users" && (
        <>
          <Card>
            <CardHeader><CardTitle>Upload Users CSV</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleUserUpload} className="space-y-4">
                <input
                  ref={userFileRef}
                  type="file"
                  accept=".csv"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const f = e.target.files?.[0];
                    if (f?.name.endsWith(".csv")) { setUserFile(f); setUserResult(null); }
                    else toast.error("Please select a .csv file");
                  }}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                />
                {userFile && (
                  <p className="text-sm text-gray-600">
                    Selected: <strong>{userFile.name}</strong> ({(userFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
                <div className="text-xs text-gray-400 space-y-1">
                  <p>Columns: <code>erp_id, name, email, phone, role, department, year, semester</code></p>
                  <p>Student erp_id must start with <strong>S</strong> · Employee erp_id must start with <strong>E</strong></p>
                  <p>Student UID format: <code>startYear-DeptDivRoll-endYear</code> (e.g. 2025-COMPSA01-2029)</p>
                </div>
                <div className="flex gap-3">
                  <Button type="submit" disabled={userLoading || !userFile}>
                    {userLoading ? <Spinner className="mr-2 h-4 w-4" /> : <Upload className="mr-2 h-4 w-4" />}
                    {userLoading ? "Importing…" : "Import"}
                  </Button>
                  <Button type="button" variant="outline" onClick={downloadUserTemplate}>
                    <Download className="mr-2 h-4 w-4" /> Download Template
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {userResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {!userResult.validationErrors?.length
                    ? <><CheckCircle className="h-5 w-5 text-green-500" /> Import Successful</>
                    : <><XCircle className="h-5 w-5 text-red-500" /> Validation Errors</>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {userResult.imported > 0 && (
                  <p className="mb-2 text-green-700">
                    {userResult.imported} users imported ({userResult.students} students, {userResult.employees} employees).
                  </p>
                )}
                {(userResult.skippedDuplicates ?? 0) > 0 && (
                  <p className="mb-4 text-yellow-700">{userResult.skippedDuplicates} rows skipped — already exist.</p>
                )}
                {userResult.validationErrors && userResult.validationErrors.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-4">Row</th>
                          <th className="py-2 pr-4">Field</th>
                          <th className="py-2">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userResult.validationErrors.map((row, i) =>
                          row._errors
                            ? Object.entries(row._errors).map(([field, message], j) => (
                                <tr key={`${i}-${j}`} className="border-b last:border-0">
                                  <td className="py-2 pr-4 font-mono">{row._rowIndex + 2}</td>
                                  <td className="py-2 pr-4 font-mono text-red-600">{field}</td>
                                  <td className="py-2 text-gray-600">{message}</td>
                                </tr>
                              ))
                            : null
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── SUBJECTS TAB ───────────────────────────────────────────────────── */}
      {tab === "subjects" && (
        <>
          <Card>
            <CardHeader><CardTitle>Upload Subjects CSV</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleSubjectUpload} className="space-y-4">
                <input
                  ref={subFileRef}
                  type="file"
                  accept=".csv"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const f = e.target.files?.[0];
                    if (f?.name.endsWith(".csv")) { setSubFile(f); setSubResult(null); }
                    else toast.error("Please select a .csv file");
                  }}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                />
                {subFile && (
                  <p className="text-sm text-gray-600">
                    Selected: <strong>{subFile.name}</strong> ({(subFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
                <div className="text-xs text-gray-400 space-y-1">
                  <p>Columns: <code>paper_code, department, subject_code, subject_name, weekly_hours, credits, has_practical</code></p>
                  <p><strong>paper_code</strong>: groups related subjects (e.g. CS101 for theory + lab). Optional.</p>
                  <p><strong>weekly_hours</strong>: lectures per week (e.g. 4).</p>
                  <p><strong>has_practical</strong>: 0 or 1.</p>
                </div>
                <div className="flex gap-3">
                  <Button type="submit" disabled={subLoading || !subFile}>
                    {subLoading ? <Spinner className="mr-2 h-4 w-4" /> : <Upload className="mr-2 h-4 w-4" />}
                    {subLoading ? "Importing…" : "Import"}
                  </Button>
                  <Button type="button" variant="outline" onClick={downloadSubjectTemplate}>
                    <Download className="mr-2 h-4 w-4" /> Download Template
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {subResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {subResult.errors === 0
                    ? <><CheckCircle className="h-5 w-5 text-green-500" /> Import Complete</>
                    : <><XCircle className="h-5 w-5 text-red-500" /> Import Errors</>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-green-700">{subResult.inserted} subject(s) imported.</p>
                {subResult.skipped > 0 && <p className="text-yellow-700">{subResult.skipped} skipped (duplicate codes).</p>}
                {subResult.error_details?.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm text-red-600">
                    {subResult.error_details.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}