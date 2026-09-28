import { NextResponse } from "next/server";
import { bootstrapParentAccount } from "../../../../../lib/accounts/server";
import { getRequestUser } from "../../../../../lib/auth/request-user";
import { publicErrorMessage } from "../../../../../lib/security/request-guards";

export async function POST(request: Request) {
  const currentUser = await getRequestUser(request);
  if (!currentUser?.id || !currentUser.email) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  try {
    return NextResponse.json(await bootstrapParentAccount({
      userId: currentUser.id,
      email: currentUser.email
    }));
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not finish creating your account.") },
      { status: 400 }
    );
  }
}
