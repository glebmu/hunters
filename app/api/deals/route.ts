import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const date = dateParam ? new Date(dateParam) : new Date(new Date().toDateString());

  const deals = await prisma.deal.findMany({
    where: { date },
    include: { manager: true },
    orderBy: { assignedAt: "desc" },
  });
  return NextResponse.json(deals);
}
