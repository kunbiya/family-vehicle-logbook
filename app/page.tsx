import { cookies } from "next/headers";
import { FAMILY_COOKIE, familyAuthConfigured, verifyFamilySession } from "@/lib/family-auth";
import { VehicleDashboard } from "./vehicle-dashboard";
import { FamilyLogin } from "./family-login";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cookieStore = await cookies();
  const session = await verifyFamilySession(cookieStore.get(FAMILY_COOKIE)?.value);
  if (!session) return <FamilyLogin configured={familyAuthConfigured()} />;

  return (
    <VehicleDashboard
      userName="가족"
      signInPath="/"
      signOutPath="/api/family/logout"
    />
  );
}
