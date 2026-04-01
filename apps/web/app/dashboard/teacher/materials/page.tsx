"use client";

import { useEffect, useState, useRef } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";
import { Upload, Download, FileText } from "lucide-react";

interface Material {
  id: number;
  title: string;
  subject_name: string;
  uploader: string;
  uploaded_at: string;
}

export default function TeacherMaterialsPage() {
  const [assignments, setAssignments] = useState<{ id: number; subject_name: string; division_name: string }[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState("");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get("/attendance/my-assignments").then(({ data }) => setAssignments(data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedAssignment) return;
    setLoading(true);
    api
      .get(`/materials/subject/${selectedAssignment}`)
      .then(({ data }) => setMaterials(data))
      .finally(() => setLoading(false));
  }, [selectedAssignment]);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file || !selectedAssignment) return;
    if (!title.trim()) {
      toast.error("Please enter a title for the material");
      return;
    }

    setUploading(true);
    try {
      // Get presigned upload URL
      const { data } = await api.post("/materials/upload-url", {
        subject_assignment_id: Number(selectedAssignment),
        title: title.trim(),
        filename: file.name,
      });

      // Upload to MinIO
      await fetch(data.upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });

      toast.success("File uploaded");
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
      // Refresh list
      const { data: updated } = await api.get(`/materials/subject/${selectedAssignment}`);
      setMaterials(updated);
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(materialId: number) {
    try {
      const { data } = await api.get(`/materials/download/${materialId}`);
      window.open(data.download_url, "_blank");
    } catch {
      toast.error("Download failed");
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Materials</h2>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Assignment</label>
        <select
          value={selectedAssignment}
          onChange={(e) => setSelectedAssignment(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Select…</option>
          {assignments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.subject_name} — {a.division_name}
            </option>
          ))}
        </select>
      </div>

      {selectedAssignment && (
        <Card>
          <CardHeader><CardTitle>Upload Material</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Input
                placeholder="Title (e.g. Unit 3 Notes)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="max-w-sm"
              />
              <div className="flex items-center gap-4">
                <input
                  ref={fileRef}
                  type="file"
                  className="block text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                />
                <Button onClick={handleUpload} disabled={uploading} size="sm">
                  <Upload className="mr-2 h-4 w-4" />
                  {uploading ? "Uploading…" : "Upload"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Spinner />
      ) : materials.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Uploaded Files</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {materials.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg border px-4 py-2">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="font-medium text-sm">{m.title}</p>
                      <p className="text-xs text-gray-400">{new Date(m.uploaded_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleDownload(m.id)}>
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : selectedAssignment ? (
        <p className="text-gray-500">No materials uploaded yet.</p>
      ) : null}
    </div>
  );
}
