import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  ButtonProps,
  chakra,
  Checkbox,
  Collapse,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Switch,
  Text,
  Tooltip,
  useBreakpointValue,
  useToast,
  VStack,
} from "@chakra-ui/react";
import {
  EyeIcon,
  EyeSlashIcon,
  PlusIcon as HeroIconPlusIcon,
  SquaresPlusIcon,
} from "@heroicons/react/24/outline";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  FetchNodesQueryKey,
  getNodeDefaultValues,
  NodeSchema,
  NodeType,
  useNodes,
  useNodesQuery,
} from "contexts/NodesContext";
import { FC, ReactNode, useEffect, useState } from "react";
import { Controller, useForm, UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  UseMutateFunction,
  useMutation,
  useQuery,
  useQueryClient,
} from "react-query";
import "slick-carousel/slick/slick-theme.css";
import "slick-carousel/slick/slick.css";
import { Status } from "types/User";
import {
  generateErrorMessage,
  generateSuccessMessage,
} from "utils/toastHandler";
import { useDashboard } from "../contexts/DashboardContext";
import { DeleteNodeModal } from "./DeleteNodeModal";
import { DeleteIcon } from "./DeleteUserModal";
import { ReloadIcon } from "./Filters";
import { Icon } from "./Icon";
import { NodeModalStatusBadge } from "./NodeModalStatusBadge";

import { fetch } from "service/http";
import { Input } from "./Input";

const CustomInput = chakra(Input, {
  baseStyle: {
    bg: "white",
    _dark: {
      bg: "gray.700",
    },
  },
});

const ModalIcon = chakra(SquaresPlusIcon, {
  baseStyle: {
    w: 5,
    h: 5,
  },
});

const PlusIcon = chakra(HeroIconPlusIcon, {
  baseStyle: {
    w: 5,
    h: 5,
    strokeWidth: 2,
  },
});

type AccordionInboundType = {
  toggleAccordion: () => void;
  node: NodeType;
};

const NodeAccordion: FC<AccordionInboundType> = ({ toggleAccordion, node }) => {
  const { updateNode, reconnectNode, setDeletingNode } = useNodes();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const form = useForm<NodeType>({
    defaultValues: node,
    resolver: zodResolver(NodeSchema),
  });
  const handleDeleteNode = setDeletingNode.bind(null, node);

  const { isLoading, mutate } = useMutation(updateNode, {
    onSuccess: () => {
      generateSuccessMessage("Node updated successfully", toast);
      queryClient.invalidateQueries(FetchNodesQueryKey);
    },
    onError: (e) => {
      generateErrorMessage(e, toast, form);
    },
  });

  const { isLoading: isReconnecting, mutate: reconnect } = useMutation(
    reconnectNode.bind(null, node),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(FetchNodesQueryKey);
      },
    }
  );

  const nodeStatus: Status = isReconnecting
    ? "connecting"
    : node.status
    ? node.status
    : "error";

  return (
    <AccordionItem
      className="nodes-accordion-item"
      border="1px solid"
      _dark={{ borderColor: "gray.600" }}
      _light={{ borderColor: "gray.200" }}
      borderRadius="14px"
      p={1}
      w="full"
    >
      <AccordionButton
        className="nodes-accordion-button"
        px={2}
        borderRadius="12px"
        onClick={toggleAccordion}
      >
        <HStack
          w="full"
          justifyContent="space-between"
          pr={2}
          flexWrap="wrap"
          alignItems={{ base: "flex-start", sm: "center" }}
          rowGap={2}
        >
          <Text
            as="span"
            fontWeight="medium"
            fontSize="sm"
            flex="1"
            textAlign="left"
            color="gray.700"
            _dark={{ color: "gray.300" }}
            minW={0}
          >
            {node.name}
          </Text>
          <HStack flexWrap="wrap" justifyContent="flex-start">
            {node.xray_version && (
              <Badge
                colorScheme="blue"
                rounded="full"
                display="inline-flex"
                px={3}
                py={1}
              >
                <Text
                  textTransform="capitalize"
                  fontSize="0.7rem"
                  fontWeight="medium"
                  letterSpacing="tighter"
                >
                  Xray {node.xray_version}
                </Text>
              </Badge>
            )}
            {node.status && <NodeModalStatusBadge status={nodeStatus} compact />}
          </HStack>
        </HStack>
        <AccordionIcon />
      </AccordionButton>
      <AccordionPanel className="nodes-accordion-panel" px={2} pb={2}>
        <VStack pb={3} alignItems="flex-start">
          {nodeStatus === "error" && (
            <Alert status="error" size="xs">
              <Box>
                <HStack w="full">
                  <AlertIcon w={4} />
                  <Text marginInlineEnd={0}>{node.message}</Text>
                </HStack>
                <HStack justifyContent="flex-end" w="full">
                  <Button
                    size="sm"
                    aria-label="reconnect node"
                    leftIcon={<ReloadIcon />}
                    onClick={() => reconnect()}
                    disabled={isReconnecting}
                  >
                    {isReconnecting
                      ? t("nodes.reconnecting")
                      : t("nodes.reconnect")}
                  </Button>
                </HStack>
              </Box>
            </Alert>
          )}
        </VStack>
        <NodeForm
          form={form}
          mutate={mutate}
          isLoading={isLoading}
          submitBtnText={t("nodes.editNode")}
          btnProps={{
            variant: "solid",
            className: "dashboard-accent-btn nodes-submit-btn nodes-compact-submit",
          }}
          btnLeftAdornment={
            <Tooltip label={t("delete")} placement="top">
              <IconButton
                colorScheme="red"
                variant="ghost"
                size="sm"
                aria-label="delete node"
                onClick={handleDeleteNode}
              >
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          }
        />
      </AccordionPanel>
    </AccordionItem>
  );
};

type AddNodeFormType = {
  toggleAccordion: () => void;
  resetAccordions: () => void;
};

const AddNodeForm: FC<AddNodeFormType> = ({
  toggleAccordion,
  resetAccordions,
}) => {
  const toast = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { addNode } = useNodes();
  const form = useForm<NodeType>({
    resolver: zodResolver(NodeSchema),
    defaultValues: {
      ...getNodeDefaultValues(),
      add_as_new_host: false,
    },
  });
  const { isLoading, mutate } = useMutation(addNode, {
    onSuccess: () => {
      generateSuccessMessage(
        t("nodes.addNodeSuccess", { name: form.getValues("name") }),
        toast
      );
      queryClient.invalidateQueries(FetchNodesQueryKey);
      form.reset();
      resetAccordions();
    },
    onError: (e) => {
      generateErrorMessage(e, toast, form);
    },
  });
  return (
    <AccordionItem
      className="nodes-accordion-item nodes-accordion-item--add"
      border="1px solid"
      _dark={{ borderColor: "gray.600" }}
      _light={{ borderColor: "gray.200" }}
      borderRadius="4px"
      p={1}
      w="full"
    >
      <AccordionButton
        className="nodes-accordion-button"
        px={2}
        borderRadius="3px"
        onClick={toggleAccordion}
      >
        <Text
          as="span"
          fontWeight="medium"
          fontSize="sm"
          flex="1"
          textAlign="left"
          color="gray.700"
          _dark={{ color: "gray.300" }}
          display="flex"
          gap={1}
        >
          <PlusIcon display={"inline-block"} />{" "}
          <span>{t("nodes.addNewFlewNode")}</span>
        </Text>
      </AccordionButton>
      <AccordionPanel className="nodes-accordion-panel" px={2} py={4}>
        <NodeForm
          form={form}
          mutate={mutate}
          isLoading={isLoading}
          submitBtnText={t("nodes.addNode")}
          btnProps={{
            variant: "solid",
            className: "dashboard-accent-btn nodes-submit-btn nodes-compact-submit",
          }}
          addAsHost
        />
      </AccordionPanel>
    </AccordionItem>
  );
};

type NodeFormType = FC<{
  form: UseFormReturn<NodeType>;
  mutate: UseMutateFunction<unknown, unknown, any>;
  isLoading: boolean;
  submitBtnText: string;
  btnProps?: Partial<ButtonProps>;
  btnLeftAdornment?: ReactNode;
  addAsHost?: boolean;
}>;

const NodeForm: NodeFormType = ({
  form,
  mutate,
  isLoading,
  submitBtnText,
  btnProps = {},
  btnLeftAdornment,
  addAsHost = false,
}) => {
  const { t } = useTranslation();
  const [showCertificate, setShowCertificate] = useState(false);
  const isCompactNodeLayout = useBreakpointValue({ base: true, lg: false }) ?? false;
  const submitClassName =
    typeof btnProps.className === "string" ? btnProps.className : "";
  const isCompactSubmit = submitClassName.includes("nodes-compact-submit");
  const { data: nodeSettings } = useQuery({
    queryKey: "node-settings",
    queryFn: () =>
      fetch<{
        min_node_version: string;
        certificate: string;
      }>("/node/settings"),
  });
  const certificateText = String(nodeSettings?.certificate || "").trim();

  useEffect(() => {
    if (isCompactNodeLayout && certificateText) {
      setShowCertificate(true);
    }
  }, [certificateText, isCompactNodeLayout]);

  function selectText(node: HTMLElement) {
    // @ts-ignore
    if (document.body.createTextRange) {
      // @ts-ignore
      const range = document.body.createTextRange();
      range.moveToElementText(node);
      range.select();
    } else if (window.getSelection) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(node);
      selection!.removeAllRanges();
      selection!.addRange(range);
    } else {
      console.warn("Could not select text in node: Unsupported browser.");
    }
  }

  return (
    <form onSubmit={form.handleSubmit((v) => mutate(v))}>
      <VStack spacing={4} align="stretch">
        <Box
          className="node-form-layout"
          display="grid"
          gap={{ base: 4, xl: 5 }}
          gridTemplateColumns={
            certificateText
              ? { base: "1fr", xl: "minmax(300px, 0.92fr) minmax(0, 1.08fr)" }
              : { base: "1fr" }
          }
        >
          {certificateText && (
            <Box className="node-certificate-card">
              <VStack align="stretch" spacing={4}>
                <Box>
                  <Text fontSize="sm" fontWeight="700" mb={1}>
                    {t("nodes.certificate")}
                  </Text>
                  <Text fontSize="xs" color="var(--muted)">
                    {t("nodes.connection-hint")}
                  </Text>
                </Box>

                <HStack
                  spacing={3}
                  flexWrap="wrap"
                  flexDirection={{ base: "column", sm: "row" }}
                  align={{ base: "stretch", sm: "center" }}
                >
                  <Button
                    as="a"
                    href={URL.createObjectURL(
                      new Blob([certificateText], { type: "text/plain" })
                    )}
                    download="ssl_client_cert.pem"
                    variant="outline"
                    size="sm"
                    w={{ base: "full", sm: "auto" }}
                  >
                    {t("nodes.download-certificate")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={
                      !showCertificate ? (
                        <EyeIcon width="15px" />
                      ) : (
                        <EyeSlashIcon width="15px" />
                      )
                    }
                    onClick={setShowCertificate.bind(null, !showCertificate)}
                    w={{ base: "full", sm: "auto" }}
                  >
                    {showCertificate
                      ? t("nodes.hide-certificate")
                      : t("nodes.show-certificate")}
                  </Button>
                </HStack>

                <Collapse in={showCertificate} animateOpacity>
                  <Text
                    className="node-certificate-code"
                    p={3}
                    lineHeight="1.35"
                    fontSize="11px"
                    fontFamily="Courier"
                    whiteSpace="pre"
                    overflow="auto"
                    onClick={(event) => {
                      selectText(event.currentTarget as HTMLElement);
                    }}
                  >
                    {certificateText}
                  </Text>
                </Collapse>
              </VStack>
            </Box>
          )}

          <VStack className="node-form-fields" spacing={4} align="stretch">
            <Box
              className="node-top-row"
              w="full"
              display="grid"
              gap={3}
              gridTemplateColumns="minmax(0, 1fr) auto"
              alignItems="end"
            >
              <FormControl flex="1" w="full">
                <CustomInput
                  label={t("nodes.nodeName")}
                  size="sm"
                  placeholder="Flew-S2"
                  {...form.register("name")}
                  error={form.formState?.errors?.name?.message}
                />
              </FormControl>
              <Controller
                name="status"
                control={form.control}
                render={({ field }) => {
                  const isEnabled = field.value !== "disabled";
                  return (
                    <Tooltip
                      placement="top"
                      label={isEnabled ? t("active") : t("disabled")}
                      textTransform="capitalize"
                    >
                      <HStack
                        className="desktop-user-switch node-state-switch node-state-switch--compact"
                        data-enabled={isEnabled}
                        w="auto"
                        justify="center"
                      >
                        <Switch
                          colorScheme="primary"
                          isChecked={isEnabled}
                          onChange={(e) => {
                            if (e.target.checked) {
                              field.onChange("connecting");
                            } else {
                              field.onChange("disabled");
                            }
                          }}
                        />
                      </HStack>
                    </Tooltip>
                  );
                }}
              />
            </Box>

            <Box w="full">
              <CustomInput
                label={t("nodes.nodeAddress")}
                size="sm"
                placeholder="51.20.12.13"
                {...form.register("address")}
                error={form.formState?.errors?.address?.message}
              />
            </Box>

            <SimpleGrid
              className="node-fields-grid"
              alignItems="start"
              w="full"
              spacing={3}
              columns={{ base: 1, sm: 2, xl: 3 }}
            >
              <Box w="full">
                <CustomInput
                  label={t("nodes.nodePort")}
                  size="sm"
                  placeholder="62050"
                  {...form.register("port")}
                  error={form.formState?.errors?.port?.message}
                />
              </Box>
              <Box w="full">
                <CustomInput
                  label={t("nodes.nodeAPIPort")}
                  size="sm"
                  placeholder="62051"
                  {...form.register("api_port")}
                  error={form.formState?.errors?.api_port?.message}
                />
              </Box>
              <Box w="full">
                <CustomInput
                  label={t("nodes.usageCoefficient")}
                  size="sm"
                  placeholder="1"
                  {...form.register("usage_coefficient")}
                  error={form.formState?.errors?.usage_coefficient?.message}
                />
              </Box>
            </SimpleGrid>
          </VStack>
        </Box>

        {addAsHost && (
          <FormControl py={1}>
            <Checkbox {...form.register("add_as_new_host")}>
              <FormLabel m={0}>{t("nodes.addHostForEveryInbound")}</FormLabel>
            </Checkbox>
          </FormControl>
        )}
        <HStack
          className="node-submit-row"
          w="full"
          spacing={3}
          flexDirection={{ base: "column-reverse", sm: "row" }}
          align={{ base: "stretch", sm: "center" }}
          justify={{ base: "stretch", sm: isCompactSubmit ? "flex-end" : "stretch" }}
        >
          {btnLeftAdornment}
          <Button
            flexGrow={isCompactSubmit ? 0 : 1}
            type="submit"
            colorScheme="primary"
            size="sm"
            px={5}
            w={isCompactSubmit ? { base: "full", sm: "auto" } : "full"}
            isLoading={isLoading}
            {...btnProps}
          >
            {submitBtnText}
          </Button>
        </HStack>
      </VStack>
    </form>
  );
};

export const NodesDialog: FC = () => {
  const { isEditingNodes, onEditingNodes } = useDashboard();

  const onClose = () => {
    onEditingNodes(false);
  };

  return (
    <Modal isOpen={isEditingNodes} onClose={onClose}>
      <ModalOverlay bg="blackAlpha.300" backdropFilter="blur(10px)" />
      <ModalContent
        mx={{ base: 2, md: 3 }}
        w={{ base: "calc(100vw - 16px)", md: "fit-content" }}
        maxW={{ base: "calc(100vw - 16px)", md: "3xl" }}
      >
        <ModalHeader pt={6}>
          <Icon color="primary">
            <ModalIcon color="white" />
          </Icon>
        </ModalHeader>
        <ModalCloseButton mt={3} />
        <ModalBody
          w={{ base: "full", md: "440px" }}
          maxW="full"
          pb={6}
          pt={3}
          maxH={{ base: "calc(100vh - 140px)", md: "70vh" }}
          overflowY="auto"
        >
          <NodesPanel />
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export const NodesPanel: FC = () => {
  const { t } = useTranslation();
  const [openAccordions, setOpenAccordions] = useState<any>({});
  const { data: nodes, isLoading } = useNodesQuery();

  const toggleAccordion = (index: number | string) => {
    if (openAccordions[String(index)]) {
      delete openAccordions[String(index)];
    } else openAccordions[String(index)] = {};

    setOpenAccordions({ ...openAccordions });
  };

  return (
    <>
      <Text mb={3} opacity={0.8} fontSize="sm">
        {t("nodes.title")}
      </Text>
      {isLoading && "loading..."}

      <Accordion
        className="nodes-panel-accordion"
        w="full"
        allowToggle
        index={Object.keys(openAccordions).map((i) => parseInt(i))}
      >
        <VStack className="nodes-panel-stack" w="full">
          {!isLoading &&
            nodes &&
            nodes.map((node, index) => {
              return (
                <NodeAccordion
                  toggleAccordion={() => toggleAccordion(index)}
                  key={node.name}
                  node={node}
                />
              );
            })}

          <AddNodeForm
            toggleAccordion={() => toggleAccordion((nodes || []).length)}
            resetAccordions={() => setOpenAccordions({})}
          />
        </VStack>
      </Accordion>
      <DeleteNodeModal deleteCallback={() => setOpenAccordions({})} />
    </>
  );
};
