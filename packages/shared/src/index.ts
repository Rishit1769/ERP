import { z } from "zod";

// ─── Role Enums ─────────────────────────────────────────────────────────────

export const BaseRole = z.enum(["STUDENT", "EMPLOYEE"]);
export type BaseRole = z.infer<typeof BaseRole>;

export const EmployeeRoleType = z.enum([
  "HOD",
  "SUBJECT_TEACHER",
  "PRACTICAL_TEACHER",
  "CLASS_INCHARGE",
  "TEACHER_GUARDIAN",
  "PLACEMENT_OFFICER",
  "ADMIN",
  "SUPER_ADMIN",
  "WARDEN",
  "LIBRARIAN",
]);
export type EmployeeRoleType = z.infer<typeof EmployeeRoleType>;

export const CsvRole = z.enum([
  "student",
  "teacher",
  "HOD",
  "practical_teacher",
  "placement_officer",
  "admin",
  "warden",
  "librarian",
]);
export type CsvRole = z.infer<typeof CsvRole>;

// Mapping CSV role → base role
export const csvRoleToBase: Record<CsvRole, BaseRole> = {
  student: "STUDENT",
  teacher: "EMPLOYEE",
  HOD: "EMPLOYEE",
  practical_teacher: "EMPLOYEE",
  placement_officer: "EMPLOYEE",
  admin: "EMPLOYEE",
  warden: "EMPLOYEE",
  librarian: "EMPLOYEE",
};

// Mapping CSV role → employee role type (null for students)
export const csvRoleToEmployeeRole: Record<CsvRole, EmployeeRoleType | null> = {
  student: null,
  teacher: "SUBJECT_TEACHER",
  HOD: "HOD",
  practical_teacher: "PRACTICAL_TEACHER",
  placement_officer: "PLACEMENT_OFFICER",
  admin: "ADMIN",
  warden: "WARDEN",
  librarian: "LIBRARIAN",
};

// ─── Student UID Utilities ───────────────────────────────────────────────────

/** Student UID: startYear-DeptDivRoll-endYear e.g. 2025-COMPSA01-2029 */
export const STUDENT_UID_REGEX = /^\d{4}-[A-Z]{2,}[A-Z]\d{2}-\d{4}$/;

export function parseStudentUid(uid: string) {
  const match = uid.toUpperCase().match(/^(\d{4})-([A-Z]+)(\d{2})-(\d{4})$/);
  if (!match) return null;
  const alphaBlock = match[2];
  if (alphaBlock.length < 2) return null;
  return {
    startYear: parseInt(match[1]),
    deptCode: alphaBlock.slice(0, -1),
    divisionLabel: alphaBlock.slice(-1),
    rollNo: match[3],
    endYear: parseInt(match[4]),
  };
}

// ─── CSV Import Schema ───────────────────────────────────────────────────────

export const CsvRowSchema = z.object({
  erp_id: z
    .string()
    .min(2, "ERP ID too short")
    .transform((v) => v.toUpperCase().trim())
    .refine(
      (v) => /^E[A-Z0-9]+$/.test(v) || /^S[A-Z0-9]+$/.test(v),
      "ERP ID: students must start with S (e.g. S2001), employees with E (e.g. E1001)"
    ),
  uid: z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim() || undefined),
  name: z.string().min(2, "Name must be at least 2 characters"),
  department: z
    .string()
    .min(1, "Department is required")
    .transform((v) => v.toUpperCase().trim()),
  role: CsvRole,
  email: z.string().email("Invalid email address").refine(
    (v) => v.toLowerCase().endsWith("@tcetmumbai.in"),
    { message: "Only @tcetmumbai.in email addresses are allowed" }
  ),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Phone must be a valid 10-digit Indian number"),
  year: z.coerce
    .number()
    .int()
    .min(0)
    .max(4)
    .default(0)
    .describe("Academic year: 0 for employees, 1-4 for students (1=FY,2=SY,3=TY,4=LY)"),
  semester: z.coerce
    .number()
    .int()
    .min(0)
    .max(8)
    .default(0)
    .describe("Semester: 0 for employees, 1-8 for students"),
});

export type CsvRow = z.infer<typeof CsvRowSchema>;

export const CsvRowWithErrors = CsvRowSchema.partial().extend({
  _rowIndex: z.number(),
  _errors: z.record(z.string()).optional(),
  _raw: z.record(z.string()).optional(),
});
export type CsvRowWithErrors = z.infer<typeof CsvRowWithErrors>;

// ─── Auth Schemas ────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  identifier: z.string().min(1, "ERP ID or Email is required"),
  password: z.string().min(1, "Password is required"),
});
export type LoginSchema = z.infer<typeof LoginSchema>;

export const ChangePasswordSchema = z
  .object({
    new_password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain at least one uppercase letter")
      .regex(/[0-9]/, "Must contain at least one number"),
    confirm_password: z.string(),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });
export type ChangePasswordSchema = z.infer<typeof ChangePasswordSchema>;

// ─── JWT Payload ─────────────────────────────────────────────────────────────

export interface JwtPayload {
  erp_id: string;
  base_role: BaseRole;
  dept_id: number | null;
  scope: "restricted" | "full";
  iat?: number;
  exp?: number;
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export const AttendanceStatus = z.enum(["PRESENT", "ABSENT", "OD", "DISPUTED"]);
export type AttendanceStatus = z.infer<typeof AttendanceStatus>;

export const MarkAttendanceSchema = z.object({
  slot_id: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  records: z.array(
    z.object({
      student_erp_id: z.string(),
      status: z.enum(["PRESENT", "ABSENT"]),
    })
  ).min(1, "At least one attendance record required"),
  idempotency_key: z.string().uuid("Must be a valid UUID"),
});
export type MarkAttendanceSchema = z.infer<typeof MarkAttendanceSchema>;

// ─── Marks ───────────────────────────────────────────────────────────────────

export const ExamType = z.enum(["UT1", "UT2", "PRELIM", "END_SEM", "INTERNAL"]);
export type ExamType = z.infer<typeof ExamType>;

export const MarkEntrySchema = z.object({
  subject_id: z.number().int().positive(),
  division_id: z.number().int().positive(),
  exam_type: ExamType,
  max_marks: z.number().int().positive().max(200),
  records: z.array(
    z.object({
      student_erp_id: z.string(),
      marks: z.number().min(0),
    })
  ).min(1),
});
export type MarkEntrySchema = z.infer<typeof MarkEntrySchema>;

export const PracticalMarkEntrySchema = z.object({
  subject_id: z.number().int().positive(),
  batch_label: z.string().min(1),
  max_marks: z.number().int().positive().max(200),
  records: z.array(
    z.object({
      student_erp_id: z.string(),
      marks: z.number().min(0),
    })
  ).min(1),
});
export type PracticalMarkEntrySchema = z.infer<typeof PracticalMarkEntrySchema>;

// Experiment config set by a practical teacher for their assignment
export const PracticalExperimentConfigSchema = z.object({
  subject_assignment_id: z.number().int().positive(),
  experiment_count: z.number().int().min(1).max(30),
  marks_per_experiment: z.number().min(0).max(100),
});
export type PracticalExperimentConfigSchema = z.infer<typeof PracticalExperimentConfigSchema>;

export const ExperimentMarkEntrySchema = z.object({
  subject_assignment_id: z.number().int().positive(),
  records: z.array(
    z.object({
      student_erp_id: z.string(),
      experiment_no: z.number().int().min(1).max(30),
      marks_obtained: z.number().min(0),
    })
  ).min(1),
});
export type ExperimentMarkEntrySchema = z.infer<typeof ExperimentMarkEntrySchema>;

// ─── Grievance / OD ──────────────────────────────────────────────────────────

export const GrievanceStatus = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CLARIFICATION",
]);
export type GrievanceStatus = z.infer<typeof GrievanceStatus>;

export const OdStatus = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CLARIFICATION",
]);
export type OdStatus = z.infer<typeof OdStatus>;

export const OdRequestSchema = z.object({
  dates: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .min(1, "At least one date required")
    .max(30, "Max 30 dates per OD request"),
  reason: z.string().min(10, "Reason must be at least 10 characters"),
});
export type OdRequestSchema = z.infer<typeof OdRequestSchema>;

export const ReviewDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "CLARIFICATION"]),
  note: z.string().optional(),
});
export type ReviewDecisionSchema = z.infer<typeof ReviewDecisionSchema>;

// ─── AICTE ───────────────────────────────────────────────────────────────────

export const AicteCategory = z.enum([
  "SPORTS",
  "CULTURAL",
  "NSS",
  "TECHNICAL",
  "RESEARCH",
  "ENTREPRENEURSHIP",
  "OTHER",
]);
export type AicteCategory = z.infer<typeof AicteCategory>;

export const AicteActivitySchema = z.object({
  category: AicteCategory,
  description: z.string().min(10, "Description too short"),
  claimed_points: z.number().int().min(1).max(50),
});
export type AicteActivitySchema = z.infer<typeof AicteActivitySchema>;

// ─── Admin Thresholds ────────────────────────────────────────────────────────

export const SetThresholdSchema = z.object({
  key_name: z.string().min(1),
  value: z.number().min(0).max(100),
  dept_id: z.number().int().positive().nullable().optional(),
});
export type SetThresholdSchema = z.infer<typeof SetThresholdSchema>;

// ─── HOD Role Assignment ──────────────────────────────────────────────────────

export const AssignSubjectTeacherSchema = z.object({
  teacher_erp_id: z.string(),
  subject_id: z.number().int().positive(),
  division_id: z.number().int().positive(),
  type: z.enum(["THEORY", "PRACTICAL"]),
  batch_label: z.string().optional(),
});
export type AssignSubjectTeacherSchema = z.infer<typeof AssignSubjectTeacherSchema>;

export const AssignClassInchargeSchema = z.object({
  teacher_erp_id: z.string(),
  division_id: z.number().int().positive(),
});
export type AssignClassInchargeSchema = z.infer<typeof AssignClassInchargeSchema>;

export const AssignTgSchema = z.object({
  teacher_erp_id: z.string(),
  division_id: z.number().int().positive(),
  // When empty the server creates an empty TG group (students can be added later)
  student_erp_ids: z
    .array(z.string())
    .max(20, "Max 20 students per TG group")
    .default([]),
});
export type AssignTgSchema = z.infer<typeof AssignTgSchema>;

// ─── Timetable ────────────────────────────────────────────────────────────────

export const DayOfWeek = z.enum([
  "MON","TUE","WED","THU","FRI","SAT",
]);
export type DayOfWeek = z.infer<typeof DayOfWeek>;

export const TimetableSlotSchema = z.object({
  subject_assignment_id: z.number().int().positive(),
  day: DayOfWeek,
  start_time: z.string().regex(/^\d{2}:\d{2}$/, "Format HH:MM"),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, "Format HH:MM"),
  room: z.string().min(1),
});
export type TimetableSlotSchema = z.infer<typeof TimetableSlotSchema>;

export const LocationOverrideSchema = z.object({
  room: z.string().min(1, "Room is required"),
});
export type LocationOverrideSchema = z.infer<typeof LocationOverrideSchema>;

// ─── HOD Semester Management ──────────────────────────────────────────────────

export const UpdateSubjectAssignmentSchema = z.object({
  subject_id: z.number().int().positive().optional(),
  division_id: z.number().int().positive().optional(),
  type: z.enum(["THEORY", "PRACTICAL"]).optional(),
  batch_label: z.string().nullable().optional(),
  teacher_erp_id: z.string().optional(),
});
export type UpdateSubjectAssignmentSchema = z.infer<typeof UpdateSubjectAssignmentSchema>;

export const UpdateEmployeeRoleSchema = z.object({
  role_type: EmployeeRoleType,
});
export type UpdateEmployeeRoleSchema = z.infer<typeof UpdateEmployeeRoleSchema>;

export const BulkReassignSchema = z.object({
  division_id: z.number().int().positive(),
  assignments: z.array(
    z.object({
      teacher_erp_id: z.string(),
      subject_id: z.number().int().positive(),
      type: z.enum(["THEORY", "PRACTICAL"]),
      batch_label: z.string().nullable().optional(),
    })
  ).min(1, "At least one assignment required"),
});
export type BulkReassignSchema = z.infer<typeof BulkReassignSchema>;
