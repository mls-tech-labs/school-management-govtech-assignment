"use client";

import { RowActionsMenu } from "./RowActionsMenu";

export interface TeacherRow {
  ulid: string;
  name: string;
  subject: { ulid: string; name: string };
  email: string;
  contactNumber: string;
}

export interface TeacherTableProps {
  teachers: TeacherRow[];
  /** Called after a successful delete (or silent 404) so the list can refresh. */
  onTeacherDeleted?: () => void;
}

export function TeacherTable({ teachers, onTeacherDeleted }: TeacherTableProps) {
  const fmt = (n: string) => `${n.slice(0, 4)} ${n.slice(4)}`;
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-surface-border bg-surface-muted">
            <th className="w-14 px-4 py-3 font-semibold">#</th>
            <th className="px-4 py-3 font-semibold">Name</th>
            <th className="px-4 py-3 font-semibold">Subject</th>
            <th className="px-4 py-3 font-semibold">Email</th>
            <th className="px-4 py-3 font-semibold">Work Contact</th>
            <th className="px-4 py-3 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {teachers.map((t, idx) => (
            <tr
              key={t.ulid}
              className="border-b border-surface-border last:border-0"
            >
              <td className="px-4 py-3">{idx + 1}</td>
              <td className="px-4 py-3">{t.name}</td>
              <td className="px-4 py-3">{t.subject.name}</td>
              <td className="px-4 py-3">{t.email}</td>
              <td className="px-4 py-3 whitespace-nowrap">{fmt(t.contactNumber)}</td>
              <td className="px-4 py-3 text-right">
                <RowActionsMenu
                  ulid={t.ulid}
                  name={t.name}
                  resource="teacher"
                  onDeleted={onTeacherDeleted ?? (() => {})}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
