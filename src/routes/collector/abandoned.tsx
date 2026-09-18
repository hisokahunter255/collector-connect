import { createFileRoute } from "@tanstack/react-router";
import { PropertyReportSection } from "@/components/app/property-report-section";

export const Route = createFileRoute("/collector/abandoned")({
  head: () => ({
    meta: [
      { title: "العقارات المهجورة | توريدات المحصلين" },
      { name: "description", content: "تسجيل أرقام العقارات المهجورة واشتراكاتها وصورها." },
      { property: "og:title", content: "العقارات المهجورة | توريدات المحصلين" },
      { property: "og:description", content: "تسجيل العقارات المهجورة واشتراكاتها وصورها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <PropertyReportSection
      table="abandoned_properties"
      title="العقارات المهجورة"
      description="أضف رقم العقار المهجور والاشتراكات الموجودة به وصور العقار."
      subsLabel="الاشتراكات الموجودة بالعقار"
    />
  ),
});
