import { IntegrationLogo, type IntegrationName } from "./integration-logos";

type MockIntegration = { name: IntegrationName; description: string };

const MOCK_INTEGRATIONS: MockIntegration[] = [
  { name: "Slack", description: "Post updates and read channels." },
  { name: "Linear", description: "Create issues, read backlog." },
  { name: "Gmail", description: "Search and draft email." },
  { name: "Notion", description: "Read pages, append blocks." },
  { name: "GitHub", description: "Open PRs, read issues, run checks." },
  { name: "Google Drive", description: "Search and attach files." },
  { name: "Jira", description: "Create and read tickets." },
];

export function SettingsPage() {
  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-6 px-8 py-10">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight text-(--ink)">Configuration</h1>
        <p className="mt-1 text-[13px] text-(--ink-soft)">Connect this agent to your tools.</p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-[12px] font-medium tracking-wide text-(--ink-faint) uppercase">
          Integrations
        </h2>
        <ul className="flex flex-col divide-y divide-(--rule) overflow-hidden rounded-lg border border-(--rule) bg-(--paper)">
          {MOCK_INTEGRATIONS.map((i) => (
            <li key={i.name} className="flex items-center gap-4 px-4 py-3">
              <IntegrationLogo name={i.name} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-(--ink)">{i.name}</p>
                <p className="truncate text-[12px] text-(--ink-soft)">{i.description}</p>
              </div>
              <button
                type="button"
                className="inline-flex items-center rounded-md border border-(--rule) px-3 py-1.5 text-[12px] text-(--ink-soft) transition hover:bg-(--paper-soft) hover:text-(--ink)"
              >
                Connect
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
