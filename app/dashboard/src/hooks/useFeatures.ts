import { useQuery } from "react-query";
import { fetch } from "service/http";

const normalizeFeature = (value: unknown) => String(value || "").trim().toLowerCase();

export const useFeatures = () => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["system-features"],
    queryFn: () => fetch("/system"),
    staleTime: 60000,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  const rawFeatures = Array.isArray((data as any)?.features) ? (data as any).features : [];
  const features = new Set(rawFeatures.map(normalizeFeature).filter(Boolean));
  const edition = String((data as any)?.edition || "").trim().toLowerCase();
  const panelEnabledRaw = (data as any)?.xpanel_enabled;
  const xpanelEnabled =
    panelEnabledRaw !== undefined ? Boolean(panelEnabledRaw) : features.has("xpanel");
  if (xpanelEnabled) {
    features.add("xpanel");
  }

  const hasFeature = (name: string) => features.has(normalizeFeature(name));

  return { features, edition, xpanelEnabled, hasFeature, isLoading, isError };
};
