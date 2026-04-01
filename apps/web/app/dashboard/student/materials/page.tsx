"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";
import { Download, FileText } from "lucide-react";

interface Material {
  id: number;
  title: string;
  subject_name: string;
  uploader: string;
  uploaded_at: string;
}

export default function StudentMaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/materials/my-subjects")
      .then(({ data }) => setMaterials(data))
      .finally(() => setLoading(false));
  }, []);

  async function handleDownload(id: number) {
    try {
      const { data } = await api.get(`/materials/download/${id}`);
      window.open(data.download_url, "_blank");
    } catch {
      toast.error("Download failed");
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Course Materials</h2>
      {materials.length === 0 ? (
        <p className="text-gray-500">No materials available yet.</p>
      ) : (
        <Card>
          <CardContent className="py-4">
            <div className="space-y-2">
              {materials.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-gray-400 shrink-0" />
                    <div>
                      <p className="font-medium text-sm">{m.title}</p>
                      <p className="text-xs text-gray-400">
                        {m.subject_name} · {m.uploader} · {new Date(m.uploaded_at).toLocaleDateString()}
                      </p>
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
      )}
    </div>
  );
}
