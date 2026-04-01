"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { MapPin, User, BookOpen, Clock } from "lucide-react";

interface Teacher {
  erp_id: string;
  name: string;
  dept_name: string;
  dept_code: string;
  current_room: string | null;
  subject_name: string | null;
  start_time: string | null;
  end_time: string | null;
  is_override: 0 | 1;
}

export default function StudentLocatorPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  async function load() {
    try {
      const { data } = await api.get("/timetable/teachers-now");
      setTeachers(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const q = search.toLowerCase();
  const filtered = teachers.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.dept_code.toLowerCase().includes(q) ||
      t.dept_name.toLowerCase().includes(q)
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Faculty Locator</h2>
        <p className="text-gray-500 mt-1 text-sm">
          See where teachers are right now. Updates every 30 seconds.
        </p>
      </div>

      <Input
        placeholder="Search by name or branch…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500">No teachers found.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const inClass = !!t.subject_name && !!t.current_room;
            return (
              <Card key={t.erp_id} className="overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100">
                        <User className="h-4 w-4 text-indigo-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm leading-tight truncate">{t.name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {t.dept_name} ({t.dept_code})
                        </p>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        inClass
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {inClass ? "In Class" : "Available"}
                    </span>
                  </div>

                  {/* Details */}
                  {inClass ? (
                    <div className="space-y-1.5 text-sm">
                      <div className="flex items-center gap-1.5 text-gray-700">
                        <MapPin className="h-4 w-4 shrink-0 text-indigo-500" />
                        <span className="font-medium">{t.current_room}</span>
                        {t.is_override === 1 && (
                          <span className="text-xs text-amber-600 ml-1">(manual)</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <BookOpen className="h-4 w-4 shrink-0" />
                        <span className="truncate">{t.subject_name}</span>
                      </div>
                      {t.start_time && t.end_time && (
                        <div className="flex items-center gap-1.5 text-gray-500">
                          <Clock className="h-4 w-4 shrink-0" />
                          <span>
                            {t.start_time} – {t.end_time}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">
                      {t.current_room
                        ? `Location: ${t.current_room}`
                        : "No scheduled class right now"}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
