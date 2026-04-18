import { NextResponse } from "next/server";
import { getCaseData } from "../../../lib/case-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getCaseData();
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

