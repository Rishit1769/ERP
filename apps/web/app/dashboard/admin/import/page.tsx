"use client";

import { useState, useRef, type ChangeEvent, type FormEvent } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";
import { Upload, CheckCircle, XCircle } from "lucide-react";

interface ValidationRow {
  _rowIndex: number;
  _errors?: Record<string, string>;
  _valid: boolean;
  [key: string]: unknown;
}

interface ImportResult {
  imported: number;
  students: number;
  employees: number;
  skippedDuplicates?: number;
  validationErrors?: ValidationRow[];
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [editableErrors, setEditableErrors] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f && f.name.endsWith(".csv")) {
      setFile(f);
      setResult(null);
    } else {
      toast.error("Please select a .csv file");
    }
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const { data } = await api.post("/import/csv", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setResult({
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
      const axiosErr = err as { response?: { status?: number; data?: { error?: string; rows?: ValidationRow[]; error_count?: number } } };
      if (axiosErr.response?.status === 422 && axiosErr.response.data?.rows) {
        // Validation errors — show inline
        const rows = axiosErr.response.data.rows;
        const errorRows = rows.filter((r: ValidationRow) => r._errors);
        setResult({
          imported: 0,
          students: 0,
          employees: 0,
          validationErrors: errorRows,
        });
        toast.error(`${axiosErr.response.data.error_count} validation errors found`);
      } else {
        toast.error(axiosErr.response?.data?.error || "Import failed");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Import Users (CSV)</h2>

      <Card>
        <CardHeader>
          <CardTitle>Upload CSV File</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="flex items-center gap-4">
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
              />
            </div>
            {file && (
              <p className="text-sm text-gray-600">
                Selected: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
            <div className="text-xs text-gray-400 space-y-1">
              <p>CSV columns: erp_id, name, email, phone, role, department_code, year, semester</p>
              <p>Roles: HOD, SUBJECT_TEACHER, CLASS_INCHARGE, TEACHER_GUARDIAN, PRACTICAL_TEACHER, STUDENT</p>
            </div>
            <Button type="submit" disabled={loading || !file}>
              <Upload className="mr-2 h-4 w-4" />
              {loading ? "Importing…" : "Import"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {!result.validationErrors?.length ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Import Successful
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-red-500" />
                  Validation Errors
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {result.imported > 0 && (
              <p className="mb-2 text-green-700">
                {result.imported} users imported ({result.students} students, {result.employees} employees).
              </p>
            )}
            {(result.skippedDuplicates ?? 0) > 0 && (
              <p className="mb-4 text-yellow-700">
                {result.skippedDuplicates} rows skipped — ERP IDs already exist in the system.
              </p>
            )}
            {result.validationErrors && result.validationErrors.length > 0 && (
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
                    {result.validationErrors.map((row, i) =>
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
    </div>
  );
}
