import { z } from "zod/v4";
import { authorize, database, json, apiFailure } from "@/lib/vehicle-api";

export const dynamic = "force-dynamic";
const schema = z.object({ id: z.uuid() });

export async function POST(request: Request) {
  try {
    const access = await authorize(request);
    if (access.response) return access.response;
    const { id } = schema.parse(await request.json());
    const result = await database().prepare("DELETE FROM maintenance WHERE id = ?").bind(id).run();
    return json({ status: "success", id, deleted: Number(result.meta.changes ?? 0) > 0 });
  } catch (error) { return apiFailure(error); }
}
