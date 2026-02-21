import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        highlight: "hsl(var(--highlight))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
          "hover-bg": "hsl(var(--sidebar-hover-bg))",
          "hover-ring": "hsl(var(--sidebar-hover-ring))",
          "hover-text": "hsl(var(--sidebar-hover-text))",
          "active-bg": "hsl(var(--sidebar-active-bg))",
          "active-ring": "hsl(var(--sidebar-active-ring))",
          "icon-bg": "hsl(var(--sidebar-icon-bg))",
        },
        category: {
          health: {
            DEFAULT: "hsl(var(--category-health))",
            muted: "hsl(var(--category-health-muted))",
          },
          wellness: {
            DEFAULT: "hsl(var(--category-wellness))",
            muted: "hsl(var(--category-wellness-muted))",
          },
          learning: {
            DEFAULT: "hsl(var(--category-learning))",
            muted: "hsl(var(--category-learning-muted))",
          },
          productivity: {
            DEFAULT: "hsl(var(--category-productivity))",
            muted: "hsl(var(--category-productivity-muted))",
          },
          other: {
            DEFAULT: "hsl(var(--category-other))",
            muted: "hsl(var(--category-other-muted))",
          },
        },
        section: {
          personal: {
            DEFAULT: "hsl(var(--section-personal))",
            muted: "hsl(var(--section-personal-muted))",
          },
          work: {
            DEFAULT: "hsl(var(--section-work))",
            muted: "hsl(var(--section-work-muted))",
          },
        },
        priority: {
          none: "hsl(var(--priority-none))",
          low: "hsl(var(--priority-low))",
          medium: "hsl(var(--priority-medium))",
          high: "hsl(var(--priority-high))",
        },
        status: {
          error: "hsl(var(--status-error))",
          success: "hsl(var(--status-success))",
          warning: "hsl(var(--status-warning))",
          info: "hsl(var(--status-info))",
          streak: "hsl(var(--status-streak))",
        },
        "info-card": {
          DEFAULT: "hsl(var(--info-card-bg))",
          to: "hsl(var(--info-card-bg-to))",
          border: "hsl(var(--info-card-border))",
          text: "hsl(var(--info-card-text))",
          "text-secondary": "hsl(var(--info-card-text-secondary))",
          icon: "hsl(var(--info-card-icon))",
          button: "hsl(var(--info-card-button))",
          "button-hover": "hsl(var(--info-card-button-hover))",
          "button-hover-bg": "hsl(var(--info-card-button-hover-bg))",
        },
        absence: {
          "warning-bg": "hsl(var(--absence-warning-bg))",
          "warning-icon": "hsl(var(--absence-warning-icon))",
          "warning-title": "hsl(var(--absence-warning-title))",
          "info-bg": "hsl(var(--absence-info-bg))",
          "info-icon": "hsl(var(--absence-info-icon))",
          "info-title": "hsl(var(--absence-info-title))",
          "caution-bg": "hsl(var(--absence-caution-bg))",
          "caution-icon": "hsl(var(--absence-caution-icon))",
          "caution-title": "hsl(var(--absence-caution-title))",
        },
        "stat-icon": {
          blue: "hsl(var(--stat-icon-blue))",
          "blue-bg": "hsl(var(--stat-icon-blue-bg))",
          orange: "hsl(var(--stat-icon-orange))",
          "orange-bg": "hsl(var(--stat-icon-orange-bg))",
        },
        "empty-state": {
          "celebration-bg": "hsl(var(--empty-state-celebration-bg))",
        },
      },
      fontSize: {
        "page-title": [
          "var(--font-size-page-title)",
          { lineHeight: "1.33", fontWeight: "700", letterSpacing: "-0.025em" },
        ],
        "section-heading": [
          "var(--font-size-section-heading)",
          { lineHeight: "1.3", fontWeight: "600" },
        ],
        body: ["var(--font-size-body)", { lineHeight: "1.5", fontWeight: "400" }],
        caption: [
          "var(--font-size-caption)",
          { lineHeight: "1.4", fontWeight: "400" },
        ],
        stat: ["var(--font-size-stat)", { lineHeight: "1.2", fontWeight: "700" }],
      },
      spacing: {
        "card-padding": "var(--spacing-card-padding)",
        "page-padding": "var(--spacing-page-padding)",
        "page-padding-top": "var(--spacing-page-padding-top)",
        "card-gap": "var(--spacing-card-gap)",
      },
      maxWidth: {
        content: "var(--content-max-width)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
