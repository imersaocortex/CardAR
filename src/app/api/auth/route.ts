import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { loginSchema, signupSchema } from "@/lib/schemas"

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const body = await request.json()
  const { action } = body

  if (action === "login") {
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { data, error } = await supabase.auth.signInWithPassword(parsed.data)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }

    return NextResponse.json({ user: data.user, session: data.session })
  }

  if (action === "signup") {
    const parsed = signupSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { name: parsed.data.name },
      },
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ user: data.user })
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
}
