import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const date = dateParam
    ? new Date(dateParam)
    : new Date(new Date().toDateString());

  const managers = await prisma.manager.findMany({
    orderBy: { position: "asc" },
    include: {
      quotas: { where: { date } },
      deals: { where: { date } },
    },
  });
  return NextResponse.json(managers);
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
