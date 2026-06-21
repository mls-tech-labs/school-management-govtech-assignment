"use client";
import { Select } from "@/components/Select";

/**
 * Level dropdown data shape — the row carries `ulid` per FR-021 so
 * the Add Class form can build the nested `level: { ulid, name }`
 * body that the API expects (per Clarifications, Session 2026-06-20).
 */
export interface LevelSelectProps {
  levels: { ulid: string; name: string; active: boolean }[];
  value: string;
  onChange: (v: string) => void;
  error?: string;
}

export function LevelSelect({ levels, value, onChange, error }: LevelSelectProps) {
  return (
    <Select
      label="Class Level"
      name="level"
      value={value}
      onChange={onChange}
      options={levels.map((l) => l.name)}
      placeholder="Select a level"
      required
      error={error}
    />
  );
}
