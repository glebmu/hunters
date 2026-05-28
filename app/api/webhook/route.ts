import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Optional: set WEBHOOK_SECRET in env to require ?secret=... on every request
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** Extract deal link from any body format */
async function extractDealLink(req: Request): Promise<string | null> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    return body.deal_link ?? body.link ?? body.url ?? null;
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await req.formData().catch(() => null);
    if (!form) return null;
    return (
      form.get("deal_link")?.toString() ??
      form.get("link")?.toString() ??
      form.get("url")?.toString() ??
      null
    );
  }

  // Fallback: try to read as text and parse as JSON
  const text = await req.text().catch(() => "");
  try {
    const body = JSON.parse(text);
    return body.deal_link ?? body.link ?? body.url ?? null;
  } catch {
    return null;
  }
}

/**
 * GET /api/webhook
 * Health check — confirms the endpoint is reachable.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (WEBHOOK_SECRET && searchParams.get("secret") !== WEBHOOK_SECRET) {
    return unauthorized();
  }
  return NextResponse.json({ ok: true, message: "Webhook endpoint is reachable" });
}

/**
 * POST /api/webhook
 *
 * Assign a deal to a manager.
 *
 * Query params:
 *   secret — required if WEBHOOK_SECRET env var is set
 *
 * Body (JSON or form-encoded):
 *   deal_link | link | url — URL of the deal (required, must be unique)
 *
 * Response 200:
 *   { manager: string, managerId: string, position: number, dealLink: string, existing: boolean }
 *
 * Response 400: deal_link missing
 * Response 401: wrong secret
 * Response 422: no active managers available today
 */
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);

  // Auth check
  if (WEBHOOK_SECRET && searchParams.get("secret") !== WEBHOOK_SECRET) {
    return unauthorized();
  }

  const dealLink = await extractDealLink(req);
  if (!dealLink) {
    return NextResponse.json(
      {
        error: "deal_link is required",
        hint: "Pass deal_link (or link / url) in JSON body or form-encoded body",
      },
      { status: 400 }
    );
  }

  const today = new Date(new Date().toDateString());

  // Already assigned — return the same manager
  const existing = await prisma.deal.findUnique({
    where: { dealLink },
    include: { manager: true },
  });
  if (existing) {
    return NextResponse.json({
      manager: existing.manager.name,
      managerId: existing.manager.id,
      position: existing.manager.position,
      dealLink,
      assignedAt: existing.assignedAt,
      assignedDate: existing.date,
      existing: true,
    });
  }

  // Load active managers ordered by position
  const managers = await prisma.manager.findMany({
    where: { isActive: true },
    orderBy: { position: "asc" },
    include: {
      quotas: { where: { date: today } },
      deals: { where: { date: today } },
    },
  });

  // Active = assigned deals today < quota today
  const activeManagers = managers.filter((m) => {
    const quota = m.quotas[0]?.quota ?? 0;
    return quota > 0 && m.deals.length < quota;
  });

  if (activeManagers.length === 0) {
    return NextResponse.json(
      { error: "No active managers available today" },
      { status: 422 }
    );
  }

  // Pick first active manager with fewest deals today (stable sort by position)
  const selected = activeManagers.reduce((min, m) =>
    m.deals.length < min.deals.length ? m : min
  );

  await prisma.deal.create({
    data: { dealLink, managerId: selected.id, date: today },
  });

  return NextResponse.json({
    manager: selected.name,
    managerId: selected.id,
    position: selected.position,
    dealLink,
    existing: false,
  });
}
