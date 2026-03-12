import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* shadcn/ui standard */
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },

        /* Cal.com semantic palette */
        cal: {
          bg: {
            DEFAULT: "hsl(var(--cal-bg))",
            subtle: "hsl(var(--cal-bg-subtle))",
            muted: "hsl(var(--cal-bg-muted))",
            emphasis: "hsl(var(--cal-bg-emphasis))",
          },
          text: {
            emphasis: "hsl(var(--cal-text-emphasis))",
            DEFAULT: "hsl(var(--cal-text))",
            subtle: "hsl(var(--cal-text-subtle))",
            muted: "hsl(var(--cal-text-muted))",
          },
          border: {
            subtle: "hsl(var(--cal-border-subtle))",
            muted: "hsl(var(--cal-border-muted))",
          },
          brand: {
            DEFAULT: "hsl(var(--cal-brand))",
            text: "hsl(var(--cal-brand-text))",
          },
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};

export default config;
