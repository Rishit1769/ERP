"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";

interface Grievance {
  id: number;
  student_erp_id: string;
  student_name: string;
  subject_name: string;
  date: string;
  reason: string;
  status: string;
}

export default function TeacherGrievancesPage() {
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const { data } = await api.get("/grievances/pending");
      setGrievances(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleReview(id: number, decision: "APPROVED" | "REJECTED") {
    try {
      await api.post(`/grievances/${id}/review`, { decision });
      toast.success(`Grievance ${decision.toLowerCase()}`);
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
      <h2 className="text-2xl font-bold">Pending Grievances</h2>
      {grievances.length === 0 ? (
        <p className="text-gray-500">No pending grievances.</p>
      ) : (
        <div className="space-y-4">
          {grievances.map((g) => (
            <Card key={g.id}>
              <CardContent className="py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{g.student_name} <span className="text-xs text-gray-400">({g.student_erp_id})</span></p>
                    <p className="text-sm text-gray-600">Subject: {g.subject_name} | Date: {g.date}</p>
                    <p className="text-sm text-gray-500 mt-1">{g.reason}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleReview(g.id, "APPROVED")}>
                      Approve
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleReview(g.id, "REJECTED")}>
                      Reject
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
