"use client";

/**
 * Wire shape of a class entry in `GET /api/v1.0/classes` (per
 * `003-backend-api-db/spec.md` Clarifications, Session 2026-06-20
 * — POST/GET reference object shape). `level` and `formTeacher`
 * are nested `{ ulid, name }` objects; the table renders the
 * authoritative `.name` fields.
 */
export interface ClassRow {
  ulid: string;
  level: { ulid: string; name: string };
  name: string;
  formTeacher: { ulid: string; name: string };
}

export function ClassTable({ classes }: { classes: ClassRow[] }) {
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-surface-border bg-surface-muted">
            <th className="w-14 px-4 py-3 font-semibold">#</th>
            <th className="px-4 py-3 font-semibold">Class Level</th>
            <th className="px-4 py-3 font-semibold">Class Name</th>
            <th className="px-4 py-3 font-semibold">Form Teacher</th>
          </tr>
        </thead>
        <tbody>
          {classes.map((c, idx) => (
            <tr
              key={c.ulid}
              className="border-b border-surface-border last:border-0"
            >
              <td className="px-4 py-3">{idx + 1}</td>
              <td className="px-4 py-3">{c.level.name}</td>
              <td className="px-4 py-3">{c.name}</td>
              <td className="px-4 py-3">{c.formTeacher.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
