"use client";

import type { PropsWithChildren } from "react";
import { useEffect, useState } from "react";

import {
  Alert,
  AppShell,
  Burger,
  Group,
  NavLink,
  ScrollArea,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconAlbum,
  IconBooks,
  IconCloudDownload,
  IconPhotoSearch,
  IconReportAnalytics,
  IconScan,
} from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AppSectionLayout({ children }: PropsWithChildren) {
  const [opened, { toggle }] = useDisclosure();
  const pathname = usePathname();
  const [envOk, setEnvOk] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then((r) => {
        if (!cancelled) setEnvOk(r.ok);
      })
      .catch(() => {
        if (!cancelled) setEnvOk(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const nav = (
    <>
      <NavLink
        component={Link}
        href="/collection"
        label="Collection"
        leftSection={<IconAlbum size={18} />}
        active={pathname.startsWith("/collection")}
      />
      <NavLink
        component={Link}
        href="/report"
        label="Report"
        leftSection={<IconReportAnalytics size={18} />}
        active={pathname.startsWith("/report")}
      />
      <NavLink
        component={Link}
        href="/search"
        label="Search"
        leftSection={<IconPhotoSearch size={18} />}
        active={pathname.startsWith("/search")}
      />
      <NavLink
        component={Link}
        href="/scan"
        label="Scan"
        leftSection={<IconScan size={18} />}
        active={pathname.startsWith("/scan")}
      />
      <NavLink
        component={Link}
        href="/binders"
        label="Binders"
        leftSection={<IconBooks size={18} />}
        active={pathname.startsWith("/binders")}
      />
      <NavLink
        component={Link}
        href="/sync"
        label="Sync"
        leftSection={<IconCloudDownload size={18} />}
        active={pathname.startsWith("/sync")}
      />
    </>
  );

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 260,
        breakpoint: "sm",
        collapsed: { mobile: !opened },
      }}
      padding="md"
    >
      <AppShell.Header px="md">
        <Group h="100%">
          <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
          <Title order={4}>MTG Collection</Title>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="md">
        <ScrollArea>{nav}</ScrollArea>
      </AppShell.Navbar>
      <AppShell.Main>
        {envOk === false && (
          <Alert title="Server configuration" color="red" mb="md">
            MTG_DATA_DIR is missing or the server cannot read your dataset. Set MTG_DATA_DIR to an
            absolute path (with config.json, collection/, catalog/) and restart.
          </Alert>
        )}
        {children}
      </AppShell.Main>
    </AppShell>
  );
}
