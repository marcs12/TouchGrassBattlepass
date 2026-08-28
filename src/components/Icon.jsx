// Single stroke-based icon set (24x24 grid, 1.6 stroke) so nothing in the UI
// depends on emoji rendering. `name` keys are referenced from data/rewards.js.
const PATHS = {
  // reward art
  icecream: (
    <>
      <path d="M8.5 10.5a3.5 3.5 0 1 1 7 0" />
      <path d="M7 10.5h10L12 21z" />
      <path d="M8.8 15h6.4" />
    </>
  ),
  wrap: (
    <>
      <rect x="4.5" y="7.5" width="15" height="9" rx="4.5" />
      <path d="M9 8.2 7.4 15.8M12.6 7.8 11 16.2M16.2 8.2 14.6 15.8" />
    </>
  ),
  coffee: (
    <>
      <path d="M4.5 9h11v5a4 4 0 0 1-4 4h-3a4 4 0 0 1-4-4z" />
      <path d="M15.5 10.5h1.8a2.6 2.6 0 0 1 0 5.2h-1.3" />
      <path d="M8 3.5v2.2M11.5 3.5v2.2" />
    </>
  ),
  film: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M8 4.5v15M16 4.5v15M3.5 12h17M3.5 8.2h4.5M3.5 15.8h4.5M16 8.2h4.5M16 15.8h4.5" />
    </>
  ),
  sushi: (
    <>
      <rect x="3.5" y="7" width="17" height="10" rx="5" />
      <circle cx="12" cy="12" r="3" />
      <path d="M8.5 7v10M15.5 7v10" />
    </>
  ),
  basket: (
    <>
      <path d="M4 9h16l-1.6 9.2a2 2 0 0 1-2 1.8H7.6a2 2 0 0 1-2-1.8z" />
      <path d="M8.4 12.5v4M12 12.5v4M15.6 12.5v4" />
      <path d="M8.5 9 10 4.5M15.5 9 14 4.5" />
    </>
  ),
  spa: (
    <>
      <path d="M12 20c0-4.4 3.2-8 7.5-8 0 4.4-3.2 8-7.5 8Z" />
      <path d="M12 20c0-4.4-3.2-8-7.5-8 0 4.4 3.2 8 7.5 8Z" />
      <path d="M12 20c-1.6-3.4-.6-7.4 2.4-9.6C16.1 13.7 15 17.8 12 20Z" />
    </>
  ),
  ticket: (
    <>
      <path d="M3.5 8.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v1.2a2.3 2.3 0 0 0 0 4.6v1.2a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-1.2a2.3 2.3 0 0 0 0-4.6z" />
      <path d="M14 7v2M14 11v2M14 15v2" />
    </>
  ),
  car: (
    <>
      <path d="M4 14.5 5.7 9.3A2.5 2.5 0 0 1 8.1 7.5h7.8a2.5 2.5 0 0 1 2.4 1.8L20 14.5" />
      <path d="M3.5 14.5h17v3.2h-2.6v-1.4H6.1v1.4H3.5z" />
      <circle cx="7.4" cy="14.4" r="1.3" />
      <circle cx="16.6" cy="14.4" r="1.3" />
    </>
  ),
  hotel: (
    <>
      <path d="M4.5 20.5V5.2a1.5 1.5 0 0 1 1.5-1.5h9a1.5 1.5 0 0 1 1.5 1.5v15.3" />
      <path d="M16.5 10h2.6a1.5 1.5 0 0 1 1.5 1.5v9M3 20.5h18" />
      <path d="M8 7.5h1.6M12 7.5h1.6M8 11.2h1.6M12 11.2h1.6" />
      <path d="M10 20.5v-4.2h2.6v4.2" />
    </>
  ),
  gamepad: (
    <>
      <path d="M8.5 8h7a5.5 5.5 0 0 1 5.4 6.5l-.4 2.2A2.6 2.6 0 0 1 16 18l-1.3-1.6H9.3L8 18a2.6 2.6 0 0 1-4.5-1.3l-.4-2.2A5.5 5.5 0 0 1 8.5 8Z" />
      <path d="M7.6 11.4v2.6M6.3 12.7h2.6" />
      <circle cx="15.6" cy="12" r=".9" />
      <circle cx="17.6" cy="14" r=".9" />
    </>
  ),
  plane: (
    <>
      <path d="M10.4 3.6a1.6 1.6 0 0 1 3.2 0v5.1l7.4 4.2v2.4l-7.4-2.3v3.7l2.4 1.9v1.8L12 19.2l-4 1.2v-1.8l2.4-1.9v-3.7L3 15.3v-2.4l7.4-4.2z" />
    </>
  ),

  // ui chrome
  leaf: (
    <>
      <path d="M4.5 19.5C3 13 7 5.5 19.5 4.5c1 12.5-6.5 16.5-13 15Z" />
      <path d="M9.5 14.5 19 5" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m12 7.5 2.6 4.5-2.6 4.5-2.6-4.5z" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.3 0 2-.9 2-1.9 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.9 1.9-1.9h1.4a4.2 4.2 0 0 0 4.2-4.2c0-3.7-3.8-6.6-8.5-6.6Z" />
      <circle cx="8" cy="10" r="1" />
      <circle cx="12" cy="7.8" r="1" />
      <circle cx="16" cy="10" r="1" />
    </>
  ),
  check: <path d="m5 12.8 4.6 4.4L19 6.5" />,
  chevron: <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />,
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.4" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5 10.1 12.8 4.5 10.9 10.1 9z" />
      <path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </>
  ),
  receipt: (
    <>
      <path d="M5.5 3.5h13v17l-2.2-1.6-2.2 1.6-2.1-1.6-2.2 1.6L7.7 19l-2.2 1.5z" />
      <path d="M9 8.5h6M9 12.5h6" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r=".9" />
    </>
  ),
}

export default function Icon({ name, size = 20, strokeWidth = '1.7', className, ...rest }) {
  const path = PATHS[name]
  if (!path) return null

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {path}
    </svg>
  )
}
