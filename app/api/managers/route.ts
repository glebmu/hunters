import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const date = dateParam
    ? new Date(dateParam)
    : new Date(new Date().toDateString());

  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  const managers = await prisma.manager.findMany({
    orderBy: { position: "asc" },
    include: {
      quotas: { where: { date } },
      deals: { where: { date } },
      _count: {
        select: {
          deals: { where: { date: { gte: monthStart, lte: monthEnd } } },
        },
      },
    },
  });

  return NextResponse.json(
    managers.map((m) => ({
      ...m,
      monthDealsCount: m._count.deals,
      _count: undefined,
    }))
  );
}

export async function POST(req: Request) {
  const { name } = await req.json();
  const lastManager = await prisma.manager.findFirst({
    orderBy: { position: "desc" },
  });
  const manager = await prisma.manager.create({
    data: { name, position: (lastManager?.position ?? 0) + 1 },
  });
  return NextResponse.json(manager, { status: 201 });
}

export async function PATCH(req: Request) {
  const { managerId, monthlyPlan } = await req.json();
  const manager = await prisma.manager.update({
    where: { id: managerId },
    data: { monthlyPlan },
  });
  return NextResponse.json(manager);
}

export async function PUT(req: Request) {
  const { ids } = await req.json() as { ids: string[] };
  await Promise.all(
    ids.map((id, i) =>
      prisma.manager.update({ where: { id }, data: { position: i + 1 } })
    )
  );
  return NextResponse.json({ ok: true });
}
