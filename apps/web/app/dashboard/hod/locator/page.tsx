"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin } from "lucide-react";

interface FacultyLocation {
  erp_id: string;
  name: string;
  room: string;
  subject: string;
  status: string;
}

export default function LocatorPage() {
  const [faculty, setFaculty] = useState<FacultyLocation[]>([]);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const es = new EventSource(`${apiUrl}/timetable/faculty-locator`, {
      withCredentials: true,
    });

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setFaculty(data);
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      setConnected(false);
    };

    eventSourceRef.current = es;

    return () => {
      es.close();
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold">Faculty Locator</h2>
        <span
          className={`inline-flex h-3 w-3 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}
          title={connected ? "Connected" : "Disconnected"}
        />
      </div>

      {faculty.length === 0 ? (
        <p className="text-gray-500">No faculty location data available. Updates every 30 seconds.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {faculty.map((f) => (
            <Card key={f.erp_id}>
              <CardContent className="flex items-start gap-3 py-4">
                <MapPin className="mt-0.5 h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="font-semibold">{f.name}</p>
                  <p className="text-sm text-gray-500">{f.erp_id}</p>
                  <div className="mt-2 space-y-1 text-sm">
                    <p>
                      <span className="text-gray-400">Room:</span>{" "}
                      <span className="font-medium">{f.room || "Unknown"}</span>
                    </p>
                    <p>
                      <span className="text-gray-400">Subject:</span> {f.subject || "–"}
                    </p>
                    <p>
                      <span className="text-gray-400">Status:</span>{" "}
                      <span className={f.status === "in_class" ? "text-green-600" : "text-gray-500"}>
                        {f.status === "in_class" ? "In Class" : f.status === "override" ? "Override" : "Free"}
                      </span>
                    </p>
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
