"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { BookOpen, ChevronRight } from "lucide-react";

interface AssignmentSummary {
  assignment_id: number;
  subject_name: string;
  subject_code: string;
  assignment_type: "THEORY" | "PRACTICAL";
  batch_label: string | null;
  year: number;
  division_label: string;
  semester: number | null;
  total_lecture_hours: number | null;
  lesson_plan_id: number | null;
  total_topics: number;
  completed_topics: number;
  total_lectures_taken: number;
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0;
  return (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div
        className="bg-blue-500 h-2 rounded-full transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function TeacherLessonPlanPage() {
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<AssignmentSummary[]>("/lesson-plan/my")
      .then(({ data }) => setAssignments(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Lesson Plans</h2>

      {assignments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            No subject assignments yet. Your HOD will assign subjects to you.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {assignments.map((a) => {
            const progressPct =
              a.total_topics > 0
                ? Math.round((a.completed_topics / a.total_topics) * 100)
                : 0;

            return (
              <Link
                key={a.assignment_id}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              href={`/dashboard/teacher/lesson-plan/${a.assignment_id}` as any}
              >
                <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <BookOpen className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold leading-tight">{a.subject_name}</p>
                          <p className="text-xs text-gray-500">
                            {a.subject_code} · {a.assignment_type}
                            {a.batch_label ? ` (${a.batch_label})` : ""} · Yr {a.year} Div{" "}
                            {a.division_label}
                            {a.semester ? ` · Sem ${a.semester}` : ""}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400 shrink-0 mt-1" />
                    </div>

                    {a.lesson_plan_id ? (
                      <>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-gray-500">
                            <span>
                              {a.completed_topics}/{a.total_topics} topics completed
                            </span>
                            <span>{progressPct}%</span>
                          </div>
                          <ProgressBar value={a.completed_topics} max={a.total_topics} />
                        </div>
                        <div className="flex gap-4 text-xs text-gray-500">
                          <span>Lectures taken: {a.total_lectures_taken}</span>
                          {a.total_lecture_hours && (
                            <span>Total hours: {a.total_lecture_hours}</span>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">
                        No lesson plan yet — syllabus may not be uploaded by admin.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
