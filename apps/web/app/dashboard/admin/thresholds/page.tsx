"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";

interface Threshold {
  id: number;
  key_name: string;
  description: string;
  value: number;
}

// Display-friendly labels and units for each threshold key
const THRESHOLD_META: Record<string, { label: string; unit: string; min: number; max: number }> = {
  min_attendance_pct:  { label: "Minimum Attendance",           unit: "%",    min: 0, max: 100 },
  min_midterm1_marks:  { label: "Minimum Marks — Mid Term 1",   unit: "marks", min: 0, max: 100 },
  min_midterm2_marks:  { label: "Minimum Marks — Mid Term 2",   unit: "marks", min: 0, max: 100 },
  min_midterm3_marks:  { label: "Minimum Marks — Mid Term 3",   unit: "marks", min: 0, max: 100 },
  min_midterm_avg:     { label: "Minimum Avg of Mid Terms 1‑3", unit: "marks", min: 0, max: 100 },
  min_endsem_marks:    { label: "Minimum Marks — End Semester", unit: "marks", min: 0, max: 100 },
};

export default function ThresholdsPage() {
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, number>>({});

  async function load() {
    try {
      const { data } = await api.get("/admin/thresholds");
      setThresholds(data);
      const map: Record<string, number> = {};
      data.forEach((t: Threshold) => { map[t.key_name] = Number(t.value); });
      setEditing(map);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave(key: string) {
    try {
      await api.post("/admin/thresholds", { key_name: key, value: Number(editing[key]) });
      toast.success("Threshold updated");
      load();
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed"
      );
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Admin Thresholds</h2>
        <p className="text-gray-500 mt-1 text-sm">
          Values below these thresholds trigger at-risk alerts for students.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {thresholds.map((t) => {
          const meta = THRESHOLD_META[t.key_name];
          const label = meta?.label ?? t.description ?? t.key_name;
          const unit  = meta?.unit ?? "";
          return (
            <Card key={t.key_name}>
              <div className="px-6 pt-5 pb-3 border-b border-gray-200">
                <p className="text-sm font-semibold text-gray-900">{label}</p>
              </div>
              <CardContent>
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    id={`threshold-${t.key_name}`}
                    type="number"
                    min={meta?.min ?? 0}
                    max={meta?.max ?? 100}
                    step="0.5"
                    value={editing[t.key_name] ?? t.value}
                    onChange={(e) =>
                      setEditing((prev) => ({ ...prev, [t.key_name]: Number(e.target.value) }))
                    }
                    className="w-24"
                  />
                  {unit && <span className="text-sm text-gray-500">{unit}</span>}
                  <Button size="sm" onClick={() => handleSave(t.key_name)}>
                    Save
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
