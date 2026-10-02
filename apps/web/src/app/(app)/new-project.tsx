"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { Dialog } from "@/components/dialog";
import { Button, Field, Input, Select } from "@/components/ui";
import { createProject } from "./actions";

export function NewProjectButton({ workspaces }: { workspaces: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createProject, undefined);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        New project
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New project" description="One project per client site.">
        <form action={action} className="flex flex-col gap-4">
          <Field label="Project name" htmlFor="np-name">
            <Input id="np-name" name="name" required maxLength={80} placeholder="Acme website" autoFocus />
          </Field>
          <Field label="Site URL" htmlFor="np-url" hint="The webflow.io staging link or the live domain. You can connect more later.">
            <Input id="np-url" name="siteUrl" type="url" required placeholder="https://acme.webflow.io" />
          </Field>
          {workspaces.length > 1 && (
            <Field label="Workspace" htmlFor="np-ws" hint="Everyone in this workspace will see the project.">
              <Select id="np-ws" name="workspaceId" defaultValue={workspaces[workspaces.length - 1]!.id} className="h-10">
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {state && !state.ok && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
              {state.error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Creating…" : "Create project"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
