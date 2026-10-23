import { NextResponse } from "next/server"
export async function POST() { return NextResponse.json({ error: "Integração encerrada" }, { status: 410 }) }
