import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const managers = await prisma.manager.findMany({
    orderBy: { position: "asc" },
    include: {
      quotas: {
        where: { date: new Date(new Date().toDateString()) },
      },
      deals: {
        where: { date: new Date(new Date().toDateString()) },
      },
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
