import {
  FC,
  FocusEventHandler,
  MouseEventHandler,
  TouchEventHandler,
} from "react";
import { Link, LinkProps } from "react-router-dom";
import { RoutePreloadKey, preloadRoute } from "pages/lazyRoutes";

type PrefetchLinkProps = LinkProps & {
  preload?: RoutePreloadKey;
};

export const PrefetchLink: FC<PrefetchLinkProps> = ({
  preload,
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...props
}) => {
  const triggerPreload = () => {
    if (!preload) return;
    preloadRoute(preload).catch((error) => {
      console.error(`Failed to preload ${preload}:`, error);
    });
  };

  const handleMouseEnter: MouseEventHandler<HTMLAnchorElement> = (event) => {
    triggerPreload();
    onMouseEnter?.(event);
  };

  const handleFocus: FocusEventHandler<HTMLAnchorElement> = (event) => {
    triggerPreload();
    onFocus?.(event);
  };

  const handleTouchStart: TouchEventHandler<HTMLAnchorElement> = (event) => {
    triggerPreload();
    onTouchStart?.(event);
  };

  return (
    <Link
      {...props}
      onMouseEnter={handleMouseEnter}
      onFocus={handleFocus}
      onTouchStart={handleTouchStart}
    />
  );
};
