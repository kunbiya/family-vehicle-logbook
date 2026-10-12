import { env } from "cloudflare:workers";
import { sessionToken, verifyFamilySession } from "@/lib/family-auth";
import { z } from "zod/v4";

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return json({ status: "invalid_request", message: "허용되지 않은 요청입니다." }, 403);
  }
  return null;
}

export async function authorize(request: Request) {
  const denied = checkOrigin(request);
  if (denied) return { response: denied };
  const session = await verifyFamilySession(sessionToken(request.headers.get("cookie")));
  if (!session) return { response: json({ status: "authentication_required", message: "공용 비밀번호를 입력한 뒤 이용해 주세요." }, 401) };
  return { user: { userId: `family:${session.id}` } };
}

export function database() {
  if (!env.DB) throw new Error("Vehicle database binding unavailable");
  return env.DB;
}

export function apiFailure(error: unknown) {
  if (error instanceof z.ZodError) return json({ status: "invalid_request", message: error.issues[0]?.message ?? "입력값을 확인해 주세요." }, 400);
  if (error instanceof SyntaxError) return json({ status: "invalid_request", message: "입력 형식을 확인해 주세요." }, 400);
  console.error("Vehicle database request failed", error);
  return json({ status: "database_error", message: "기록을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, 503);
}
