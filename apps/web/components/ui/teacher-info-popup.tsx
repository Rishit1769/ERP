"use client";

import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { X, User } from "lucide-react";

interface FacultyInfo {
  erp_id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  dept_code: string;
  roles: string;
}

interface Props {
  erpId: string;
  name: string;
}

export function TeacherInfoPopup({ erpId, name }: Props) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<FacultyInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleOpen() {
    setOpen(true);
    if (info) return;
    setLoading(true);
    try {
      const { data } = await api.get<FacultyInfo>(`/timetable/faculty-info/${erpId}`);
      setInfo(data);
    } catch {
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={handleOpen}
        className="text-blue-600 hover:underline hover:text-blue-800 transition-colors"
        title="View faculty info"
      >
        {name}
      </button>

      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 w-72 rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <User className="h-4 w-4 text-gray-500" />
              Faculty Info
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="px-4 py-3 space-y-1 text-sm">
            {loading ? (
              <p className="text-gray-400 text-center py-2">Loading…</p>
            ) : info ? (
              <>
                <p className="font-semibold text-gray-900">{info.name}</p>
                <p className="text-gray-500 text-xs">{info.erp_id}</p>
                <p className="text-gray-700">{info.department} ({info.dept_code})</p>
                {info.roles && (
                  <p className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-0.5 inline-block mt-1">
                    {info.roles}
                  </p>
                )}
                <div className="pt-1 space-y-0.5 text-xs text-gray-500">
                  <p>{info.email}</p>
                  <p>{info.phone}</p>
                </div>
              </>
            ) : (
              <p className="text-gray-400 text-center py-2">Info not available</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
