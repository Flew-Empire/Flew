import {
  Box,
  Button,
  chakra,
  HStack,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
  useBreakpointValue,
} from "@chakra-ui/react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  QrCodeIcon,
} from "@heroicons/react/24/outline";
import { QRCodeCanvas } from "qrcode.react";
import { FC, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Slider from "react-slick";
import "slick-carousel/slick/slick-theme.css";
import "slick-carousel/slick/slick.css";
import { useDashboard } from "../contexts/DashboardContext";
import { Icon } from "./Icon";

const QRCode = chakra(QRCodeCanvas);
const NextIcon = chakra(ChevronRightIcon, {
  baseStyle: {
    w: 6,
    h: 6,
    color: "gray.600",
    _dark: {
      color: "white",
    },
  },
});
const PrevIcon = chakra(ChevronLeftIcon, {
  baseStyle: {
    w: 6,
    h: 6,
    color: "gray.600",
    _dark: {
      color: "white",
    },
  },
});
const QRIcon = chakra(QrCodeIcon, {
  baseStyle: {
    w: 5,
    h: 5,
  },
});

export const QRCodeDialog: FC = () => {
  const { QRcodeLinks, setQRCode, setSubLink, subscribeUrl } = useDashboard();
  const isOpen = QRcodeLinks !== null;
  const [index, setIndex] = useState(0);
  const sliderRef = useRef<Slider | null>(null);
  const { t } = useTranslation();
  const isMobile = useBreakpointValue({ base: true, md: false }) ?? true;
  const qrSize = useBreakpointValue({ base: 220, sm: 248, md: 280, lg: 300 }) ?? 220;
  const onClose = () => {
    setQRCode(null);
    setSubLink(null);
  };

  const subscribeQrLink = String(subscribeUrl).startsWith("/")
    ? window.location.origin + subscribeUrl
    : String(subscribeUrl);
  const canSlide = (QRcodeLinks?.length || 0) > 1;

  useEffect(() => {
    setIndex(0);
  }, [QRcodeLinks]);

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay bg="blackAlpha.300" backdropFilter="blur(10px)" />
      <ModalContent
        className="qr-dialog-modal"
        mx={{ base: 2, md: 3 }}
        my={{ base: 2, md: 6 }}
        w={{ base: "calc(100vw - 16px)", md: "fit-content" }}
        maxW={{ base: "calc(100vw - 16px)", md: "3xl" }}
        minH={{ base: "calc(100vh - 16px)", md: "auto" }}
      >
        <ModalHeader pt={6}>
          <Icon color="primary">
            <QRIcon color="white" />
          </Icon>
        </ModalHeader>
        <ModalCloseButton mt={3} />
        {QRcodeLinks && (
          <ModalBody
            gap={{
              base: "18px",
              lg: "50px",
            }}
            px={{
              base: 4,
              sm: 5,
              md: 6,
            }}
            pb={{ base: 5, md: 6 }}
            display="flex"
            justifyContent="center"
            flexDirection={{
              base: "column",
              lg: "row",
            }}
          >
            {subscribeUrl && (
              <VStack className="qr-dialog-card" spacing={3}>
                <QRCode
                  mx="auto"
                  size={qrSize}
                  p="2"
                  level={"L"}
                  includeMargin={false}
                  value={subscribeQrLink}
                  bg="white"
                />
                <Text display="block" textAlign="center" pb={1} mt={1} fontSize="sm">
                  {t("qrcodeDialog.sublink")}
                </Text>
              </VStack>
            )}
            <VStack className="qr-dialog-card qr-dialog-slider-shell" spacing={3}>
              <Box w="full" maxW={`${qrSize + 24}px`}>
              <Slider
                ref={sliderRef}
                centerPadding="0px"
                centerMode={true}
                slidesToShow={1}
                slidesToScroll={1}
                dots={false}
                arrows={!isMobile && canSlide}
                afterChange={setIndex}
                onInit={() => setIndex(0)}
                nextArrow={
                  <IconButton
                    size="sm"
                    position="absolute"
                    display="flex !important"
                    _before={{ content: '""' }}
                    aria-label="next"
                    mr="-4"
                  >
                    <NextIcon />
                  </IconButton>
                }
                prevArrow={
                  <IconButton
                    size="sm"
                    position="absolute"
                    display="flex !important"
                    _before={{ content: '""' }}
                    aria-label="prev"
                    ml="-4"
                  >
                    <PrevIcon />
                  </IconButton>
                }
              >
                {QRcodeLinks.map((link, i) => {
                  return (
                    <HStack key={i} justifyContent="center">
                      <QRCode
                        mx="auto"
                        size={qrSize}
                        p="2"
                        level={"L"}
                        includeMargin={false}
                        value={link}
                        bg="white"
                      />
                    </HStack>
                  );
                })}
              </Slider>
              </Box>
              <Text display="block" textAlign="center" pb={0} mt={1} fontSize="sm">
                {index + 1} / {QRcodeLinks.length}
              </Text>
              {isMobile && canSlide && (
                <HStack w="full" justifyContent="space-between" spacing={3}>
                  <Button
                    size="sm"
                    variant="outline"
                    flex="1"
                    onClick={() => sliderRef.current?.slickPrev()}
                  >
                    {t("previous")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    flex="1"
                    onClick={() => sliderRef.current?.slickNext()}
                  >
                    {t("next")}
                  </Button>
                </HStack>
              )}
            </VStack>
          </ModalBody>
        )}
      </ModalContent>
    </Modal>
  );
};
