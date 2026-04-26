import {
  CalendarDays,
  Calculator,
  Database,
  FileText,
  Globe,
  Image,
  Languages,
  Plus,
  Terminal,
  type LucideIcon,
} from "lucide-react";

type MockSkill = {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  enabled: boolean;
};

const MOCK_SKILLS: MockSkill[] = [
  {
    id: "web-search",
    name: "Web search",
    description: "Look things up on the open web.",
    icon: Globe,
    enabled: true,
  },
  {
    id: "code-interpreter",
    name: "Code interpreter",
    description: "Run sandboxed Python for analysis.",
    icon: Terminal,
    enabled: true,
  },
  {
    id: "image-gen",
    name: "Image generation",
    description: "Generate images from a prompt.",
    icon: Image,
    enabled: false,
  },
  {
    id: "calendar",
    name: "Calendar lookup",
    description: "Read your calendar to suggest times.",
    icon: CalendarDays,
    enabled: true,
  },
  {
    id: "pdf",
    name: "PDF parser",
    description: "Extract text and tables from PDFs.",
    icon: FileText,
    enabled: true,
  },
  {
    id: "sql",
    name: "SQL query",
    description: "Run read-only queries against connected DBs.",
    icon: Database,
    enabled: false,
  },
  {
    id: "calc",
    name: "Calculator",
    description: "High-precision math.",
    icon: Calculator,
    enabled: true,
  },
  {
    id: "translate",
    name: "Translate",
    description: "Translate text between languages.",
    icon: Languages,
    enabled: false,
  },
];

export function SkillsPage() {
  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-6 px-8 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-(--ink)">Skills</h1>
          <p className="mt-1 text-[13px] text-(--ink-soft)">
            Capabilities the assistant can use during a chat.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md bg-(--ink) px-3 py-2 text-[13px] font-medium text-(--paper) shadow-sm transition hover:bg-(--ink-soft)"
        >
          <Plus className="size-3.5" />
          <span>Add skill</span>
        </button>
      </header>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {MOCK_SKILLS.map((s) => (
          <SkillCard key={s.id} skill={s} />
        ))}
        <AddSkillCard />
      </div>
    </div>
  );
}

function SkillCard({ skill }: { skill: MockSkill }) {
  const Icon = skill.icon;
  return (
    <article className="relative flex flex-col gap-2 rounded-lg border border-(--rule) bg-(--paper) p-4 transition hover:border-(--rule-strong)">
      <div className="flex items-start justify-between">
        <Icon className="size-4 text-(--ink-soft)" />
        <span
          className={
            skill.enabled
              ? "rounded-full bg-(--selection) px-2 py-0.5 text-[10px] font-medium text-(--ink)"
              : "rounded-full px-2 py-0.5 text-[10px] font-medium text-(--ink-faint)"
          }
        >
          {skill.enabled ? "Enabled" : "Disabled"}
        </span>
      </div>
      <h2 className="text-[13px] font-medium text-(--ink)">{skill.name}</h2>
      <p className="text-[12px] leading-snug text-(--ink-soft)">{skill.description}</p>
    </article>
  );
}

function AddSkillCard() {
  return (
    <button
      type="button"
      aria-label="Create new skill"
      className="flex min-h-28 items-center justify-center gap-2 rounded-lg border border-(--rule) border-dashed text-[13px] text-(--ink-faint) transition hover:border-(--rule-strong) hover:text-(--ink-soft)"
    >
      <Plus className="size-3.5" />
      <span>Add skill</span>
    </button>
  );
}
