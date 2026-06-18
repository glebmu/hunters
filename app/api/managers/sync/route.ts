import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1RbuYCYpu9dO_2xITR0N6zTk55V2000LBOpvuTHsrI1A/export?format=csv&gid=1714113755";

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') { cell += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cell += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(cell); cell = ""; }
      else if (ch === '\r' && next === '\n') { row.push(cell); rows.push(row); row = []; cell = ""; i++; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ""; }
      else { cell += ch; }
    }
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/**
 * POST /api/managers/sync
 * Fetches manager names from the Google Sheet in order,
 * creates missing managers in DB, and reorders all to match the sheet.
 */
export async function POST() {
  const csvRes = await fetch(SHEET_CSV_URL, { next: { revalidate: 0 } });
  if (!csvRes.ok) {
    return NextResponse.json({ error: "Failed to fetch Google Sheet" }, { status: 502 });
  }

  const rows = parseCSV(await csvRes.text());

  // Manager names in sheet order (skip header row, skip empty)
  const sheetNames: string[] = [];
  for (let r = 1; r < rows.length; r++) {
    const name = rows[r][0]?.replace(/[\r\n]+/g, " ").trim();
    if (name) sheetNames.push(name);
  }

  if (sheetNames.length === 0) {
    return NextResponse.json({ error: "No managers found in sheet" }, { status: 422 });
  }

  const dbManagers = await prisma.manager.findMany();
  const dbByName = new Map(dbManagers.map((m) => [m.name.trim(), m]));

  // Create managers that exist in sheet but not in DB
  let added = 0;
  for (const name of sheetNames) {
    if (!dbByName.has(name)) {
      const created = await prisma.manager.create({
        data: { name, position: 99999 + added },
      });
      dbByName.set(name, created);
      added++;
    }
  }

  // Build final ordered list: sheet order first, then DB-only managers at end
  const sheetIds = sheetNames
    .map((name) => dbByName.get(name)?.id)
    .filter((id): id is string => id !== undefined);

  const sheetIdSet = new Set(sheetIds);
  const extraIds = dbManagers
    .filter((m) => !sheetIdSet.has(m.id))
    .sort((a, b) => a.position - b.position)
    .map((m) => m.id);

  const orderedIds = [...sheetIds, ...extraIds];

  // position is no longer @unique, so updating rows independently is safe.
  await Promise.all(
    orderedIds.map((id, i) =>
      prisma.manager.update({ where: { id }, data: { position: i + 1 } })
    )
  );

  return NextResponse.json({ ok: true, total: sheetNames.length, added });
}
