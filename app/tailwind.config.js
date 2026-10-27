import { heroui } from "@heroui/react";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}", "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: { sans: ['"Noto Sans KR"', "system-ui", "-apple-system", "sans-serif"] },
    },
  },
  plugins: [
    heroui({
      themes: {
        light: {
          colors: {
            background: "#F7F8F7",
            foreground: "#16201D",
            content1: "#FFFFFF",
            primary: { DEFAULT: "#0B7A64", foreground: "#FFFFFF", 50: "#E7F5F1", 100: "#C6E8DF", 200: "#93D3C3", 300: "#5CBBA4", 400: "#2E9F86", 500: "#0B7A64", 600: "#096652", 700: "#075141", 800: "#053C30", 900: "#032720" },
            secondary: { DEFAULT: "#C77A12", foreground: "#FFFFFF" },
            focus: "#0B7A64",
          },
        },
        dark: {
          colors: {
            background: "#0F1513",
            foreground: "#E6ECEA",
            content1: "#18201D",
            primary: { DEFAULT: "#3CCBA6", foreground: "#062019", 50: "#032720", 100: "#053C30", 200: "#075141", 300: "#096652", 400: "#0B7A64", 500: "#2E9F86", 600: "#5CBBA4", 700: "#93D3C3", 800: "#C6E8DF", 900: "#E7F5F1" },
            secondary: { DEFAULT: "#F0A63C", foreground: "#231502" },
            focus: "#3CCBA6",
          },
        },
      },
    }),
  ],
};
