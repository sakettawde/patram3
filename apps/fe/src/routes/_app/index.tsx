import { createFileRoute } from "@tanstack/react-router";
import { DocSurface } from "#/components/doc/doc-surface";

export const Route = createFileRoute("/_app/")({ component: DocSurface });
