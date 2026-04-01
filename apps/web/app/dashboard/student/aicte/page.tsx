"use client";

import { useEffect, useState, type FormEvent } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";

interface AicteActivity {
  id: number;
  category: string;
  title: string;
  description: string;
  points_requested: number;
  awarded_points: number | null;
  status: string;
  created_at: string;
}

interface AicteSummary {
  total_points: number;
  by_category: Record<string, number>;
}

export default function StudentAictePage() {
  const [activities, setActivities] = useState<AicteActivity[]>([]);
  const [summary, setSummary] = useState<AicteSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Form
  const [category, setCategory] = useState("TECHNICAL");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [points, setPoints] = useState(10);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const { data } = await api.get("/aicte/my");
      setActivities(data.activities || data);
      setSummary(data.summary || null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await api.post("/aicte/submit", {
        category,
        title: title.trim(),
        description: description.trim(),
        points_requested: points,
      });
      toast.success("Activity submitted for review");
      setTitle("");
      setDescription("");
      setPoints(10);
      load();
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed"
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  const categories = ["TECHNICAL", "CULTURAL", "SPORTS", "SOCIAL_SERVICE", "ENTREPRENEURSHIP", "OTHER"];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">AICTE Activity Points</h2>

      {summary && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-3xl font-bold text-primary">{summary.total_points}</p>
                <p className="text-sm text-gray-500">Total Points</p>
              </div>
              {summary.by_category && Object.entries(summary.by_category).map(([cat, pts]) => (
                <div key={cat} className="text-center">
                  <p className="text-lg font-semibold">{pts}</p>
                  <p className="text-xs text-gray-400">{cat.replace(/_/g, " ")}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Submit Activity</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <Input
              id="aicte_title"
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Hackathon Winner"
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Brief description…"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <Input
              id="points_requested"
              label="Points Requested"
              type="number"
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
              className="w-24"
            />
            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {activities.length > 0 && (
        <Card>
          <CardHeader><CardTitle>My Activities</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activities.map((a) => (
                <div key={a.id} className="rounded-lg border px-4 py-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-sm">
                        {a.title}
                        <span className="ml-2 text-xs text-gray-400">{a.category.replace(/_/g, " ")}</span>
                      </p>
                      <p className="text-sm text-gray-500 mt-1">{a.description}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Requested: {a.points_requested} pts
                        {a.awarded_points != null && ` · Awarded: ${a.awarded_points} pts`}
                      </p>
                    </div>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        a.status === "APPROVED"
                          ? "bg-green-100 text-green-700"
                          : a.status === "REJECTED"
                          ? "bg-red-100 text-red-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {a.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
