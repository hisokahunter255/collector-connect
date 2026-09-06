import { createServerFn } from "@tanstack/react-start";

const EMAIL_DOMAIN = "tawreedat.app";

const DEMO_RECEIPT_SVG = (ref: number, invoices: number, amount: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="820"><rect width="620" height="820" fill="#f8f7f2"/><rect x="30" y="30" width="560" height="760" fill="#ffffff" stroke="#c9cfcd"/><text x="310" y="110" font-family="Arial" font-size="30" text-anchor="middle" fill="#123">RECEIPT / ايصال توريد</text><line x1="70" y1="150" x2="550" y2="150" stroke="#123"/><text x="70" y="230" font-family="Arial" font-size="26" fill="#123">REF: ${ref}</text><text x="70" y="300" font-family="Arial" font-size="26" fill="#123">INVOICES: ${invoices}</text><text x="70" y="370" font-family="Arial" font-size="26" fill="#123">AMOUNT: ${amount.toLocaleString("en-US")} EGP</text><text x="70" y="440" font-family="Arial" font-size="22" fill="#456">DEMO DATA</text><line x1="70" y1="700" x2="300" y2="700" stroke="#123"/><text x="70" y="740" font-family="Arial" font-size="20" fill="#456">Signature</text></svg>`;

/**
 * One-time demo seeding: creates the admin account, two collectors and
 * sample deposits so the system can be reviewed before real data exists.
 * Refuses to run once an admin account exists.
 */
export const bootstrapDemo = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: admins } = await supabaseAdmin.from("user_roles").select("id").eq("role", "admin");
  if (admins && admins.length > 0) return { seeded: false as const };

  const { data: branches } = await supabaseAdmin.from("branches").select("id, name");
  const { data: areas } = await supabaseAdmin.from("areas").select("id, name, branch_id");
  const gamasa = branches?.find((b) => b.name === "فرع جمصة");
  const mansoura = branches?.find((b) => b.name === "فرع المنصورة");
  const area1 = areas?.find((a) => a.branch_id === gamasa?.id && a.name === "منطقة 1");
  const east = areas?.find((a) => a.branch_id === mansoura?.id && a.name === "شرق");

  async function makeUser(
    username: string,
    password: string,
    fullName: string,
    role: "admin" | "collector",
    branchId?: string,
    areaId?: string,
    phone?: string,
  ) {
    const created = await supabaseAdmin.auth.admin.createUser({
      email: `${username}@${EMAIL_DOMAIN}`,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) throw new Error(created.error?.message ?? "seed failed");
    const id = created.data.user.id;
    await supabaseAdmin.from("profiles").insert({
      id,
      full_name: fullName,
      username,
      branch_id: branchId ?? null,
      area_id: areaId ?? null,
      phone: phone ?? null,
      active: true,
    });
    await supabaseAdmin.from("user_roles").insert({ user_id: id, role });
    return id;
  }

  const adminId = await makeUser("admin", "Admin@123", "مدير النظام", "admin");
  const c1 = await makeUser(
    "mohamed01",
    "Pass@123",
    "محمد أحمد",
    "collector",
    gamasa?.id,
    area1?.id,
    "01000000001",
  );
  const c2 = await makeUser(
    "ahmed02",
    "Pass@123",
    "أحمد سعيد",
    "collector",
    mansoura?.id,
    east?.id,
    "01000000002",
  );

  const samples = [
    { u: c1, b: gamasa?.id, a: area1?.id, inv: 125, amt: 18750, days: 0, status: "pending" },
    { u: c1, b: gamasa?.id, a: area1?.id, inv: 98, amt: 14300, days: 1, status: "approved" },
    { u: c1, b: gamasa?.id, a: area1?.id, inv: 140, amt: 21900, days: 4, status: "approved" },
    { u: c2, b: mansoura?.id, a: east?.id, inv: 76, amt: 9800, days: 0, status: "pending" },
    { u: c2, b: mansoura?.id, a: east?.id, inv: 110, amt: 16250, days: 2, status: "rejected" },
  ];

  let ref = 0;
  for (const s of samples) {
    ref += 1;
    const path = `${s.u}/demo-${ref}.svg`;
    await supabaseAdmin.storage
      .from("receipts")
      .upload(path, new Blob([DEMO_RECEIPT_SVG(1000 + ref, s.inv, s.amt)], { type: "image/svg+xml" }), {
        contentType: "image/svg+xml",
        upsert: true,
      });
    const createdAt = new Date(Date.now() - s.days * 86400000);
    await supabaseAdmin.from("deposits").insert({
      collector_id: s.u,
      branch_id: s.b ?? null,
      area_id: s.a ?? null,
      invoices_count: s.inv,
      amount: s.amt,
      receipt_image_url: path,
      status: s.status,
      admin_notes: s.status === "rejected" ? "المبلغ الموجود على الإيصال لا يطابق المبلغ المسجل." : null,
      reviewed_at: s.status === "pending" ? null : createdAt.toISOString(),
      reviewed_by: s.status === "pending" ? null : adminId,
      created_at: createdAt.toISOString(),
      notes: null,
    });
  }

  await supabaseAdmin.from("audit_logs").insert({
    actor_id: adminId,
    actor_name: "مدير النظام",
    action: "تهيئة النظام",
    details: "تم إنشاء الحسابات والبيانات التجريبية",
  });

  return { seeded: true as const };
});
