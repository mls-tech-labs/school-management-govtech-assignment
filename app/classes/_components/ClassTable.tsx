"use client";

export interface ClassRow {
  ulid: string;
  level: string;
  name: string;
  formTeacher: { name: string };
}

export function ClassTable({ classes }: { classes: ClassRow[] }) {
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-surface-border bg-surface-muted">
            <th className="w-16 px-4 py-3 font-semibold">#</th>
            <th className="px-4 py-3 font-semibold">Class Level</th>
            <th className="px-4 py-3 font-semibold">Class Name</th>
            <th className="px-4 py-3 font-semibold">Form Teacher</th>
          </tr>
        </thead>
        <tbody>
          {classes.map((c, idx) => (
            <tr
              key={c.name}
              className="border-b border-surface-border last:border-0"
            >
              <td className="px-4 py-3">{idx + 1}</td>
              <td className="px-4 py-3">{c.level}</td>
              <td className="px-4 py-3">{c.name}</td>
              <td className="px-4 py-3">{c.formTeacher.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}