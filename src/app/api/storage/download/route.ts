import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    let bucket = searchParams.get("bucket")
    let path = searchParams.get("path")
    const urlParam = searchParams.get("url")

    // If url is provided, extract bucket and path from it
    if (urlParam && !bucket && !path) {
      try {
        const parsed = new URL(urlParam)
        const parts = parsed.pathname.split("/")
        // /storage/v1/object/public/<bucket>/<path...>
        const publicIdx = parts.indexOf("public")
        if (publicIdx !== -1 && parts.length > publicIdx + 2) {
          bucket = parts[publicIdx + 1]
          path = parts.slice(publicIdx + 2).join("/")
        }
      } catch {
        return NextResponse.json({ error: "Invalid URL" }, { status: 400 })
      }
    }

    if (!bucket || !path) {
      return NextResponse.json({ error: "Missing bucket or path or url" }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin.storage.from(bucket).download(path)

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "File not found" }, { status: 404 })
    }

    const ext = path.split(".").pop()?.toLowerCase()
    const mime =
      ext === "png" ? "image/png" :
      ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
      ext === "webp" ? "image/webp" :
      ext === "mind" ? "application/octet-stream" :
      "application/octet-stream"

    const buf = await data.arrayBuffer()

    return new NextResponse(buf, {
      headers: {
        "Content-Type": mime,
        "Content-Length": buf.byteLength.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch (err: any) {
    console.error("[storage download] Error:", err?.message || err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
