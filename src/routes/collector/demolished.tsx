import { createFileRoute } from "@tanstack/react-router";
import { PropertyReportSection } from "@/components/app/property-report-section";

export const Route = createFileRoute("/collector/demolished")({
  head: () => ({
    meta: [
      { title: "العقارات المهدومة | توريدات المحصلين" },
      { name: "description", content: "تسجيل العقارات التي تم هدمها والاشتراكات التي ما زالت تعمل." },
      { property: "og:title", content: "العقارات المهدومة | توريدات المحصلين" },
      { property: "og:description", content: "العقارات المهدومة والاشتراكات التي ما زالت تعمل." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <PropertyReportSection
      table="demolished_properties"
      title="العقارات التي تم هدمها"
      description="أضف رقم العقار المهدوم والاشتراكات التي ما زالت تعمل وصور العقار."
      subsLabel="الاشتراكات التي ما زالت تعمل"
    />
  ),
});
