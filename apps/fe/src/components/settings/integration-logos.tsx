export type IntegrationName =
  | "Slack"
  | "Linear"
  | "Gmail"
  | "Notion"
  | "GitHub"
  | "Google Drive"
  | "Jira";

export function IntegrationLogo({ name }: { name: IntegrationName }) {
  const props = { width: 32, height: 32, viewBox: "0 0 32 32", "aria-hidden": true } as const;
  switch (name) {
    case "Slack":
      return (
        <svg {...props}>
          <rect x="6" y="14" width="12" height="4" rx="2" fill="#36C5F0" />
          <rect x="14" y="6" width="4" height="12" rx="2" fill="#2EB67D" />
          <rect x="14" y="14" width="12" height="4" rx="2" fill="#ECB22E" />
          <rect x="14" y="14" width="4" height="12" rx="2" fill="#E01E5A" />
        </svg>
      );
    case "Linear":
      return (
        <svg {...props}>
          <defs>
            <linearGradient id="lin" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#5E6AD2" />
              <stop offset="1" stopColor="#3D4ACB" />
            </linearGradient>
          </defs>
          <rect width="32" height="32" rx="6" fill="url(#lin)" />
          <path
            d="M8 22 L22 8 M8 16 L16 8 M8 10 L10 8 M16 24 L24 16 M22 24 L24 22"
            stroke="#fff"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
    case "Gmail":
      return (
        <svg {...props}>
          <rect x="3" y="8" width="26" height="18" rx="2" fill="#fff" stroke="#E0E0E0" />
          <path d="M3 9 L16 19 L29 9" fill="none" stroke="#EA4335" strokeWidth="2.5" />
          <path
            d="M3 9 V25 H8 V14 L16 20 L24 14 V25 H29 V9"
            fill="none"
            stroke="#EA4335"
            strokeWidth="0.5"
          />
        </svg>
      );
    case "Notion":
      return (
        <svg {...props}>
          <rect width="32" height="32" rx="6" fill="#fff" stroke="#E5E5E5" />
          <path d="M9 8 L20 7.5 L23 10 V24 L9 24.5 Z" fill="none" stroke="#000" strokeWidth="1.5" />
          <path d="M12 12 V21 M12 12 L19 20 V12" fill="none" stroke="#000" strokeWidth="1.5" />
        </svg>
      );
    case "GitHub":
      return (
        <svg {...props}>
          <circle cx="16" cy="16" r="14" fill="#181717" />
          <path
            d="M16 5c-6 0-11 5-11 11 0 4.9 3.2 9 7.6 10.5.6.1.8-.2.8-.6v-2c-3.1.7-3.8-1.5-3.8-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 1.8 2.7 1.3 3.4 1 .1-.7.4-1.3.7-1.6-2.5-.3-5.1-1.3-5.1-5.5 0-1.2.4-2.2 1.2-3 -.1-.3-.5-1.5.1-3 0 0 1-.3 3.2 1.2.9-.3 1.9-.4 2.9-.4 1 0 2 .1 2.9.4 2.2-1.5 3.2-1.2 3.2-1.2.6 1.5.2 2.7.1 3 .8.8 1.2 1.8 1.2 3 0 4.2-2.6 5.2-5.1 5.5.4.4.7 1 .7 2v3c0 .4.2.7.8.6 4.4-1.5 7.6-5.6 7.6-10.5 0-6-5-11-11-11z"
            fill="#fff"
          />
        </svg>
      );
    case "Google Drive":
      return (
        <svg {...props}>
          <path d="M12 4 H20 L29 20 H21 Z" fill="#FFC107" />
          <path d="M3 20 L8 28 H22 L17 20 Z" fill="#1976D2" />
          <path d="M12 4 L3 20 L8 28 L17 20 Z" fill="#4CAF50" />
        </svg>
      );
    case "Jira":
      return (
        <svg {...props}>
          <path
            d="M16 4 L26 14 L21 19 L16 14 L11 19 L6 14 Z M11 19 L16 24 L21 19 L16 14 Z"
            fill="#2684FF"
          />
        </svg>
      );
  }
}
