"use client";

import { useEffect, useState, useRef } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";
import { Upload, Download, Megaphone, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

interface Notice {
  id: number;
  title: string;
  body: string | null;
  uploaded_at: string;
  uploader: string;
  dept_name: string | null;
}

export default function TeacherNoticesPage() {
  const { user } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scope, setScope] = useState<"dept" | "institution">("dept");
  const fileRef = useRef<HTMLInputElement>(null);

  async function fetchNotices() {
    setLoading(true);
    api.get<Notice[]>("/notices").then(({ data }) => setNotices(data)).finally(() => setLoading(false));
  }

  useEffect(() => { fetchNotices(); }, []);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) { toast.error("Please select a file"); return; }
    if (!title.trim()) { toast.error("Please enter a title"); return; }

    setUploading(true);
    try {
      const { data } = await api.post<{ upload_url: string }>("/notices/upload-url", {
        title: title.trim(),
        body: body.trim() || undefined,
        filename: file.name,
        dept_id: scope === "dept" ? user?.dept_id : undefined,
      });

      await fetch(data.upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });

      toast.success("Notice uploaded");
      setTitle(""); setBody("");
      if (fileRef.current) fileRef.current.value = "";
      fetchNotices();
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(id: number) {
    try {
      const { data } = await api.get<{ download_url: string }>(`/notices/download/${id}`);
      window.open(data.download_url, "_blank");
    } catch {
      toast.error("Download failed");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this notice?")) return;
    try {
      await api.delete(`/notices/${id}`);
      toast.success("Deleted");
      setNotices((prev) => prev.filter((n) => n.id !== id));
    } catch {
      toast.error("Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Notices</h2>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Upload Notice</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="max-w-md"
          />
          <textarea
            placeholder="Description (optional)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            className="w-full max-w-md rounded-md border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div>
            <label className="block text-sm font-medium mb-1">Scope</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as "dept" | "institution")}
              className="rounded-md border border-gray-300 bg-background text-gray-900 px-3 py-2 text-sm"
            >
              <option value="dept">Branch Specific (My Department)</option>
              <option value="institution">Institution Level (All Branches)</option>
            </select>
          </div>
          <div className="flex items-center gap-4">
            <input ref={fileRef} type="file" className="text-sm" />
            <Button onClick={handleUpload} disabled={uploading}>
              {uploading ? <Spinner className="h-4 w-4" /> : <><Upload className="h-4 w-4 mr-1" />Upload</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5" /> Notices</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <Spinner />
          ) : notices.length === 0 ? (
            <p className="text-sm text-gray-500">No notices yet.</p>
          ) : (
            <ul className="space-y-2">
              {notices.map((n) => (
                <li key={n.id} className="flex items-start justify-between rounded-lg border border-gray-200 p-3 gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{n.title}</p>
                    {n.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>}
                    <p className="text-xs text-gray-400 mt-1">
                      {n.dept_name ? `Branch: ${n.dept_name}` : "Institution Level"} · {n.uploader} · {new Date(n.uploaded_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => handleDownload(n.id)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDelete(n.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
