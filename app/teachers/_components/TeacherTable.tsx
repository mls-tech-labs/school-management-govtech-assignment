"use client";

export interface TeacherRow {
  ulid: string;
  name: string;
  subject: string;
  email: string;
  contactNumber: string;
}

export interface TeacherTableProps {
  teachers: TeacherRow[];
}

/**
 * Display-only table for the Teachers list. Layout uses Tailwind utility
 * classes (per Constitution v2.3.0, Technical Stack Constraints).
 */
export function TeacherTable({ teachers }: TeacherTableProps) {
  const fmt = (n: string) => `${n.slice(0, 4)} ${n.slice(4)}`;
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-surface-border bg-surface-muted">
            <th className="w-16 px-4 py-3 font-semibold">#</th>
            <th className="px-4 py-3 font-semibold">Name</th>
            <th className="px-4 py-3 font-semibold">Subject</th>
            <th className="px-4 py-3 font-semibold">Email</th>
            <th className="px-4 py-3 font-semibold">Work Contact</th>
          </tr>
        </thead>
        <tbody>
          {teachers.map((t, idx) => (
            <tr
              key={t.email}
              className="border-b border-surface-border last:border-0"
            >
              <td className="px-4 py-3">{idx + 1}</td>
              <td className="px-4 py-3">{t.name}</td>
              <td className="px-4 py-3">{t.subject}</td>
              <td className="px-4 py-3">{t.email}</td>
              <td className="px-4 py-3">{fmt(t.contactNumber)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
