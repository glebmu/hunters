import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/webhook/status?deal_link=<url>
 *
 * Check which manager a deal is assigned to.
 *
 * Response 200:
 *   { assigned: true, manager: string, managerId: string, position: number, assignedAt: string }
 *   { assigned: false }
 *
 * Response 400: deal_link missing
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const dealLink = searchParams.get("deal_link") ?? searchParams.get("link");

  if (!dealLink) {
    return NextResponse.json(
      { error: "deal_link query param is required" },
      { status: 400 }
    );
  }

  const deal = await prisma.deal.findUnique({
    where: { dealLink },
    include: { manager: true },
  });

  if (!deal) {
    return NextResponse.json({ assigned: false });
  }

  return NextResponse.json({
    assigned: true,
    manager: deal.manager.name,
    managerId: deal.manager.id,
    position: deal.manager.position,
    assignedAt: deal.assignedAt,
  });
}
