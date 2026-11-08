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

export const IconMarkdown = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" />
    <path d="m7 11 2.5 2.5L12 11v4" />
    <path d="m14 15 2.5-4L19 15" />
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

export const IconList = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M8 6h13M8 12h13M8 18h13" />
    <path d="M3 6h.01M3 12h.01M3 18h.01" />
  </Svg>
)

export const IconSettings = (p: { size?: number }) => (
  <Svg size={p.size}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.04 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
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

/** Bản đồ thiết kế: các nút nối nhau */
export const IconMap = (p: { size?: number }) => (
  <Svg size={p.size}>
    <rect x="3" y="4" width="6" height="5" rx="1" />
    <rect x="15" y="4" width="6" height="5" rx="1" />
    <rect x="9" y="15" width="6" height="5" rx="1" />
    <path d="M9 6.5h6M6 9v3.5h6V15M18 9v3.5h-6" />
  </Svg>
)
