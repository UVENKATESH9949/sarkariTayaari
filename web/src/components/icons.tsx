import type { SVGProps } from "react";

/**
 * Line icons for the web app's navigation and empty/error states.
 *
 * Same convention `admin/src/components/icons.jsx` already established: 24x24 viewBox,
 * `currentColor` stroke, 2px weight, rounded caps/joins — so the two web surfaces in this
 * repo read as one product family rather than two different visual languages. No icon
 * package, same as admin: hand-written and dependency-free.
 */

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

type IconProps = SVGProps<SVGSVGElement>;

export function HomeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 9.5V19a1 1 0 0 0 1 1H10v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5h3.5a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 3H20v18H6.5A2.5 2.5 0 0 1 4 18.5v-13A2.5 2.5 0 0 1 6.5 3Z" />
    </svg>
  );
}

export function TimerIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 9.5V13.5l3 2" />
      <path d="M9.5 2h5" />
      <path d="M18.5 5 20 3.5" />
    </svg>
  );
}

export function CapIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m2.5 8.5 9.5-4 9.5 4-9.5 4-9.5-4Z" />
      <path d="M6.5 10.5v4.5c0 1.1 2.46 2.5 5.5 2.5s5.5-1.4 5.5-2.5v-4.5" />
      <path d="M20.5 8.5v6" />
    </svg>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20V10" />
      <path d="M11 20V4" />
      <path d="M18 20v-7" />
      <path d="M2.5 20h19" />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M4.5 20c0-4 3.5-6.5 7.5-6.5s7.5 2.5 7.5 6.5" />
    </svg>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a7.97 7.97 0 0 0 0-3l1.9-1.4-2-3.4-2.2.8a8 8 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.5a8 8 0 0 0-2.6 1.5l-2.2-.8-2 3.4L4.6 10.5a8 8 0 0 0 0 3l-1.9 1.4 2 3.4 2.2-.8a8 8 0 0 0 2.6 1.5l.5 2.5h4l.5-2.5a8 8 0 0 0 2.6-1.5l2.2.8 2-3.4Z" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3 22 20.5H2Z" />
      <path d="M12 9.5v4" />
      <path d="M12 17v.01" />
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M6.5 4.6c0-1.15 1.28-1.85 2.28-1.25l11.3 6.9c.96.59.96 1.99 0 2.58l-11.3 6.9c-1 .6-2.28-.1-2.28-1.25V4.6Z" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

export function InboxIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12.5h4.5l1.5 2.5h4l1.5-2.5H20" />
      <path d="M6 5h12l2 7.5v6a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-6Z" />
    </svg>
  );
}

/** The brand mark: a rounded S-monogram badge, used wherever the wordmark would be too wide. */
export function BrandMark(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <rect width="24" height="24" rx="7" fill="var(--color-brand-primary)" />
      <path
        d="M15.2 8.6c-.4-.9-1.4-1.5-2.7-1.5-1.7 0-2.8.8-2.8 1.9 0 1.2 1 1.7 2.6 2l.7.1c2.3.4 3.7 1.3 3.7 3.2 0 2-1.8 3.4-4.5 3.4-2.3 0-4-1-4.5-2.8"
        stroke="var(--color-text-on-accent)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
