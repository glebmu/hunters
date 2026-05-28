import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: Request) {
  const { managerId, date, quota } = await req.json();
  const day = new Date(date);

  const record = await prisma.dailyQuota.upsert({
    where: { managerId_date: { managerId, date: day } },
    update: { quota },
    create: { managerId, date: day, quota },
  });
  return NextResponse.json(record);
}
