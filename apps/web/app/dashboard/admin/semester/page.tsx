"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";
import { GraduationCap, RefreshCw, ArrowRight, Users } from "lucide-react";

const YEAR_LABELS: Record<number, string> = {
  1: "FY (1st Year)",
  2: "SY (2nd Year)",
  3: "TY (3rd Year)",
  4: "LY (4th Year)",
};
const YEAR_SHORT: Record<number, string> = { 1: "FY", 2: "SY", 3: "TY", 4: "LY" };

// Each year's expected semester at the START of the year (odd)
const EXPECTED_ODD: Record<number, number> = { 1: 1, 2: 3, 3: 5, 4: 7 };
const EXPECTED_EVEN: Record<number, number> = { 1: 2, 2: 4, 3: 6, 4: 8 };

function SemLabel(sem: number) {
  return `Semester ${sem} (${sem % 2 !== 0 ? "Odd" : "Even"})`;
}

interface YearStatus {
  semester: number;
  student_count: number;
}

interface StatusResponse {
  years: Record<number, YearStatus>;
  alumni_count: number;
}

export default function SemesterPage() {
  const [status, setStatus] = useState<StatusResponse>({ years: {}, alumni_count: 0 });
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState<number | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [confirmAdvance, setConfirmAdvance] = useState(false);

  async function loadStatus() {
    try {
      const { data } = await api.get("/admin/semester-status");
      setStatus(data);
    } catch {
      toast.error("Failed to load semester status");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadStatus(); }, []);

  async function handlePromote(year: number) {
    setPromoting(year);
    try {
      const { data } = await api.post("/admin/promote-semester", { year });
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
      const { data } = await api.post("/admin/advance-year");
      const parts: string[] = [];
      if (data.graduated > 0) parts.push(`${data.graduated} graduated`);
      for (const t of data.transitions ?? []) {
        if (t.count > 0) {
          parts.push(`${t.count} ${YEAR_SHORT[t.fromYear]}→${YEAR_SHORT[t.toYear]}`);
        }
      }
      toast.success("Academic year advanced! " + (parts.join(", ") || "No changes"));
      await loadStatus();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Year advancement failed");
    } finally {
      setAdvancing(false);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  const years = status.years ?? {};
  const alumniCount = status.alumni_count ?? 0;

  // Determine if year-end advance is applicable:
  // Any year group is at its expected even semester OR has students to graduate
  const canAdvance = [1, 2, 3, 4].some((y) => {
    const ys = years[y];
    return ys && ys.student_count > 0 && ys.semester === EXPECTED_EVEN[y];
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Semester Management</h2>
        <p className="text-gray-500 mt-1">
          Use "Promote Semester" mid-year (odd → even). At year-end, use "Advance Academic Year"
          to move all groups up — TY becomes LY, SY becomes TY, FY becomes SY, and LY graduates.
        </p>
      </div>

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
                    Students are at Semester {sem} — expected {expectedOdd} or {expectedEven}. This may be a data issue from repeated test promotions.
                  </p>
                )}

                {/* Mid-year promote: show when at odd semester (disabled if no students yet) */}
                {isAtOdd && (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => handlePromote(year)}
                    disabled={promoting === year || count === 0}
                    title={count === 0 ? "No students imported yet — import via CSV first" : undefined}
                  >
                    {promoting === year
                      ? <><Spinner className="h-4 w-4 mr-2" /> Promoting…</>
                      : <><RefreshCw className="h-4 w-4 mr-2" />Promote to {SemLabel(expectedEven)}</>}
                  </Button>
                )}
                {isAtOdd && count === 0 && (
                  <p className="text-center text-xs text-gray-400">Import students via CSV to enable promotion.</p>
                )}

                {/* Even semester — shows "awaiting year-end advancement" note */}
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

                {!ys || count === 0 ? (
                  <p className="text-center text-xs text-gray-400">No active students</p>
                ) : null}
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
              <li>
                <span className="inline-block w-28 font-medium text-amber-700">LY (Sem 8) →</span>
                Graduated · marked as alumni
              </li>
              <li>
                <span className="inline-block w-28 font-medium text-blue-700">TY (Sem 6) →</span>
                Moves to LY (Sem 7) divisions
              </li>
              <li>
                <span className="inline-block w-28 font-medium text-green-700">SY (Sem 4) →</span>
                Moves to TY (Sem 5) divisions
              </li>
              <li>
                <span className="inline-block w-28 font-medium text-purple-700">FY (Sem 2) →</span>
                Moves to SY (Sem 3) divisions
              </li>
            </ul>
            <p className="mt-2 text-xs text-gray-400">
              Only students at the correct even semester are moved. New FY students can be imported via CSV after advancement.
            </p>
          </div>

          {!confirmAdvance ? (
            <Button
              className="w-full bg-primary"
              onClick={() => setConfirmAdvance(true)}
              disabled={advancing || !canAdvance}
            >
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
                <Button
                  className="flex-1 bg-primary"
                  onClick={handleAdvanceYear}
                  disabled={advancing}
                >
                  {advancing ? <Spinner className="h-4 w-4" /> : "Yes, Advance"}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setConfirmAdvance(false)}
                >
                  Cancel
                </Button>
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
