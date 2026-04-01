"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";
import { Download } from "lucide-react";

interface SubjectResult {
  subject_code: string;
  subject_name: string;
  theory: { exam_type: string; marks_obtained: number; max_marks: number }[];
  practical: { marks_obtained: number; max_marks: number; batch_label: string }[];
}

export default function StudentResultsPage() {
  const [results, setResults] = useState<SubjectResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api
      .get("/results/my")
      .then(({ data }) => setResults(data))
      .finally(() => setLoading(false));
  }, []);

  async function handleExport() {
    setExporting(true);
    try {
      const { data } = await api.post("/results/export-pdf", {});
      window.open(data.url, "_blank");
      toast.success("PDF generated");
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Results Hub</h2>
        <Button onClick={handleExport} disabled={exporting} size="sm">
          <Download className="mr-2 h-4 w-4" />
          {exporting ? "Generating…" : "Export PDF"}
        </Button>
      </div>

      {results.length === 0 ? (
        <p className="text-gray-500">No results available yet.</p>
      ) : (
        results.map((r) => (
          <Card key={r.subject_code}>
            <CardHeader>
              <CardTitle className="text-base">
                {r.subject_name} <span className="text-sm text-gray-400">({r.subject_code})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {r.theory.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-2">Theory</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {r.theory.map((t, i) => (
                      <div key={i} className="rounded-lg bg-gray-50 p-3 text-center">
                        <p className="text-xs text-gray-400">{t.exam_type.replace(/_/g, " ")}</p>
                        <p className="text-lg font-bold">
                          {t.marks_obtained}<span className="text-sm text-gray-400">/{t.max_marks}</span>
                        </p>
                        <p className={`text-xs font-medium ${(t.marks_obtained / t.max_marks) * 100 < 40 ? "text-red-600" : "text-green-600"}`}>
                          {((t.marks_obtained / t.max_marks) * 100).toFixed(0)}%
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {r.practical.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-2">Practical</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {r.practical.map((p, i) => (
                      <div key={i} className="rounded-lg bg-blue-50 p-3 text-center">
                        <p className="text-xs text-gray-400">Batch {p.batch_label}</p>
                        <p className="text-lg font-bold">
                          {p.marks_obtained}<span className="text-sm text-gray-400">/{p.max_marks}</span>
                        </p>
                        <p className={`text-xs font-medium ${(p.marks_obtained / p.max_marks) * 100 < 40 ? "text-red-600" : "text-green-600"}`}>
                          {((p.marks_obtained / p.max_marks) * 100).toFixed(0)}%
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
