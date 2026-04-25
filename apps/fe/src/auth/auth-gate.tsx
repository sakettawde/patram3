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
import { useCreateUser, useCurrentUserQuery, useStoredUserId } from "./use-current-user";
import type { User } from "./types";

const UserContext = createContext<User | null>(null);

export function useUser(): User {
  const user = useContext(UserContext);
  if (!user) throw new Error("useUser called outside <AuthGate>");
  return user;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useStoredUserId();
  const query = useCurrentUserQuery(userId);
  const qc = useQueryClient();

  useEffect(() => {
    if (query.error?.status === 404) {
      setUserId(null);
      qc.removeQueries({ queryKey: ["currentUser", userId] });
    }
  }, [query.error, userId, setUserId, qc]);

  if (!userId) return <NamePrompt onCreated={(u) => setUserId(u.id)} />;
  if (query.isPending) return <Splash />;
  if (query.error?.status === 404) return <NamePrompt onCreated={(u) => setUserId(u.id)} />;
  if (query.error) return <ErrorState message={query.error.message} />;
  if (!query.data) return <Splash />;

  return <UserContext.Provider value={query.data}>{children}</UserContext.Provider>;
}

function NamePrompt({ onCreated }: { onCreated: (user: User) => void }) {
  const [name, setName] = useState("");
  const create = useCreateUser();

  const trimmed = name.trim();
  const valid = trimmed.length > 0 && trimmed.length <= 80;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || create.isPending) return;
    const user = await create.mutateAsync({ name: trimmed });
    onCreated(user);
  };

  return (
    <Centered>
      <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
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
        <Button type="submit" disabled={!valid || create.isPending}>
          {create.isPending ? "Creating…" : "Continue"}
        </Button>
        {create.error ? <p className="text-sm text-destructive">{create.error.message}</p> : null}
      </form>
    </Centered>
  );
}

function Splash() {
  return (
    <Centered>
      <p className="text-sm text-muted-foreground">Loading…</p>
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
