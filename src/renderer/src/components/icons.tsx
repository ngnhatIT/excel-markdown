import React from 'react'

function Svg({
  children,
  size = 18
}: {
  children: React.ReactNode
  size?: number
}): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const IconDashboard = (p: { size?: number }) => (
  <Svg size={p.size}>
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </Svg>
)

export const IconApi = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1" />
    <path d="M16 3h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1" />
    <path d="M9 12h6" />
  </Svg>
)

export const IconCode = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="m16 18 6-6-6-6" />
    <path d="m8 6-6 6 6 6" />
  </Svg>
)

export const IconJson = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1" />
    <path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 0-2 2h-1" />
  </Svg>
)

export const IconKey = (p: { size?: number }) => (
  <Svg size={p.size}>
    <circle cx="7.5" cy="15.5" r="5.5" />
    <path d="m21 2-9.6 9.6" />
    <path d="m15.5 7.5 3 3L22 7l-3-3" />
  </Svg>
)

export const IconRegex = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M4 17V7h4a3 3 0 0 1 0 6H4" />
    <circle cx="17" cy="16" r="3" />
    <path d="M19.5 13.5 21 4l-2 1 1.5 8.5" />
  </Svg>
)

export const IconClock = (p: { size?: number }) => (
  <Svg size={p.size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
)

export const IconPalette = (p: { size?: number }) => (
  <Svg size={p.size}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="8.5" cy="10" r="1.2" fill="currentColor" />
    <circle cx="12" cy="7.5" r="1.2" fill="currentColor" />
    <circle cx="15.5" cy="10" r="1.2" fill="currentColor" />
    <path d="M12 21a9 9 0 0 1-9-9c0-1.5 1-2.5 2.5-2.5h3a2.5 2.5 0 0 0 2.5-2.5V5.5c3 1 6 4.5 6 9" />
  </Svg>
)

export const IconMarkdown = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" />
    <path d="m7 11 2.5 2.5L12 11v4" />
    <path d="m14 15 2.5-4L19 15" />
  </Svg>
)

export const IconLock = (p: { size?: number }) => (
  <Svg size={p.size}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Svg>
)

export const IconCopy = (p: { size?: number }) => (
  <Svg size={p.size}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Svg>
)

export const IconTrash = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M3 6h18" />
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
  </Svg>
)

export const IconPlus = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Svg>
)

export const IconX = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Svg>
)

export const IconCheck = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
)

export const IconSearch = (p: { size?: number }) => (
  <Svg size={p.size}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </Svg>
)

export const IconSun = (p: { size?: number }) => (
  <Svg size={p.size}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
)

export const IconMoon = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </Svg>
)

export const IconSend = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="m22 2-7 20-4-9-9-4z" />
    <path d="M22 2 11 13" />
  </Svg>
)

export const IconSave = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <path d="M17 21v-8H7v8M7 3v5h8" />
  </Svg>
)

export const IconHistory = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l3 2" />
  </Svg>
)

export const IconEdit = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
  </Svg>
)

export const IconChevronDown = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
)

export const IconRefresh = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 3v6h-6" />
  </Svg>
)

export const IconEye = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
)

export const IconBold = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M6 4h8a4 4 0 0 1 0 8H6z" />
    <path d="M6 12h9a4 4 0 0 1 0 8H6z" />
  </Svg>
)

export const IconItalic = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M19 4h-9M14 20H5M15 4 9 20" />
  </Svg>
)

export const IconLink = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </Svg>
)

export const IconList = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M8 6h13M8 12h13M8 18h13" />
    <path d="M3 6h.01M3 12h.01M3 18h.01" />
  </Svg>
)

export const IconDiff = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M12 3v18" />
    <path d="m7 8-4 4 4 4" />
    <path d="m17 8 4 4-4 4" />
  </Svg>
)

export const IconSocket = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M2 12h4l2-7 4 14 2-7h8" />
  </Svg>
)

export const IconSql = (p: { size?: number }) => (
  <Svg size={p.size}>
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
    <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
  </Svg>
)

export const IconFakeData = (p: { size?: number }) => (
  <Svg size={p.size}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
    <path d="M17.5 14.5a6.5 6.5 0 0 1 4 5.5" />
  </Svg>
)

export const IconSettings = (p: { size?: number }) => (
  <Svg size={p.size}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.04 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
  </Svg>
)

export const IconHelp = (p: { size?: number }) => (
  <Svg size={p.size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.6-3 4" />
    <path d="M12 17h.01" />
  </Svg>
)

export const IconFolder = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </Svg>
)

export const IconFile = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </Svg>
)

export const IconOpen = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
  </Svg>
)

export const IconSplit = (p: { size?: number }) => (
  <Svg size={p.size}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M12 4v16" />
  </Svg>
)

export const IconWrap = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M3 6h18" />
    <path d="M3 12h15a3 3 0 1 1 0 6h-4" />
    <path d="m16 16-2 2 2 2" />
    <path d="M3 18h7" />
  </Svg>
)

export const IconTable = (p: { size?: number }) => (
  <Svg size={p.size}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M3 15h18M9 3v18" />
  </Svg>
)
