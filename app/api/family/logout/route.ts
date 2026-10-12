import { checkOrigin } from "@/lib/vehicle-api";
import { familyCookie } from "@/lib/family-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = checkOrigin(request);
  if (denied) return denied;
  return new Response(null, { status: 303, headers: {
    Location: "/", "Set-Cookie": familyCookie("", 0), "Cache-Control": "private, no-store",
  } });
}
