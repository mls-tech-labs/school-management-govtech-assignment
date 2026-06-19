"use client";
import { Select } from "@/components/Select";

export interface LevelSelectProps {
  levels: { name: string; active: boolean }[];
  value: string;
  onChange: (v: string) => void;
  error?: string;
}

/** Non-searchable Class Level dropdown (mirrors `Subject` dropdown). */
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
