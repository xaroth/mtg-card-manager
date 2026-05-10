"use client";

import type { FC, PropsWithChildren } from "react";

import {
  ColorSchemeScript as MantineColorSchemeScript,
  MantineProvider,
  camelToKebabCase,
  createTheme,
  rem,
  type CSSVariablesResolver,
  type MantineColorScheme,
} from "@mantine/core";

const toVarName = (key: string) => `--mantine-${camelToKebabCase(key)}`;
const toVariables = <T extends Record<string, unknown>>(obj: T) =>
  Object.entries(obj).reduce<Record<string, string>>((acc, [k, value]) => {
    acc[toVarName(k)] = typeof value === "string" ? value : String(value);
    return acc;
  }, {});

const defaultColorScheme: MantineColorScheme = "dark";

const theme = createTheme({
  other: {
    headerHeight: rem(60),
  },
});

const cssVariablesResolver: CSSVariablesResolver = ({ other }) => ({
  variables: {
    ...toVariables(other ?? {}),
  },
  light: {},
  dark: {},
});

export const ColorSchemeScript: FC = (props) => (
  <MantineColorSchemeScript defaultColorScheme={defaultColorScheme} {...props} />
);

export const ThemeProvider: FC<PropsWithChildren> = (props) => (
  <MantineProvider
    theme={theme}
    defaultColorScheme={defaultColorScheme}
    cssVariablesResolver={cssVariablesResolver}
    {...props}
  />
);
