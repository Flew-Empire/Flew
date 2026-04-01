import { Box, VStack } from "@chakra-ui/react";
import ReactApexChart from "react-apexcharts";
import { FC } from "react";
import { FilterUsageType } from "contexts/DashboardContext";
import { UsageFilter } from "./UsageFilter";

type UserUsageSectionProps = {
  usage: {
    options: any;
    series: number[];
  };
  usageFilter: string;
  onFilterChange: (filter: string, query: FilterUsageType) => void;
};

export const UserUsageSection: FC<UserUsageSectionProps> = ({
  usage,
  usageFilter,
  onFilterChange,
}) => {
  return (
    <VStack gap={4}>
      <UsageFilter defaultValue={usageFilter} onChange={onFilterChange} />
      <Box width={{ base: "100%", md: "70%" }} justifySelf="center">
        <ReactApexChart
          options={usage.options}
          series={usage.series}
          type="donut"
        />
      </Box>
    </VStack>
  );
};

export default UserUsageSection;
