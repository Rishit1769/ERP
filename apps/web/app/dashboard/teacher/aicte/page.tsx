"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";

interface AicteActivity {
  id: number;
  student_erp_id: string;
  student_name: string;
  category: string;
  title: string;
  description: string;
  points_requested: number;
  awarded_points: number | null;
  status: string;
}

export default function AicteReviewPage() {
  const [activities, setActivities] = useState<AicteActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState<Record<number, number>>({});

  async function load() {
    try {
      const { data } = await api.get("/aicte/pending");
      setActivities(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleReview(id: number, decision: "APPROVED" | "REJECTED") {
    try {
      await api.post(`/aicte/${id}/review`, {
        decision,
        awarded_points: decision === "APPROVED" ? (points[id] ?? 0) : 0,
      });
      toast.success(`Activity ${decision.toLowerCase()}`);
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
      <h2 className="text-2xl font-bold">AICTE Activity Review</h2>
      {activities.length === 0 ? (
        <p className="text-gray-500">No pending activities.</p>
      ) : (
        <div className="space-y-4">
          {activities.map((a) => (
            <Card key={a.id}>
              <CardContent className="py-4">
                <div className="mb-2">
                  <p className="font-semibold">
                    {a.title}{" "}
                    <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">{a.category}</span>
                  </p>
                  <p className="text-sm text-gray-500">
                    {a.student_name} ({a.student_erp_id}) · Requested: {a.points_requested} pts
                  </p>
                  <p className="text-sm text-gray-600 mt-1">{a.description}</p>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <Input
                    id={`points-${a.id}`}
                    type="number"
                    placeholder="Points"
                    value={points[a.id] ?? a.points_requested}
                    onChange={(e) => setPoints((p) => ({ ...p, [a.id]: Number(e.target.value) }))}
                    className="w-24"
                  />
                  <Button size="sm" onClick={() => handleReview(a.id, "APPROVED")}>
                    Approve
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleReview(a.id, "REJECTED")}>
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
