import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { BootLoader } from "#/components/boot-loader";
import {
  useCreateUser,
  useCurrentUserQuery,
  useLookupUser,
  useStoredUserId,
} from "./use-current-user";
import type { User } from "./types";

const UserContext = createContext<User | null>(null);

export function useUser(): User {
  const user = useContext(UserContext);
  if (!user) throw new Error("useUser called outside <AuthGate>");
  return user;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [userId, setUserId] = useStoredUserId();
  const query = useCurrentUserQuery(userId);
  const qc = useQueryClient();

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (query.error?.status === 404) {
      setUserId(null);
      qc.removeQueries({ queryKey: ["currentUser", userId] });
    }
  }, [query.error, userId, setUserId, qc]);

  if (!hydrated) return <BootLoader />;
  if (!userId) return <NamePrompt onCreated={(u) => setUserId(u.id)} />;
  if (query.isPending) return <BootLoader />;
  if (query.error?.status === 404) return <NamePrompt onCreated={(u) => setUserId(u.id)} />;
  if (query.error) return <ErrorState message={query.error.message} />;
  if (!query.data) return <BootLoader />;

  return <UserContext.Provider value={query.data}>{children}</UserContext.Provider>;
}

function NamePrompt({ onCreated }: { onCreated: (user: User) => void }) {
  const [mode, setMode] = useState<"create" | "code">("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const create = useCreateUser();
  const lookup = useLookupUser();
  const qc = useQueryClient();

  const trimmed = name.trim();
  const trimmedCode = code.trim();
  const validName = trimmed.length > 0 && trimmed.length <= 80;

  const onCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validName || create.isPending) return;
    const user = await create.mutateAsync({ name: trimmed });
    onCreated(user);
  };

  const onCodeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!trimmedCode || lookup.pending) return;
    const user = await lookup.lookup(trimmedCode);
    if (user) {
      qc.setQueryData(["currentUser", user.id], user);
      onCreated(user);
    }
  };

  return (
    <Centered>
      {mode === "create" ? (
        <form onSubmit={onCreateSubmit} className="flex w-full max-w-sm flex-col gap-4">
          <div className="space-y-1">
            <h1 className="text-lg font-medium">What should we call you?</h1>
            <p className="text-sm text-muted-foreground">
              Used to label your work. You can change this later.
            </p>
          </div>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={80}
            disabled={create.isPending}
          />
          <Button type="submit" disabled={!validName || create.isPending}>
            {create.isPending ? "Creating…" : "Continue"}
          </Button>
          {create.error ? <p className="text-sm text-destructive">{create.error.message}</p> : null}
          <button
            type="button"
            onClick={() => setMode("code")}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Already have a code? Paste it
          </button>
        </form>
      ) : (
        <form onSubmit={onCodeSubmit} className="flex w-full max-w-sm flex-col gap-4">
          <div className="space-y-1">
            <h1 className="text-lg font-medium">Welcome back</h1>
            <p className="text-sm text-muted-foreground">Paste your patram code to continue.</p>
          </div>
          <Input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Your patram code"
            disabled={lookup.pending}
          />
          <Button type="submit" disabled={!trimmedCode || lookup.pending}>
            {lookup.pending ? "Checking…" : "Continue"}
          </Button>
          {lookup.error ? <p className="text-sm text-destructive">{lookup.error}</p> : null}
          <button
            type="button"
            onClick={() => setMode("create")}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Don't have a code? Pick a name
          </button>
        </form>
      )}
    </Centered>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Centered>
      <div className="space-y-2 text-center">
        <p className="text-sm text-destructive">{message}</p>
        <p className="text-xs text-muted-foreground">
          Check that the backend is running on {import.meta.env.VITE_BE_URL}.
        </p>
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex min-h-svh items-center justify-center px-6">{children}</div>;
}
