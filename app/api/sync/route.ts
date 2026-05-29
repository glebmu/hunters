import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1RbuYCYpu9dO_2xITR0N6zTk55V2000LBOpvuTHsrI1A/export?format=csv&gid=1714113755";

const AMO_BASE = "https://zhe.amocrm.ru/leads/detail/";

/** Extract numeric deal ID from any URL/string, return canonical URL */
function normalizeDeal(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const pathMatch = s.match(/\/leads\/detail\/(\d+)/);
  if (pathMatch) return AMO_BASE + pathMatch[1];
  const numMatch = s.match(/(\d{5,})/);
  if (numMatch) return AMO_BASE + numMatch[1];
  return null;
}

/** Parse a raw CSV string into rows of cells, handling quoted multiline fields */
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

const RU_MONTHS: Record<string, string> = {
  января: "01", февраля: "02", марта: "03", апреля: "04",
  мая: "05", июня: "06", июля: "07", августа: "08",
  сентября: "09", октября: "10", ноября: "11", декабря: "12",
};

/**
 * Parse date strings from the sheet header.
 * Formats: "28 мая", "03.05.2026"
 * yearHint: fallback year when the date has no explicit year.
 */
function parseSheetDate(s: string, yearHint: number): string | null {
  s = s.trim();
  // DD.MM.YYYY
  const dot = s.match(/^(\d{1,2})\.(\d{2})\.(\d{4})$/);
  if (dot) return `${dot[3]}-${dot[2].padStart(2, "0")}-${dot[1].padStart(2, "0")}`;
  // "D месяц"
  const ru = s.match(/^(\d{1,2})\s+([а-яё]+)$/i);
  if (ru) {
    const m = RU_MONTHS[ru[2].toLowerCase()];
    if (m) return `${yearHint}-${m}-${ru[1].padStart(2, "0")}`;
  }
  return null;
}

/**
 * POST /api/sync
 * Body: { date: "YYYY-MM-DD" }
 *
 * Fetches the Google Sheet, syncs managers + quotas + deals for the given date.
 */
export async function POST(req: Request) {
  const { date } = await req.json();
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  // 1. Fetch CSV
  const csvRes = await fetch(SHEET_CSV_URL, { next: { revalidate: 0 } });
  if (!csvRes.ok) {
    return NextResponse.json({ error: "Failed to fetch Google Sheet" }, { status: 502 });
  }
  const csvText = await csvRes.text();
  const rows = parseCSV(csvText);
  if (rows.length < 2) return NextResponse.json({ error: "Sheet is empty" }, { status: 422 });

  // 2. Find the year from any DD.MM.YYYY date in header row
  const headerRow = rows[0];
  let yearHint = new Date().getFullYear();
  for (const cell of headerRow) {
    const dot = cell.trim().match(/^(\d{1,2})\.(\d{2})\.(\d{4})$/);
    if (dot) { yearHint = parseInt(dot[3]); break; }
  }

  // 3. Find the column index for the requested date
  let dateColIdx = -1;
  for (let c = 0; c < headerRow.length; c++) {
    const parsed = parseSheetDate(headerRow[c], yearHint);
    if (parsed === date) { dateColIdx = c; break; }
  }
  if (dateColIdx === -1) {
    return NextResponse.json({ error: `Date ${date} not found in sheet` }, { status: 422 });
  }

  // 4. Parse manager rows
  type SheetManager = { name: string; quota: number; deals: string[] };
  const sheetManagers: SheetManager[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const name = row[0]?.replace(/[\r\n]+/g, " ").trim();
    if (!name) continue;

    const quotaRaw = row[dateColIdx]?.trim();
    const quota = quotaRaw ? parseInt(quotaRaw) || 0 : 0;

    const linksRaw = row[dateColIdx + 1] ?? "";
    const deals = linksRaw
      .split(/\r?\n/)
      .map((l) => normalizeDeal(l))
      .filter((l): l is string => l !== null);

    sheetManagers.push({ name, quota, deals });
  }

  // 5. Get existing managers from DB
  const dbManagers = await prisma.manager.findMany({ orderBy: { position: "asc" } });
  const dbByName = new Map(dbManagers.map((m) => [m.name.trim(), m]));

  // 6. Add managers present in sheet but missing in DB
  let nextPos = (dbManagers[dbManagers.length - 1]?.position ?? 0) + 1;
  let added = 0;
  for (const sm of sheetManagers) {
    if (!dbByName.has(sm.name)) {
      const created = await prisma.manager.create({
        data: { name: sm.name, position: nextPos++ },
      });
      dbByName.set(sm.name, created);
      added++;
    }
  }

  const targetDate = new Date(date);

  // 7. Upsert quotas for each manager from the sheet
  for (const sm of sheetManagers) {
    const m = dbByName.get(sm.name);
    if (!m) continue;
    await prisma.dailyQuota.upsert({
      where: { managerId_date: { managerId: m.id, date: targetDate } },
      update: { quota: sm.quota },
      create: { managerId: m.id, date: targetDate, quota: sm.quota },
    });
  }

  // 8. Replace deals for this date to match the sheet exactly
  //    First delete all existing deals for the date, then recreate.
  await prisma.deal.deleteMany({ where: { date: targetDate } });

  for (const sm of sheetManagers) {
    const m = dbByName.get(sm.name);
    if (!m) continue;
    for (const link of sm.deals) {
      // upsert guards against a link that may exist for a different date
      await prisma.deal.upsert({
        where: { dealLink: link },
        update: { managerId: m.id, date: targetDate },
        create: { dealLink: link, managerId: m.id, date: targetDate },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    date,
    managers: sheetManagers.length,
    added,
  });
}
