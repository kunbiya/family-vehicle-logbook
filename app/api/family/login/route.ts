import { z } from "zod/v4";
import { database, json, apiFailure, checkOrigin } from "@/lib/vehicle-api";
import { familyAuthConfigured, passwordMatches, createFamilySession, familyCookie, loginAttemptKey } from "@/lib/family-auth";

export const dynamic = "force-dynamic";
const schema = z.object({ password: z.string().min(1).max(256) });
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export async function POST(request: Request) {
  try {
    const denied = checkOrigin(request);
    if (denied) return denied;
    if (!familyAuthConfigured()) return json({ status: "configuration_required", message: "공용 비밀번호 환경변수가 아직 설정되지 않았습니다." }, 503);
    const { password } = schema.parse(await request.json());
    const db = database();
    const now = Date.now();
    const id = await loginAttemptKey(request.headers.get("cf-connecting-ip") ?? "unknown");
    const attempt = await db.prepare("INSERT INTO family_login_attempts (id, attempts, window_start) VALUES (?, 1, ?) ON CONFLICT(id) DO UPDATE SET attempts = CASE WHEN window_start <= ? THEN 1 ELSE attempts + 1 END, window_start = CASE WHEN window_start <= ? THEN excluded.window_start ELSE window_start END RETURNING attempts, window_start AS windowStart")
      .bind(id, now, now - WINDOW_MS, now - WINDOW_MS).first<{ attempts: number; windowStart: number }>();
    if (!attempt || attempt.attempts > MAX_ATTEMPTS) {
      const wait = Math.max(1, Math.ceil(((attempt?.windowStart ?? now) + WINDOW_MS - now) / 1000));
      const response = json({ status: "rate_limited", message: "비밀번호 입력 횟수가 많습니다. 잠시 후 다시 시도해 주세요.", retryAfterSeconds: wait }, 429);
      response.headers.set("Retry-After", String(wait));
      return response;
    }
    if (!(await passwordMatches(password))) return json({ status: "invalid_password", message: "공용 비밀번호가 일치하지 않습니다." }, 401);
    const { token } = await createFamilySession();
    await db.prepare("DELETE FROM family_login_attempts WHERE id = ?").bind(id).run();
    const response = json({ status: "success" });
    response.headers.set("Set-Cookie", familyCookie(token));
    return response;
  } catch (error) { return apiFailure(error); }
}
