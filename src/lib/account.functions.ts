import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EMAIL_DOMAIN = "tawreedat.app";

const schema = z
  .object({
    username: z
      .string()
      .min(3, "اسم المستخدم قصير جدًا")
      .max(32)
      .regex(/^[a-zA-Z0-9._-]+$/, "اسم المستخدم بحروف إنجليزية أو أرقام فقط")
      .optional(),
    password: z.string().min(6, "كلمة المرور 6 أحرف على الأقل").optional(),
  })
  .refine((v) => v.username || v.password, { message: "لا يوجد تغيير" });

/** Any signed-in user can change their own username and/or password. */
export const updateMyCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as never as { userId: string };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const payload: { password?: string; email?: string } = {};
    let newUsername: string | null = null;

    if (data.username) {
      newUsername = data.username.trim().toLowerCase();
      const { data: taken } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("username", newUsername)
        .neq("id", userId)
        .maybeSingle();
      if (taken) throw new Error("اسم المستخدم مستخدم بالفعل");
      payload.email = `${newUsername}@${EMAIL_DOMAIN}`;
    }
    if (data.password) payload.password = data.password;

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      ...payload,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);

    if (newUsername) {
      const { error: pErr } = await supabaseAdmin
        .from("profiles")
        .update({ username: newUsername })
        .eq("id", userId);
      if (pErr) throw new Error(pErr.message);
    }

    const { data: p } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      actor_name: (p?.full_name as string) ?? "مدير النظام",
      action: "تعديل بيانات الدخول",
      details: [
        newUsername ? `تم تغيير اسم المستخدم إلى ${newUsername}` : null,
        data.password ? "تم تغيير كلمة المرور" : null,
      ]
        .filter(Boolean)
        .join(" و "),
    });

    return { ok: true, username: newUsername };
  });
