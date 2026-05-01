import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { Resend } from "resend";

export const maxDuration = 60;

const resend = new Resend(process.env.RESEND_API_KEY);

const supabaseAdmin =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )
    : null;

export async function POST(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!supabaseAdmin || !resend) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  // Get all projects with verdict "build" joined with user email
  const { data: projects, error } = await supabaseAdmin
    .from("projects")
    .select("id, idea_name, user_id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!projects || projects.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  let sent = 0;

  for (const project of projects) {
    // Get user email from auth.users via admin
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(
      project.user_id
    );
    const email = userData?.user?.email;
    if (!email) continue;

    const projectUrl = `https://klayan.app/project/${project.id}`;

    await resend.emails.send({
      from: "Klayan <onboarding@resend.dev>",
      to: email,
      replyTo: "klayan.app@gmail.com",
      subject: "ta semaine commence maintenant.",
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; color: #111;">
          <img src="https://klayan.app/images/navbarlogo.png" alt="Klayan" style="width: 36px; height: 36px; margin-bottom: 32px;" />
          <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 12px;">ta semaine commence maintenant.</h1>
          <p style="font-size: 16px; color: #444; line-height: 1.6; margin: 0 0 24px;">
            Tu construis <strong>${project.idea_name}</strong>. Cette semaine compte.<br/>
            Fais ton check-in, reste honnête avec toi-même, avance.
          </p>
          <a href="${projectUrl}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 100px; font-size: 14px; font-weight: 600;">
            Ouvrir mon workspace →
          </a>
          <p style="font-size: 12px; color: #999; margin-top: 40px;">
            Klayan · <a href="https://klayan.app" style="color: #999;">klayan.app</a>
          </p>
        </div>
      `,
    });

    sent++;
  }

  return NextResponse.json({ sent });
}
