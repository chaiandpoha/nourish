function Icon({ size = 24, children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

export function HomeIcon({ size }) {
  return (
    <Icon size={size}>
      <path d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </Icon>
  )
}

export function FoodIcon({ size }) {
  return (
    <Icon size={size}>
      {/* Fork: two tines + curved neck + stem */}
      <path d="M7 3v4.5M9.5 3v4.5" />
      <path d="M7 7.5c0 1.105.895 2 2 2v0c1.105 0 2-.895 2-2" />
      <path d="M8.25 9.5V21" />
      {/* Knife: tapered blade + stem */}
      <path d="M15.75 3c0 0 1.5 1.5 1.5 5h-3c0-3.5 1.5-5 1.5-5Z" />
      <path d="M15.75 8V21" />
    </Icon>
  )
}

export function WorkoutIcon({ size }) {
  return (
    <Icon size={size}>
      <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </Icon>
  )
}

export function CalendarIcon({ size }) {
  return (
    <Icon size={size}>
      <path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
    </Icon>
  )
}

export function SettingsIcon({ size }) {
  return (
    <Icon size={size}>
      <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </Icon>
  )
}

// ─── Stat card icons ─────────────────────────────────────────────────────────

export function WeightIcon({ size }) {
  return (
    <Icon size={size}>
      <path d="M2.25 6 9 12.75l4.286-4.286a11.948 11.948 0 0 1 4.306 6.43l.776 2.898m0 0 3.182-5.511m-3.182 5.51-5.511-3.181" />
    </Icon>
  )
}

export function StepsIcon({ size }) {
  return (
    <Icon size={size}>
      <path d="M12.75 15 15.75 12m0 0-3-3m3 3H8.25M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </Icon>
  )
}

export function FireIcon({ size }) {
  return (
    <Icon size={size}>
      <path d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.048 8.287 8.287 0 0 0 9 9.6a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />
      <path d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.974 5.974 0 0 1-2.133-1A3.75 3.75 0 0 0 12 18Z" />
    </Icon>
  )
}

export function DumbbellIcon({ size }) {
  return (
    <Icon size={size}>
      <path d="M5.25 8.25h-.75a2.25 2.25 0 0 0 0 4.5h.75m0-4.5v4.5m0-4.5H17.25m-12 4.5H17.25m0-4.5h.75a2.25 2.25 0 0 1 0 4.5h-.75m0-4.5v4.5M8.25 7.5v9m7.5-9v9" />
    </Icon>
  )
}

// ─── Meal slot icons ──────────────────────────────────────────────────────────

export function BreakfastIcon({ size }) {
  return (
    <Icon size={size}>
      {/* Mug body */}
      <path d="M6.75 7.5h10.5v7.5A3.75 3.75 0 0 1 13.5 18.75h-3A3.75 3.75 0 0 1 6.75 15V7.5Z" />
      {/* Handle */}
      <path d="M17.25 10.5H19.5a1.5 1.5 0 0 1 0 3h-2.25" />
      {/* Steam wisps rising upward */}
      <path d="M10.5 7c0-1 1-1.5 0-3" />
      <path d="M13.5 7c0-1-1-1.5 0-3" />
    </Icon>
  )
}

export function LunchIcon({ size }) {
  return (
    <Icon size={size}>
      {/* Bowl rim + shape */}
      <path d="M4.5 12h15" />
      <path d="M6 12c0 3.314 2.686 6 6 6s6-2.686 6-6" />
      {/* Steam wisps rising upward */}
      <path d="M9 11c0-1 1-1.5 0-2.5" />
      <path d="M12 10.5c0-1-1-1.5 0-2.5" />
      <path d="M15 11c0-1 1-1.5 0-2.5" />
    </Icon>
  )
}

export function DinnerIcon({ size }) {
  return (
    <Icon size={size}>
      {/* Fork: two tines + handle */}
      <path d="M7.5 3v3.75m1.5-3.75v3.75" />
      <path d="M7.5 6.75a.75.75 0 0 0 1.5 0" />
      <path d="M8.25 7.5V21" />
      {/* Knife: blade tapers + handle */}
      <path d="M15.75 3v5.25a2.25 2.25 0 0 1 0 4.5V21" />
    </Icon>
  )
}

export function SnackIcon({ size }) {
  return (
    <Icon size={size}>
      <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
    </Icon>
  )
}
