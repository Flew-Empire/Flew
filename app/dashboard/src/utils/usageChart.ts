import { ColorMode } from "@chakra-ui/react";
import { ApexOptions } from "apexcharts";
import { generateDistinctColors } from "utils/color";
import { formatBytes } from "utils/formatByte";

export function createUsageConfig(
  colorMode: ColorMode,
  title: string,
  series: number[] = [],
  labels: string[] = []
) {
  const total = formatBytes(series.reduce((t, c) => (t += c), 0));
  return {
    series,
    options: {
      labels,
      chart: {
        width: "100%",
        height: "100%",
        type: "donut",
        animations: {
          enabled: false,
        },
      },
      title: {
        text: `${title}${total}`,
        align: "center",
        style: {
          fontWeight: "var(--chakra-fontWeights-medium)",
          color:
            colorMode === "dark" ? "var(--chakra-colors-gray-300)" : undefined,
        },
      },
      legend: {
        position: "bottom",
        labels: {
          colors: colorMode === "dark" ? "#CBD5E0" : undefined,
          useSeriesColors: false,
        },
      },
      stroke: {
        width: 1,
        colors: undefined,
      },
      dataLabels: {
        formatter: (_val: number, { seriesIndex, w }: any) => {
          return formatBytes(w.config.series[seriesIndex], 1);
        },
      },
      tooltip: {
        custom: ({ series, seriesIndex, w }: any) => {
          const readable = formatBytes(series[seriesIndex], 1);
          const seriesTotal = Math.max(
            (series as number[]).reduce((t, c) => (t += c), 0),
            1
          );
          const percent =
            Math.round((series[seriesIndex] / seriesTotal) * 1000) / 10 + "%";
          return `
            <div style="
                    background-color: ${w.globals.colors[seriesIndex]};
                    padding-left:12px;
                    padding-right:12px;
                    padding-top:6px;
                    padding-bottom:6px;
                    font-size:0.725rem;
                  "
            >
              ${w.config.labels[seriesIndex]}: <b>${percent}, ${readable}</b>
            </div>
          `;
        },
      },
      colors: generateDistinctColors(series.length),
    } as ApexOptions,
  };
}

export default createUsageConfig;
