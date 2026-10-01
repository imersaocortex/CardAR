import { NextResponse } from "next/server"
import { billingAvailability } from "@/lib/payments/service"
export async function GET() {
  return NextResponse.json(billingAvailability())
}
