import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/quotas/copy
 * Body: { fromDate: "YYYY-MM-DD", toDate: "YYYY-MM-DD" }
 *
 * Copies all quotas from fromDate to toDate.
 * Skips managers that already have a quota set for toDate.
 */
export async function POST(req: Request) {
  const { fromDate, toDate } = await req.json();

  const from = new Date(fromDate);
  const to = new Date(toDate);

  const sourceQuotas = await prisma.dailyQuota.findMany({
    where: { date: from },
  });

  const existingOnTarget = await prisma.dailyQuota.findMany({
    where: { date: to },
    select: { managerId: true },
  });
  const alreadySet = new Set(existingOnTarget.map((q) => q.managerId));

  const toCreate = sourceQuotas.filter((q) => !alreadySet.has(q.managerId));

  await prisma.dailyQuota.createMany({
    data: toCreate.map((q) => ({
      managerId: q.managerId,
      date: to,
      quota: q.quota,
    })),
  });

  return NextResponse.json({ copied: toCreate.length });
}
