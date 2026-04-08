"use client";

import { useEffect, useState, useRef } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";
import { Upload, Download, BookOpen, Trash2 } from "lucide-react";

interface Note {
  id: number;
  title: string;
  uploaded_at: string;
  uploader: string;
  division_label: string | null;
  dept_name: string | null;
}

interface Division {
  id: number;
  label: string;
  year: number;
}

export default function HodNotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function fetchNotes() {
    setLoading(true);
    api.get<Note[]>("/notes").then(({ data }) => setNotes(data)).finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchNotes();
    api.get<Division[]>("/roles/divisions").then(({ data }) => setDivisions(data)).catch(() => {});
  }, []);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) { toast.error("Please select a file"); return; }
    if (!title.trim()) { toast.error("Please enter a title"); return; }

    setUploading(true);
    try {
      const { data } = await api.post<{ upload_url: string }>("/notes/upload-url", {
        title: title.trim(),
        filename: file.name,
        division_id: divisionId ? Number(divisionId) : undefined,
      });

      await fetch(data.upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });

      toast.success("Note uploaded");
      setTitle(""); setDivisionId("");
      if (fileRef.current) fileRef.current.value = "";
      fetchNotes();
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(id: number) {
    try {
      const { data } = await api.get<{ download_url: string }>(`/notes/download/${id}`);
      window.open(data.download_url, "_blank");
    } catch {
      toast.error("Download failed");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this note?")) return;
    try {
      await api.delete(`/notes/${id}`);
      toast.success("Deleted");
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch {
      toast.error("Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Notes</h2>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Upload Note</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="max-w-md"
          />
          <div>
            <label className="block text-sm font-medium mb-1">Division (optional — leave blank for dept-wide)</label>
            <select
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
              className="rounded-md border border-gray-300 bg-background text-gray-900 px-3 py-2 text-sm"
            >
              <option value="">Department-wide</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>Year {d.year} – {d.label}</option>
              ))}
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
        <CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Notes</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <Spinner />
          ) : notes.length === 0 ? (
            <p className="text-sm text-gray-500">No notes yet.</p>
          ) : (
            <ul className="space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="flex items-start justify-between rounded-lg border border-gray-200 p-3 gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{n.title}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {n.division_label ? `Division ${n.division_label}` : (n.dept_name ?? "Dept-wide")} · {n.uploader} · {new Date(n.uploaded_at).toLocaleDateString()}
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
