"use client";

import { useEffect, useState, type FormEvent } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";
import Link from "next/link";

interface Dept {
  id: number;
  code: string;
  name: string;
}

interface Division {
  id: number;
  dept_id: number;
  dept_code: string;
  dept_name: string;
  year: number;
  label: string;
}

const YEAR_LABELS: Record<number, string> = { 1: "FY", 2: "SY", 3: "TY", 4: "LY" };

export default function DepartmentsPage() {
  const [depts, setDepts] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Divisions state
  const [divDeptId, setDivDeptId] = useState<string>("");
  const [divYear, setDivYear] = useState<string>("1");
  const [divCount, setDivCount] = useState<string>("1");
  const [divSubmitting, setDivSubmitting] = useState(false);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [divsLoading, setDivsLoading] = useState(false);

  async function loadDepts() {
    try {
      const { data } = await api.get("/admin/departments");
      setDepts(data);
    } finally {
      setLoading(false);
    }
  }

  async function loadDivisions(deptId?: string) {
    setDivsLoading(true);
    try {
      const params = deptId ? `?dept_id=${deptId}` : "";
      const { data } = await api.get(`/admin/divisions${params}`);
      setDivisions(data);
    } catch {
      // silently ignore
    } finally {
      setDivsLoading(false);
    }
  }

  useEffect(() => {
    loadDepts();
    loadDivisions();
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;
    setSubmitting(true);
    try {
      await api.post("/admin/departments", { code: code.trim().toUpperCase(), name: name.trim() });
      toast.success("Department added");
      setCode("");
      setName("");
      loadDepts();
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed"
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddDivisions(e: FormEvent) {
    e.preventDefault();
    const count = parseInt(divCount, 10);
    if (!divDeptId || !divYear || isNaN(count) || count < 1 || count > 26) return;
    setDivSubmitting(true);
    try {
      const { data } = await api.post("/admin/divisions/bulk", {
        dept_id: parseInt(divDeptId, 10),
        year: parseInt(divYear, 10),
        count,
      });
      const created: string[] = data.created ?? [];
      const skipped: string[] = data.skipped ?? [];
      if (created.length > 0) {
        toast.success(`Created divisions: ${created.join(", ")}`);
      }
      if (skipped.length > 0) {
        toast(`Already existed (skipped): ${skipped.join(", ")}`, { icon: "⚠️" });
      }
      loadDivisions(divDeptId || undefined);
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed"
      );
    } finally {
      setDivSubmitting(false);
    }
  }

  // Group divisions by dept → year for display
  const groupedDivisions = divisions.reduce<Record<string, Record<number, Division[]>>>(
    (acc, div) => {
      const deptKey = `${div.dept_code} — ${div.dept_name}`;
      if (!acc[deptKey]) acc[deptKey] = {};
      if (!acc[deptKey][div.year]) acc[deptKey][div.year] = [];
      acc[deptKey][div.year].push(div);
      return acc;
    },
    {}
  );

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Departments &amp; Divisions</h2>

      {/* ── Add Department ─────────────────────────────────────────── */}
      <Card>
        <CardHeader><CardTitle>Add Department</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Input
              id="dept_code"
              label="Code"
              placeholder="e.g. COMPS"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="sm:w-36"
            />
            <Input
              id="dept_name"
              label="Name"
              placeholder="e.g. Computer Science"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="sm:flex-1"
            />
            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding…" : "Add"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── All Departments ────────────────────────────────────────── */}
      <Card>
        <CardHeader><CardTitle>All Departments</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <Spinner />
          ) : depts.length === 0 ? (
            <p className="text-gray-500">No departments yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4">ID</th>
                  <th className="py-2 pr-4">Code</th>
                  <th className="py-2">Name</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {depts.map((d) => (
                  <tr key={d.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 pr-4 text-gray-500">{d.id}</td>
                    <td className="py-2 pr-4 font-mono">{d.code}</td>
                    <td className="py-2">{d.name}</td>
                    <td className="py-2 text-right">
                      <Link
                        href={`/dashboard/admin/departments/${d.id}`}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        View Analytics →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* ── Add Divisions ──────────────────────────────────────────── */}
      <Card>
        <CardHeader><CardTitle>Add Divisions to Department</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-4">
            Enter how many divisions you want — they will be labelled A, B, C… automatically.
            Already-existing divisions are skipped.
          </p>
          <form onSubmit={handleAddDivisions} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {/* Department */}
            <div className="flex flex-col gap-1 sm:flex-1">
              <label className="text-sm font-medium">Department</label>
              <select
                value={divDeptId}
                onChange={(e) => setDivDeptId(e.target.value)}
                required
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="" disabled>Select department…</option>
                {depts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} — {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Year */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Year</label>
              <select
                value={divYear}
                onChange={(e) => setDivYear(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="1">FY (1st Year)</option>
                <option value="2">SY (2nd Year)</option>
                <option value="3">TY (3rd Year)</option>
                <option value="4">LY (4th Year)</option>
              </select>
            </div>

            {/* Count */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Number of Divisions</label>
              <Input
                id="div_count"
                type="number"
                min={1}
                max={26}
                value={divCount}
                onChange={(e) => setDivCount(e.target.value)}
                className="w-24"
              />
            </div>

            <Button type="submit" disabled={divSubmitting || !divDeptId}>
              {divSubmitting ? "Creating…" : "Create"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Existing Divisions ─────────────────────────────────────── */}
      <Card>
        <CardHeader><CardTitle>Existing Divisions</CardTitle></CardHeader>
        <CardContent>
          {divsLoading ? (
            <Spinner />
          ) : Object.keys(groupedDivisions).length === 0 ? (
            <p className="text-gray-500">No divisions created yet.</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedDivisions).map(([deptLabel, yearMap]) => (
                <div key={deptLabel}>
                  <h3 className="font-semibold text-sm mb-2">{deptLabel}</h3>
                  <div className="space-y-1 pl-4">
                    {Object.entries(yearMap)
                      .sort(([a], [b]) => Number(a) - Number(b))
                      .map(([year, divs]) => (
                        <div key={year} className="flex items-center gap-2 text-sm">
                          <span className="w-8 font-mono text-gray-500">
                            {YEAR_LABELS[Number(year)] ?? year}
                          </span>
                          <div className="flex gap-1 flex-wrap">
                            {divs.map((div) => (
                              <span
                                key={div.id}
                                className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs"
                              >
                                {div.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
