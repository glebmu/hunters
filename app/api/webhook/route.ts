import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const body = await req.json();
  const dealLink: string = body.deal_link ?? body.link ?? body.url;

  if (!dealLink) {
    return NextResponse.json({ error: "deal_link is required" }, { status: 400 });
  }

  const today = new Date(new Date().toDateString());

  // If deal already assigned — return existing manager
  const existing = await prisma.deal.findUnique({
    where: { dealLink },
    include: { manager: true },
  });
  if (existing) {
    return NextResponse.json({ manager: existing.manager.name, dealLink, existing: true });
  }

  // Load managers with today's quotas and deal counts
  const managers = await prisma.manager.findMany({
    where: { isActive: true },
    orderBy: { position: "asc" },
    include: {
      quotas: { where: { date: today } },
      deals: { where: { date: today } },
    },
  });

  // Find active managers (deals today < quota today) and pick the one with fewest deals
  const activeManagers = managers.filter((m) => {
    const quota = m.quotas[0]?.quota ?? 0;
    return quota > 0 && m.deals.length < quota;
  });

  if (activeManagers.length === 0) {
    return NextResponse.json({ error: "No active managers available today" }, { status: 422 });
  }

  const selected = activeManagers.reduce((min, m) =>
    m.deals.length < min.deals.length ? m : min
  );

  // Save deal
  await prisma.deal.create({
    data: { dealLink, managerId: selected.id, date: today },
  });

  return NextResponse.json({ manager: selected.name, dealLink, existing: false });
}
