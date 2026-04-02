"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";
import { GraduationCap, RefreshCw, ArrowRight, Users, CalendarRange } from "lucide-react";

const YEAR_LABELS: Record<number, string> = {
  1: "FY (1st Year)",
  2: "SY (2nd Year)",
  3: "TY (3rd Year)",
  4: "LY (4th Year)",
};
const YEAR_SHORT: Record<number, string> = { 1: "FY", 2: "SY", 3: "TY", 4: "LY" };
const EXPECTED_ODD: Record<number, number> = { 1: 1, 2: 3, 3: 5, 4: 7 };
const EXPECTED_EVEN: Record<number, number> = { 1: 2, 2: 4, 3: 6, 4: 8 };

const ODD_SEMS  = [1, 3, 5, 7];
const EVEN_SEMS = [2, 4, 6, 8];

function SemLabel(sem: number) {
  return `Semester ${sem} (${sem % 2 !== 0 ? "Odd" : "Even"})`;
}

interface YearStatus { semester: number; student_count: number; }
interface StatusResponse { years: Record<number, YearStatus>; alumni_count: number; }
interface SemDate { semester: number; start_date: string; end_date: string; }

type SemType = "ODD" | "EVEN";

export default function SemesterPage() {
  const [status, setStatus] = useState<StatusResponse>({ years: {}, alumni_count: 0 });
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState<number | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [confirmAdvance, setConfirmAdvance] = useState(false);

  // ── Semester dates state ─────────────────────────────────────────────────
  const [semDates, setSemDates] = useState<SemDate[]>([]);
  const [semType, setSemType] = useState<SemType>("ODD");
  const [dateInputs, setDateInputs] = useState<Record<number, { start: string; end: string }>>({});
  const [savingDates, setSavingDates] = useState(false);

  async function loadStatus() {
    try {
      const { data } = await api.get<StatusResponse>("/admin/semester-status");
      setStatus(data);
    } catch {
      toast.error("Failed to load semester status");
    } finally {
      setLoading(false);
    }
  }

  async function loadSemDates() {
    try {
      const { data } = await api.get<SemDate[]>("/admin/semester-dates");
      setSemDates(data);
      const inputs: Record<number, { start: string; end: string }> = {};
      for (const d of data) {
        inputs[d.semester] = { start: d.start_date?.slice(0, 10) ?? "", end: d.end_date?.slice(0, 10) ?? "" };
      }
      setDateInputs(inputs);
    } catch {
      // Table may not exist yet — silently ignore
    }
  }

  useEffect(() => {
    loadStatus();
    loadSemDates();
  }, []);

  // When semType changes, pre-fill inputs from existing data for those semesters
  useEffect(() => {
    const sems = semType === "ODD" ? ODD_SEMS : EVEN_SEMS;
    setDateInputs((prev) => {
      const next = { ...prev };
      for (const s of sems) {
        if (!next[s]) next[s] = { start: "", end: "" };
      }
      return next;
    });
  }, [semType]);

  async function handlePromote(year: number) {
    setPromoting(year);
    try {
      const { data } = await api.post<{ promoted: number; to_semester: number }>("/admin/promote-semester", { year });
      toast.success(`${YEAR_SHORT[year]}: ${data.promoted} student(s) promoted to Semester ${data.to_semester}`);
      await loadStatus();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Promotion failed");
    } finally {
      setPromoting(null);
    }
  }

  async function handleAdvanceYear() {
    setAdvancing(true);
    setConfirmAdvance(false);
    try {
      const { data } = await api.post<{ graduated: number; transitions: { count: number; fromYear: number; toYear: number }[] }>("/admin/advance-year");
      const parts: string[] = [];
      if (data.graduated > 0) parts.push(`${data.graduated} graduated`);
      for (const t of data.transitions ?? []) {
        if (t.count > 0) parts.push(`${t.count} ${YEAR_SHORT[t.fromYear]}→${YEAR_SHORT[t.toYear]}`);
      }
      toast.success("Academic year advanced! " + (parts.join(", ") || "No changes"));
      await loadStatus();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Year advancement failed");
    } finally {
      setAdvancing(false);
    }
  }

  async function handleSaveDates() {
    const sems = semType === "ODD" ? ODD_SEMS : EVEN_SEMS;
    const semesters = sems
      .map((s) => ({ semester: s, start_date: dateInputs[s]?.start ?? "", end_date: dateInputs[s]?.end ?? "" }))
      .filter((s) => s.start_date && s.end_date);

    if (semesters.length === 0) {
      toast.error("Please fill in at least one semester's dates");
      return;
    }

    setSavingDates(true);
    try {
      await api.put("/admin/semester-dates", { sem_type: semType, semesters });
      toast.success(`${semesters.length} semester date(s) saved`);
      await loadSemDates();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to save dates");
    } finally {
      setSavingDates(false);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  const years = status.years ?? {};
  const alumniCount = status.alumni_count ?? 0;

  const canAdvance = [1, 2, 3, 4].some((y) => {
    const ys = years[y];
    return ys && ys.student_count > 0 && ys.semester === EXPECTED_EVEN[y];
  });

  const activeSems = semType === "ODD" ? ODD_SEMS : EVEN_SEMS;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold">Semester Management</h2>
        <p className="text-gray-500 mt-1">
          Manage semester dates, promotions, and year-end advancement.
        </p>
      </div>

      {/* ── Semester Start / End Dates ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-primary" />
            Semester Start &amp; End Dates
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Odd / Even toggle */}
          <div className="flex gap-2">
            {(["ODD", "EVEN"] as SemType[]).map((t) => (
              <button
                key={t}
                onClick={() => setSemType(t)}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                  semType === t ? "bg-primary text-white" : "border border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {t === "ODD" ? "Odd Semesters (1, 3, 5, 7)" : "Even Semesters (2, 4, 6, 8)"}
              </button>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {activeSems.map((s) => {
              const existing = semDates.find((d) => d.semester === s);
              const val = dateInputs[s] ?? { start: "", end: "" };
              return (
                <div key={s} className="rounded-lg border p-3 space-y-2">
                  <p className="text-sm font-semibold text-gray-700">Semester {s}</p>
                  {existing && (
                    <p className="text-xs text-gray-400">
                      Current: {existing.start_date?.slice(0, 10)} → {existing.end_date?.slice(0, 10)}
                    </p>
                  )}
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">Start Date</label>
                    <input
                      type="date"
                      value={val.start}
                      onChange={(e) => setDateInputs((prev) => ({ ...prev, [s]: { ...prev[s], start: e.target.value } }))}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">End Date</label>
                    <input
                      type="date"
                      value={val.end}
                      onChange={(e) => setDateInputs((prev) => ({ ...prev, [s]: { ...prev[s], end: e.target.value } }))}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <Button onClick={handleSaveDates} disabled={savingDates}>
            {savingDates ? <><Spinner className="mr-2 h-4 w-4" />Saving…</> : "Save Dates"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Alumni Summary ───────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-3 rounded-lg border bg-white px-4 py-3 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100">
            <GraduationCap className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Alumni</p>
            <p className="text-2xl font-bold text-indigo-700">{alumniCount}</p>
          </div>
        </div>

        {[1, 2, 3, 4].map((y) => {
          const ys = years[y];
          return (
            <div key={y} className="flex items-center gap-3 rounded-lg border bg-white px-4 py-3 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                <Users className="h-5 w-5 text-gray-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{YEAR_SHORT[y]}</p>
                <p className="text-2xl font-bold">{ys?.student_count ?? 0}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Per-year Cards ────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((year) => {
          const ys = years[year];
          const sem = ys?.semester;
          const count = ys?.student_count ?? 0;
          const expectedOdd = EXPECTED_ODD[year];
          const expectedEven = EXPECTED_EVEN[year];
          const isAtOdd = sem === expectedOdd;
          const isAtEven = sem === expectedEven;
          const isOutOfRange = sem !== undefined && sem !== expectedOdd && sem !== expectedEven;

          return (
            <Card key={year} className={year === 4 && isAtEven ? "border-amber-400" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  {year === 4 && <GraduationCap className="h-5 w-5 text-amber-500" />}
                  {YEAR_LABELS[year]}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Current Semester</span>
                  <span className={`font-semibold ${isOutOfRange ? "text-red-600" : ""}`}>
                    {sem ? SemLabel(sem) : "—"}
                    {isOutOfRange && " ⚠"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Active Students</span>
                  <span className="font-semibold">{count}</span>
                </div>

                {isOutOfRange && (
                  <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    Students are at Semester {sem} — expected {expectedOdd} or {expectedEven}.
                  </p>
                )}

                {isAtOdd && (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => handlePromote(year)}
                    disabled={promoting === year || count === 0}
                  >
                    {promoting === year
                      ? <><Spinner className="h-4 w-4 mr-2" /> Promoting…</>
                      : <><RefreshCw className="h-4 w-4 mr-2" />Promote to {SemLabel(expectedEven)}</>}
                  </Button>
                )}
                {isAtOdd && count === 0 && (
                  <p className="text-center text-xs text-gray-400">Import students via CSV to enable promotion.</p>
                )}
                {isAtEven && count > 0 && year < 4 && (
                  <p className="text-center text-xs text-gray-400 italic">
                    At even semester — use "Advance Academic Year" below to transition to {YEAR_SHORT[year + 1]}
                  </p>
                )}
                {isAtEven && count > 0 && year === 4 && (
                  <p className="text-center text-xs text-amber-600 italic">
                    {count} student(s) ready to graduate — use "Advance Academic Year" below
                  </p>
                )}
                {(!ys || count === 0) && <p className="text-center text-xs text-gray-400">No active students</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Year-End Advancement ──────────────────────────────────── */}
      <Card className="border-2 border-dashed border-primary/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5 text-primary" />
            Year-End: Advance Academic Year
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-600">
            <p className="font-medium mb-1">What this does:</p>
            <ul className="space-y-1 text-xs">
              <li><span className="inline-block w-28 font-medium text-amber-700">LY (Sem 8) →</span> Graduated · marked as alumni</li>
              <li><span className="inline-block w-28 font-medium text-blue-700">TY (Sem 6) →</span> Moves to LY (Sem 7) divisions</li>
              <li><span className="inline-block w-28 font-medium text-green-700">SY (Sem 4) →</span> Moves to TY (Sem 5) divisions</li>
              <li><span className="inline-block w-28 font-medium text-purple-700">FY (Sem 2) →</span> Moves to SY (Sem 3) divisions</li>
            </ul>
          </div>

          {!confirmAdvance ? (
            <Button className="w-full bg-primary" onClick={() => setConfirmAdvance(true)} disabled={advancing || !canAdvance}>
              {advancing
                ? <><Spinner className="h-4 w-4 mr-2" /> Advancing…</>
                : <><ArrowRight className="h-4 w-4 mr-2" />Advance Academic Year</>}
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                This will permanently move all year groups up. LY students at Semester 8 will be graduated. Are you sure?
              </p>
              <div className="flex gap-2">
                <Button className="flex-1 bg-primary" onClick={handleAdvanceYear} disabled={advancing}>
                  {advancing ? <Spinner className="h-4 w-4" /> : "Yes, Advance"}
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setConfirmAdvance(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {!canAdvance && (
            <p className="text-center text-xs text-gray-400">
              No year group is at its even semester yet. Run per-year semester promotions first.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
