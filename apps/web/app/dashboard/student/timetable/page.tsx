"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { TeacherInfoPopup } from "@/components/ui/teacher-info-popup";

interface Slot {
  id: number;
  day: string;
  start_time: string;
  end_time: string;
  room: string;
  subject_code: string;
  subject_name: string;
  type: string;
  batch_label: string | null;
  teacher_name: string;
  teacher_erp_id: string;
}

interface ScheduleEvent {
  id: number;
  event_type: "HOLIDAY" | "EXAM" | "EVENT" | "EXTRA_CLASS" | "OTHER";
  title: string;
  description: string | null;
}

interface DaySchedule {
  day: string;
  date: string;
  schedule_events: ScheduleEvent[];
  slots: Slot[];
}

const DAY_LABELS: Record<string, string> = {
  MON: "Monday", TUE: "Tuesday", WED: "Wednesday",
  THU: "Thursday", FRI: "Friday", SAT: "Saturday",
};

const EVENT_COLORS: Record<string, string> = {
  HOLIDAY: "bg-red-100 border-red-300 text-red-700",
  EXAM: "bg-orange-100 border-orange-300 text-orange-700",
  EVENT: "bg-blue-100 border-blue-300 text-blue-700",
  EXTRA_CLASS: "bg-green-100 border-green-300 text-green-700",
  OTHER: "bg-gray-100 border-gray-300 text-gray-700",
};

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short",
  });
}

function isHolidayOrExam(events: ScheduleEvent[]) {
  return events.some((e) => e.event_type === "HOLIDAY" || e.event_type === "EXAM");
}

function SlotCard({ slot }: { slot: Slot }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm">{slot.subject_name}</span>
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
          {slot.type}{slot.batch_label ? ` · ${slot.batch_label}` : ""}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-500">
        <span>{slot.start_time}–{slot.end_time}</span>
        <TeacherInfoPopup erpId={slot.teacher_erp_id} name={slot.teacher_name} />
        <span>{slot.room}</span>
      </div>
    </div>
  );
}

export default function StudentTimetablePage() {
  const [activeTab, setActiveTab] = useState<"today" | "week">("today");
  const [todayData, setTodayData] = useState<DaySchedule | null>(null);
  const [weekData, setWeekData] = useState<DaySchedule[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<DaySchedule>("/timetable/my-today"),
      api.get<DaySchedule[]>("/timetable/my-week"),
    ])
      .then(([t, w]) => {
        setTodayData(t.data);
        setWeekData(w.data);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">My Timetable</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("today")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "today" ? "bg-primary text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setActiveTab("week")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "week" ? "bg-primary text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            This Week
          </button>
        </div>
      </div>

      {/* ── Today Tab ──────────────────────────────────────────────── */}
      {activeTab === "today" && todayData && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            {formatDate(todayData.date)} · {DAY_LABELS[todayData.day] ?? todayData.day}
          </p>

          {todayData.schedule_events.map((ev) => (
            <div key={ev.id} className={`rounded-md border px-4 py-3 ${EVENT_COLORS[ev.event_type]}`}>
              <p className="font-semibold">
                {ev.event_type === "HOLIDAY" ? "🏖️" : ev.event_type === "EXAM" ? "📝" : "📅"} {ev.title}
              </p>
              {ev.description && <p className="mt-0.5 text-sm">{ev.description}</p>}
            </div>
          ))}

          {isHolidayOrExam(todayData.schedule_events) ? (
            <p className="text-sm text-gray-500 italic">Regular classes are not scheduled today.</p>
          ) : todayData.slots.length === 0 ? (
            <p className="text-sm text-gray-500">No classes scheduled for today.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">
                {todayData.slots.length} class{todayData.slots.length > 1 ? "es" : ""} today
              </p>
              {todayData.slots.map((s) => <SlotCard key={s.id} slot={s} />)}
            </div>
          )}
        </div>
      )}

      {/* ── Week Tab ───────────────────────────────────────────────── */}
      {activeTab === "week" && (
        <div className="space-y-4">
          {weekData.length === 0 ? (
            <p className="text-gray-500">No timetable data available.</p>
          ) : (
            weekData.map((day) => {
              const holiday = isHolidayOrExam(day.schedule_events);
              return (
                <Card key={day.day} className={holiday ? "opacity-75" : ""}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span>{DAY_LABELS[day.day] ?? day.day}</span>
                      <span className="text-sm font-normal text-gray-400">{formatDate(day.date)}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0">
                    {day.schedule_events.map((ev) => (
                      <div key={ev.id} className={`rounded border px-3 py-1.5 text-sm ${EVENT_COLORS[ev.event_type]}`}>
                        <span className="font-medium">{ev.title}</span>
                        {ev.description && <span className="ml-2 text-xs opacity-80">{ev.description}</span>}
                      </div>
                    ))}

                    {holiday ? (
                      <p className="text-xs text-gray-400 italic">No regular classes</p>
                    ) : day.slots.length === 0 ? (
                      <p className="text-xs text-gray-400">—</p>
                    ) : (
                      <div className="space-y-2">
                        {day.slots.map((s) => <SlotCard key={s.id} slot={s} />)}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
