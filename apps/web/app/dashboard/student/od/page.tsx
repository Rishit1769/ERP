"use client";

import { useEffect, useState, type FormEvent } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";

interface OdRequest {
  id: number;
  reason: string;
  dates: string[];
  status: string;
  created_at: string;
}

export default function StudentOdPage() {
  const [requests, setRequests] = useState<OdRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [reason, setReason] = useState("");
  const [dates, setDates] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const { data } = await api.get("/grievances/od/my");
      setRequests(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim() || !dates.trim()) return;

    const dateList = dates.split(",").map((d) => d.trim()).filter(Boolean);
    if (dateList.length === 0) {
      toast.error("Enter at least one date (YYYY-MM-DD)");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/grievances/od/submit", {
        reason: reason.trim(),
        dates: dateList,
      });
      toast.success("OD request submitted");
      setReason("");
      setDates("");
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

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">OD Requests</h2>

      <Card>
        <CardHeader><CardTitle>New OD Request</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dates (comma-separated)</label>
              <input
                type="text"
                value={dates}
                onChange={(e) => setDates(e.target.value)}
                placeholder="2025-01-15, 2025-01-16"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Reason for on-duty leave…"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit Request"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {requests.length > 0 && (
        <Card>
          <CardHeader><CardTitle>My Requests</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {requests.map((r) => (
                <div key={r.id} className="rounded-lg border px-4 py-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-gray-600">
                        Dates: {(r.dates || []).join(", ")}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">{r.reason}</p>
                    </div>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        r.status === "APPROVED"
                          ? "bg-green-100 text-green-700"
                          : r.status === "REJECTED"
                          ? "bg-red-100 text-red-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {r.status}
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
