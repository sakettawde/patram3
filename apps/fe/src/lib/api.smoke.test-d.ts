import { api } from "./api";

// type-only smoke: the call should be callable.
void (async () => {
  const res = await api.me.$get();
  if (res.ok) {
    const json = await res.json();
    json.user.id satisfies string;
  }
});
