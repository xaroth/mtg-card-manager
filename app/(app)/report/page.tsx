"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Accordion,
  Alert,
  Badge,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconReportAnalytics } from "@tabler/icons-react";

import { SetIcon } from "@/components/SetIcon";
import type {
  CollectionReport,
  CollectionReportCardLine,
  CollectionReportSetBlock,
} from "@/lib/mtg/build-collection-report";

const fmtUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtEur = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function moneyUsd(n: number): string {
  return fmtUsd.format(n);
}

function moneyEur(n: number): string {
  return fmtEur.format(n);
}

function dashUsd(n: number | null): string {
  return n == null ? "—" : moneyUsd(n);
}

function dashEur(n: number | null): string {
  return n == null ? "—" : moneyEur(n);
}

function subCell(
  qty: number,
  missingCatalog: boolean,
  missingUnit: boolean,
  subtotal: number,
  fmt: (n: number) => string,
): string {
  if (qty === 0) return "—";
  if (missingCatalog || missingUnit) return "—";
  return fmt(subtotal);
}

function CardRow({ line }: { line: CollectionReportCardLine }) {
  const warn =
    line.missingCatalog ||
    line.missingNonfoilPriceUsd ||
    line.missingNonfoilPriceEur ||
    line.missingFoilPriceUsd ||
    line.missingFoilPriceEur;

  return (
    <Table.Tr
      style={
        warn ? { borderLeft: "3px solid var(--mantine-color-orange-filled)" } : undefined
      }
    >
      <Table.Td>
        <Text size="sm" lineClamp={2}>
          {line.name}
        </Text>
        {line.missingCatalog ? (
          <Text size="xs" c="orange">
            Catalog file missing — sync to price this print
          </Text>
        ) : null}
      </Table.Td>
      <Table.Td style={{ whiteSpace: "nowrap" }}>{line.collector_number}</Table.Td>
      <Table.Td ta="right">{line.qtyNonfoil}</Table.Td>
      <Table.Td ta="right">{dashUsd(line.unitNonfoilUsd)}</Table.Td>
      <Table.Td ta="right">{dashEur(line.unitNonfoilEur)}</Table.Td>
      <Table.Td ta="right">
        {subCell(line.qtyNonfoil, line.missingCatalog, line.missingNonfoilPriceUsd, line.subtotalNonfoilUsd, moneyUsd)}
      </Table.Td>
      <Table.Td ta="right">
        {subCell(line.qtyNonfoil, line.missingCatalog, line.missingNonfoilPriceEur, line.subtotalNonfoilEur, moneyEur)}
      </Table.Td>
      <Table.Td ta="right">{line.qtyFoil}</Table.Td>
      <Table.Td ta="right">{dashUsd(line.unitFoilUsd)}</Table.Td>
      <Table.Td ta="right">{dashEur(line.unitFoilEur)}</Table.Td>
      <Table.Td ta="right">
        {subCell(line.qtyFoil, line.missingCatalog, line.missingFoilPriceUsd, line.subtotalFoilUsd, moneyUsd)}
      </Table.Td>
      <Table.Td ta="right">
        {subCell(line.qtyFoil, line.missingCatalog, line.missingFoilPriceEur, line.subtotalFoilEur, moneyEur)}
      </Table.Td>
      <Table.Td ta="right" fw={600}>
        {moneyUsd(line.lineTotalUsd)}
      </Table.Td>
      <Table.Td ta="right" fw={600}>
        {moneyEur(line.lineTotalEur)}
      </Table.Td>
    </Table.Tr>
  );
}

function SetPanel({ block }: { block: CollectionReportSetBlock }) {
  return (
    <Table.ScrollContainer minWidth={1320}>
      <Table striped highlightOnHover horizontalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th rowSpan={2}>Card</Table.Th>
            <Table.Th rowSpan={2}>#</Table.Th>
            <Table.Th ta="center" colSpan={5}>
              Nonfoil
            </Table.Th>
            <Table.Th ta="center" colSpan={5}>
              Foil
            </Table.Th>
            <Table.Th ta="center" colSpan={2} rowSpan={2}>
              Line total
            </Table.Th>
          </Table.Tr>
          <Table.Tr>
            <Table.Th ta="right">Qty</Table.Th>
            <Table.Th ta="right">@ USD</Table.Th>
            <Table.Th ta="right">@ EUR</Table.Th>
            <Table.Th ta="right">USD</Table.Th>
            <Table.Th ta="right">EUR</Table.Th>
            <Table.Th ta="right">Qty</Table.Th>
            <Table.Th ta="right">@ USD</Table.Th>
            <Table.Th ta="right">@ EUR</Table.Th>
            <Table.Th ta="right">USD</Table.Th>
            <Table.Th ta="right">EUR</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{block.cards.map((c) => <CardRow key={c.id} line={c} />)}</Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

export default function ReportPage() {
  const [report, setReport] = useState<CollectionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [openedSets, setOpenedSets] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/collection-report");
      const body = (await res.json()) as CollectionReport | { error?: string };
      if (!res.ok) {
        throw new Error(
          typeof body === "object" && body && "error" in body && body.error
            ? String(body.error)
            : res.statusText,
        );
      }
      setReport(body as CollectionReport);
    } catch (e) {
      notifications.show({
        title: "Report failed",
        message: e instanceof Error ? e.message : String(e),
        color: "red",
      });
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const summaryWarnings = useMemo(() => {
    if (!report) return null;
    const parts: string[] = [];
    if (report.cardsMissingCatalog > 0) {
      parts.push(`${report.cardsMissingCatalog} print(s) have no catalog file — run sync.`);
    }
    if (report.cardsWithMissingNonfoilPriceUsd > 0) {
      parts.push(
        `${report.cardsWithMissingNonfoilPriceUsd} line(s): nonfoil copies but no Scryfall USD price.`,
      );
    }
    if (report.cardsWithMissingNonfoilPriceEur > 0) {
      parts.push(
        `${report.cardsWithMissingNonfoilPriceEur} line(s): nonfoil copies but no Scryfall EUR price.`,
      );
    }
    if (report.cardsWithMissingFoilPriceUsd > 0) {
      parts.push(
        `${report.cardsWithMissingFoilPriceUsd} line(s): foil copies but no Scryfall foil USD price.`,
      );
    }
    if (report.cardsWithMissingFoilPriceEur > 0) {
      parts.push(
        `${report.cardsWithMissingFoilPriceEur} line(s): foil copies but no Scryfall foil EUR price.`,
      );
    }
    if (!parts.length) return null;
    return parts.join(" ");
  }, [report]);

  return (
    <Stack gap="md">
      <Group gap="sm">
        <IconReportAnalytics size={28} aria-hidden />
        <Title order={2}>Report</Title>
      </Group>

      <Text size="sm" c="dimmed">
        Owned prints only (wishlist rows are excluded). Values use Scryfall list prices from your synced catalog:
        USD (<code>usd</code>, <code>usd_foil</code>, <code>usd_etched</code>) and EUR (<code>eur</code>,{" "}
        <code>eur_foil</code>, <code>eur_etched</code>). Run <code>pnpm sync</code> so pricing stays current.
      </Text>

      {loading ? (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      ) : !report ? (
        <Text size="sm" c="dimmed">
          No report loaded.
        </Text>
      ) : report.ownedPrintCount === 0 ? (
        <Paper withBorder p="md" radius="md">
          <Text size="sm">You do not have any owned prints yet — only wishlist entries or an empty collection.</Text>
        </Paper>
      ) : (
        <>
          <Paper withBorder p="lg" radius="md" shadow="xs">
            <Stack gap="lg">
              <Group align="flex-start" wrap="wrap" gap="xl">
                <div>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                    Collection total (USD)
                  </Text>
                  <Title order={2}>{moneyUsd(report.grandTotalUsd)}</Title>
                  <Group gap="md" mt="xs">
                    <div>
                      <Text size="xs" c="dimmed">
                        Nonfoil
                      </Text>
                      <Text fw={600}>{moneyUsd(report.grandTotalNonfoilUsd)}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">
                        Foil
                      </Text>
                      <Text fw={600}>{moneyUsd(report.grandTotalFoilUsd)}</Text>
                    </div>
                  </Group>
                </div>
                <div>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                    Collection total (EUR)
                  </Text>
                  <Title order={2}>{moneyEur(report.grandTotalEur)}</Title>
                  <Group gap="md" mt="xs">
                    <div>
                      <Text size="xs" c="dimmed">
                        Nonfoil
                      </Text>
                      <Text fw={600}>{moneyEur(report.grandTotalNonfoilEur)}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">
                        Foil
                      </Text>
                      <Text fw={600}>{moneyEur(report.grandTotalFoilEur)}</Text>
                    </div>
                  </Group>
                </div>
                <div style={{ marginTop: "1.25rem" }}>
                  <Text size="xs" c="dimmed">
                    Owned print rows
                  </Text>
                  <Text fw={600}>{report.ownedPrintCount}</Text>
                </div>
              </Group>
              <Text size="xs" c="dimmed">
                Generated {new Date(report.generatedAt).toLocaleString()}
              </Text>
            </Stack>
          </Paper>

          {summaryWarnings ? (
            <Alert color="yellow" title="Pricing gaps">
              {summaryWarnings}
            </Alert>
          ) : null}

          <Accordion
            multiple
            variant="contained"
            value={openedSets}
            onChange={setOpenedSets}
          >
            {report.sets.map((block) => (
              <Accordion.Item key={block.setCode} value={block.setCode}>
                <Accordion.Control>
                  <Group justify="space-between" wrap="nowrap" pr="sm">
                    <Group gap="xs" wrap="nowrap" align="center" style={{ minWidth: 0 }}>
                      <SetIcon code={block.setCode} />
                      <Stack gap={0} style={{ minWidth: 0 }}>
                        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                          <Text fw={600} truncate>
                            {block.setCode.toUpperCase()}
                          </Text>
                          {block.setName ? (
                            <Text size="sm" c="dimmed" truncate style={{ flex: 1 }}>
                              · {block.setName}
                            </Text>
                          ) : null}
                        </Group>
                        <Text size="xs" c="dimmed">
                          NF {moneyUsd(block.totalNonfoilUsd)} / {moneyEur(block.totalNonfoilEur)} · F{" "}
                          {moneyUsd(block.totalFoilUsd)} / {moneyEur(block.totalFoilEur)} · {block.cards.length}{" "}
                          card line(s)
                        </Text>
                      </Stack>
                    </Group>
                    <Stack gap={4} align="flex-end">
                      <Badge size="lg" variant="light">
                        {moneyUsd(block.totalUsd)}
                      </Badge>
                      <Badge size="md" variant="outline" color="gray">
                        {moneyEur(block.totalEur)}
                      </Badge>
                    </Stack>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <SetPanel block={block} />
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </>
      )}
    </Stack>
  );
}
