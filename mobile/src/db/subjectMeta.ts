import { asc, eq } from "drizzle-orm";
import { db } from "./client";
import { subjects } from "./schema";

export type SubjectMetaRow = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  colorBg: string | null;
};

const COLUMNS = {
  id: subjects.id,
  name: subjects.name,
  icon: subjects.icon,
  color: subjects.color,
  colorBg: subjects.colorBg,
};

/** All synced subjects in the admin's display order. */
export async function getAllSubjects(): Promise<SubjectMetaRow[]> {
  return db.select(COLUMNS).from(subjects).orderBy(asc(subjects.displayOrder), asc(subjects.name)).all();
}

/**
 * Looked up by name because several screens only carry a subject name (a recorded
 * session, a mock-test result row) rather than an id. Returns null when there's no
 * match, and callers fall back to neutral styling rather than failing.
 */
export async function getSubjectMetaByName(name: string): Promise<SubjectMetaRow | null> {
  const row = await db.select(COLUMNS).from(subjects).where(eq(subjects.name, name)).get();
  return row ?? null;
}
