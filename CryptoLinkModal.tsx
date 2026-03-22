import {
  Button,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Select,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Textarea,
  useClipboard,
  useToast,
} from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { fetch } from "service/http";
import { useState } from "react";
import { useDashboard } from "../contexts/DashboardContext";

export function CryptoLinkModal() {
  const { t } = useTranslation();
  const toast = useToast();
  const { isEditingCrypto, onEditingCrypto } = useDashboard();
  const [raw, setRaw] = useState("");
  const [hwid, setHwid] = useState("");
  const [hwidLimit, setHwidLimit] = useState("");
  const [resetUsername, setResetUsername] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [encrypted, setEncrypted] = useState("");
  const { onCopy, hasCopied } = useClipboard(encrypted);

  const onClose = () => {
    onEditingCrypto(false);
    setRaw("");
    setHwid("");
    setHwidLimit("");
    setResetUsername("");
    setIsResetting(false);
    setEncrypted("");
  };

  const onResetHwid = async () => {
    try {
      const username = resetUsername.trim();
      if (!username) {
        toast({ title: t("cryptoLink.hwidResetEmpty"), status: "warning", duration: 2000, isClosable: true });
        return;
      }
      setIsResetting(true);
      const resp: any = await fetch("/xpert/hwid/reset", { method: "POST", body: { username } });
      if (resp && resp.cleared) {
        toast({ title: t("cryptoLink.hwidResetDone"), status: "success", duration: 1500, isClosable: true });
      } else {
        toast({ title: t("cryptoLink.hwidResetNoData"), status: "info", duration: 2500, isClosable: true });
      }
    } catch (err: any) {
      toast({
        title: t("cryptoLink.hwidResetFailed"),
        description: String(err?.message ?? err),
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsResetting(false);
    }
  };

  const onEncrypt = async () => {
    try {
      if (!raw.trim()) {
        toast({ title: t("cryptoLink.empty"), status: "warning", duration: 2000, isClosable: true });
        return;
      }
      const body: Record<string, string | number> = { url: raw.trim() };
      if (hwid.trim()) {
        body.hwid = hwid.trim();
      }
      if (hwidLimit) {
        body.hwid_limit = Number(hwidLimit);
      }
      const resp: any = await fetch("/xpert/crypto-link", { method: "POST", body });
      const link = (resp && (resp.encrypted_link || resp.link || resp.url || resp.result || resp.data || resp.encrypted)) || resp;
      if (!link || typeof link !== "string") {
        throw new Error("Invalid response");
      }
      setEncrypted(link);
      if (resp && typeof resp.notice === "string" && resp.notice.trim()) {
        toast({ title: resp.notice, status: "info", duration: 3500, isClosable: true });
      }
      toast({ title: t("cryptoLink.done"), status: "success", duration: 1500, isClosable: true });
    } catch (err: any) {
      toast({ title: t("cryptoLink.failed"), description: String(err?.message ?? err), status: "error", duration: 3000, isClosable: true });
    }
  };

  return (
    <Modal isOpen={isEditingCrypto} onClose={onClose} size="xl" isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{t("cryptoLink.title")}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <FormControl>
            <FormLabel>{t("cryptoLink.input")}</FormLabel>
            <Textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={t("cryptoLink.inputPlaceholder")}
              minH="120px"
            />
          </FormControl>
          <FormControl mt={4}>
            <FormLabel>{t("cryptoLink.hwid")}</FormLabel>
            <Input
              value={hwid}
              onChange={(e) => setHwid(e.target.value)}
              placeholder={t("cryptoLink.hwidPlaceholder")}
            />
          </FormControl>
          <FormControl mt={4}>
            <FormLabel>{t("cryptoLink.hwidLimit")}</FormLabel>
            <Select value={hwidLimit} onChange={(e) => setHwidLimit(e.target.value)}>
              <option value="">{t("cryptoLink.hwidLimitPlaceholder")}</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
            </Select>
          </FormControl>
          <FormControl mt={4}>
            <FormLabel>{t("cryptoLink.hwidResetTitle")}</FormLabel>
            <HStack spacing={3} align="stretch">
              <Input
                value={resetUsername}
                onChange={(e) => setResetUsername(e.target.value)}
                placeholder={t("cryptoLink.hwidResetPlaceholder")}
              />
              <Button onClick={onResetHwid} isLoading={isResetting} variant="outline">
                {t("cryptoLink.hwidResetButton")}
              </Button>
            </HStack>
          </FormControl>
          <FormControl mt={4}>
            <FormLabel>{t("cryptoLink.output")}</FormLabel>
            <Textarea value={encrypted} isReadOnly placeholder={t("cryptoLink.outputPlaceholder")} minH="120px" />
          </FormControl>
        </ModalBody>
        <ModalFooter>
          <Button onClick={onEncrypt} colorScheme="blue" mr={3}>
            {t("cryptoLink.encrypt")}
          </Button>
          <Button onClick={onCopy} isDisabled={!encrypted} variant="outline" mr={3}>
            {hasCopied ? t("cryptoLink.copied") : t("cryptoLink.copy")}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t("general.cancel")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
