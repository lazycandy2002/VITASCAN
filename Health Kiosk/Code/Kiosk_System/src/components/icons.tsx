interface IconProps {
  className?: string
}

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function IconPerson({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
    </svg>
  )
}

export function IconCalendar({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  )
}

export function IconGender({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="10" cy="14" r="5" />
      <path d="M14 10l6-6M15 4h5v5" />
    </svg>
  )
}

export function IconThermometer({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 14.5V4a2 2 0 1 0-4 0v10.5a4 4 0 1 0 4 0Z" />
    </svg>
  )
}

export function IconHeart({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 21s-7.5-4.7-10-9.3C.7 8.6 2 5 5.5 5c2 0 3.5 1.2 4.5 2.8C11 6.2 12.5 5 14.5 5 18 5 19.3 8.6 22 11.7 19.5 16.3 12 21 12 21Z" />
      <path d="M4 12h3l2 4 3-8 2 4h4" />
    </svg>
  )
}

export function IconOxygen({ className }: IconProps) {
  return (
    <span className={className} style={{ fontWeight: 800, fontSize: '0.85em', lineHeight: 1 }}>
      O<sub>2</sub>
    </span>
  )
}

export function IconRuler({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="7" width="18" height="10" rx="2" />
      <path d="M7 7v3M11 7v5M15 7v3M19 7v5" />
    </svg>
  )
}

export function IconWeight({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="13" r="7" />
      <path d="M9 13a3 3 0 0 1 6 0" />
      <path d="M12 5V3M9 3h6" />
    </svg>
  )
}

export function IconDocument({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 2h9l5 5v15H6z" />
      <path d="M15 2v5h5" />
      <circle cx="10" cy="14" r="2" />
      <path d="M13 17l3 3" />
    </svg>
  )
}

export function IconPower({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 2v8" />
      <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
    </svg>
  )
}

export function IconChevronRight({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

export function IconCheck({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}