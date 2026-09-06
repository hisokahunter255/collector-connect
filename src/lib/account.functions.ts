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

const cleanupReceiptsSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "اختر شهرًا صحيحًا"),
});

/** Permanently removes receipt files for reviewed deposits in one calendar month. */
export const deleteReviewedReceiptImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => cleanupReceiptsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context as never as {
      userId: string;
      supabase: {
        from: (table: string) => any;
      };
    };

    const { data: adminRole, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError || !adminRole) throw new Error("هذه العملية متاحة لمدير النظام فقط");

    const [year, month] = data.month.split("-").map(Number);
    if (!year || !month) throw new Error("اختر شهرًا صحيحًا");
    const from = `${data.month}-01T00:00:00.000Z`;
    const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: deposits, error: depositsError } = await supabaseAdmin
      .from("deposits")
      .select("id, receipt_image_url")
      .gte("created_at", from)
      .lt("created_at", nextMonth)
      .in("status", ["approved", "rejected"])
      .neq("receipt_image_url", "");
    if (depositsError) throw new Error("تعذر تحميل صور الإيصالات المطلوب حذفها");

    const eligible = (deposits ?? []).filter(
      (row): row is { id: string; receipt_image_url: string } => Boolean(row.receipt_image_url),
    );
    if (eligible.length === 0) return { deletedCount: 0 };

    for (let index = 0; index < eligible.length; index += 100) {
      const batch = eligible.slice(index, index + 100);
      const paths = batch.map((row) => row.receipt_image_url);
      const { error: storageError } = await supabaseAdmin.storage.from("receipts").remove(paths);
      if (storageError) throw new Error("تعذر حذف بعض صور الإيصالات، حاول مرة أخرى");

      const { error: updateError } = await supabaseAdmin
        .from("deposits")
        .update({ receipt_image_url: "" })
        .in(
          "id",
          batch.map((row) => row.id),
        );
      if (updateError) throw new Error("حُذفت الصور وتعذر تحديث سجلاتها");
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      actor_name: (profile?.full_name as string) ?? "مدير النظام",
      action: "حذف صور إيصالات مراجعة",
      details: `تم حذف ${eligible.length} صورة إيصال للتوريدات المراجعة عن شهر ${data.month}`,
    });

    return { deletedCount: eligible.length };
  });
