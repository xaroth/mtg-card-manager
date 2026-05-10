"use client";

import {
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useEffect } from "react";

import type { BinderEntry, PrintRow } from "@/lib/mtg/schemas";

type Slot = { binder: string; nonfoil: number; foil: number };

export function PrintEditModal({
  opened,
  onClose,
  binders,
  initial,
  onSaved,
}: {
  opened: boolean;
  onClose: () => void;
  binders: BinderEntry[];
  initial: PrintRow | null;
  onSaved: () => void;
}) {
  const form = useForm({
    initialValues: {
      storageNon: 0,
      storageFoil: 0,
      note: "",
      slots: [] as Slot[],
    },
  });

  useEffect(() => {
    if (!initial) return;
    form.setValues({
      storageNon: initial.storage.nonfoil,
      storageFoil: initial.storage.foil,
      note: initial.note,
      slots: initial.binders.map((b) => ({
        binder: b.binder,
        nonfoil: b.nonfoil,
        foil: b.foil,
      })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when print changes
  }, [initial]);

  const binderOptions = binders.map((b) => ({
    value: b.id,
    label: b.name?.trim() ? b.name.trim() : "Unnamed binder",
  }));

  async function save() {
    if (!initial) return;
    const row: PrintRow = {
      ...initial,
      storage: {
        nonfoil: form.values.storageNon,
        foil: form.values.storageFoil,
      },
      binders: form.values.slots.filter((s) => s.binder),
      note: form.values.note,
    };
    const res = await fetch(
      `/api/prints/${encodeURIComponent(row.set)}/${encodeURIComponent(row.id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row),
      },
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      notifications.show({
        title: "Save failed",
        message: j.error ?? res.statusText,
        color: "red",
      });
      return;
    }
    notifications.show({ title: "Saved", message: row.name });
    onSaved();
    onClose();
  }

  async function removePrint() {
    if (!initial) return;
    const res = await fetch(
      `/api/prints/${encodeURIComponent(initial.set)}/${encodeURIComponent(initial.id)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      notifications.show({
        title: "Delete failed",
        message: await res.text(),
        color: "red",
      });
      return;
    }
    notifications.show({ title: "Removed", message: initial.name });
    onSaved();
    onClose();
  }

  return (
    <Modal opened={opened} onClose={onClose} title={initial?.name ?? "Print"} size="lg">
      <Stack gap="sm">
        <TextInput label="Set" value={initial?.set ?? ""} readOnly />
        <TextInput label="Collector #" value={initial?.collector_number ?? ""} readOnly />
        <Group grow>
          <NumberInput label="Storage nonfoil" {...form.getInputProps("storageNon")} min={0} />
          <NumberInput label="Storage foil" {...form.getInputProps("storageFoil")} min={0} />
        </Group>
        <Textarea label="Note" {...form.getInputProps("note")} minRows={2} />
        {form.values.slots.map((slot, i) => (
          <Group key={i} align="flex-end" grow>
            <Select
              label={i === 0 ? "Binder slots" : undefined}
              placeholder="Binder"
              data={binderOptions}
              searchable
              {...form.getInputProps(`slots.${i}.binder`)}
            />
            <NumberInput label={i === 0 ? "Nonfoil" : undefined} min={0} {...form.getInputProps(`slots.${i}.nonfoil`)} />
            <NumberInput label={i === 0 ? "Foil" : undefined} min={0} {...form.getInputProps(`slots.${i}.foil`)} />
            <Button
              variant="light"
              color="red"
              onClick={() =>
                form.setFieldValue(
                  "slots",
                  form.values.slots.filter((_, j) => j !== i),
                )
              }
            >
              ✕
            </Button>
          </Group>
        ))}
        <Button
          variant="light"
          disabled={binders.length === 0}
          onClick={() =>
            form.setFieldValue("slots", [
              ...form.values.slots,
              { binder: binders[0]?.id ?? "", nonfoil: 0, foil: 0 },
            ])
          }
        >
          Add binder slot
        </Button>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button color="red" variant="light" onClick={removePrint}>
            Remove from collection
          </Button>
          <Button onClick={save}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
