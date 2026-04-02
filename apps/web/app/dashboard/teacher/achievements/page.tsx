"use client";

import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";
import { Plus, FileText, Trash2, Download, X } from "lucide-react";

interface Achievement {
  id: number;
  title: string;
  description: string | null;
  achievement_type: string;
  achieved_date: string | null;
  minio_path: string | null;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  PHD: "Ph.D",
  MASTERS: "Masters",
  CERTIFICATION: "Certification",
  PUBLICATION: "Publication",
  AWARD: "Award",
  PATENT: "Patent",
  OTHER: "Other",
};

const TYPE_COLORS: Record<string, string> = {
  PHD: "bg-purple-100 text-purple-700",
  MASTERS: "bg-blue-100 text-blue-700",
  CERTIFICATION: "bg-green-100 text-green-700",
  PUBLICATION: "bg-orange-100 text-orange-700",
  AWARD: "bg-yellow-100 text-yellow-700",
  PATENT: "bg-red-100 text-red-700",
  OTHER: "bg-gray-100 text-gray-700",
};

export default function AchievementsPage() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [achType, setAchType] = useState("OTHER");
  const [achievedDate, setAchievedDate] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAchievements();
  }, []);

  async function loadAchievements() {
    try {
      const { data } = await api.get<Achievement[]>("/achievements/my");
      setAchievements(data);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    setSubmitting(true);
    try {
      const file = fileRef.current?.files?.[0];
      const { data } = await api.post<{ id: number; upload_url: string | null }>("/achievements", {
        title: title.trim(),
        description: description.trim() || undefined,
        achievement_type: achType,
        achieved_date: achievedDate || undefined,
        filename: file?.name,
      });

      // Upload PDF if provided
      if (file && data.upload_url) {
        await fetch(data.upload_url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/pdf" },
        });
      }

      toast.success("Achievement added");
      setTitle("");
      setDescription("");
      setAchType("OTHER");
      setAchievedDate("");
      if (fileRef.current) fileRef.current.value = "";
      setShowForm(false);
      await loadAchievements();
    } catch {
      toast.error("Failed to save achievement");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this achievement?")) return;
    try {
      await api.delete(`/achievements/${id}`);
      setAchievements((prev) => prev.filter((a) => a.id !== id));
      toast.success("Deleted");
    } catch {
      toast.error("Delete failed");
    }
  }

  async function handleDownload(id: number) {
    try {
      const { data } = await api.get<{ url: string }>(`/achievements/pdf/${id}`);
      window.open(data.url, "_blank");
    } catch {
      toast.error("Download failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">My Achievements</h2>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" /> Add Achievement
        </Button>
      </div>

      {/* Add form */}
      {showForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">New Achievement</CardTitle>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Ph.D in Computer Science from IIT Bombay"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                <select
                  value={achType}
                  onChange={(e) => setAchType(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date Achieved</label>
                <Input
                  type="date"
                  value={achievedDate}
                  onChange={(e) => setAchievedDate(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Add any details, institution, supervisor, etc."
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Upload PDF (optional)
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf"
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                />
                <p className="mt-1 text-xs text-gray-400">Accepted: PDF only. Certificate, degree, or proof document.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Saving…" : "Save Achievement"}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : achievements.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            No achievements added yet. Click "Add Achievement" to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {achievements.map((a) => (
            <Card key={a.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900">{a.title}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[a.achievement_type]}`}>
                        {TYPE_LABELS[a.achievement_type]}
                      </span>
                    </div>
                    {a.achieved_date && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(a.achieved_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                      </p>
                    )}
                    {a.description && (
                      <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{a.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {a.minio_path && (
                      <button
                        onClick={() => handleDownload(a.id)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                        title="Download PDF"
                      >
                        <FileText className="h-4 w-4" />
                        <Download className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(a.id)}
                      className="text-red-400 hover:text-red-600 p-1"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
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
