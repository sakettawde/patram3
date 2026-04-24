export type SectionSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

export type SectionSave = {
  status: SectionSaveStatus;
  lastSavedAt: number | null;
};

export type SectionSaveAction =
  | { type: "edit" }
  | { type: "saveStart" }
  | { type: "saveOk"; at: number }
  | { type: "networkError" }
  | { type: "conflict" }
  | { type: "fade" }
  | { type: "reload" };

export function initialSectionSave(): SectionSave {
  return { status: "idle", lastSavedAt: null };
}

export function reduceSectionSave(state: SectionSave, action: SectionSaveAction): SectionSave {
  switch (action.type) {
    case "edit":
      return { ...state, status: "dirty" };
    case "saveStart":
      return { ...state, status: "saving" };
    case "saveOk":
      return { status: "saved", lastSavedAt: action.at };
    case "networkError":
      return { ...state, status: "error" };
    case "conflict":
      return { ...state, status: "conflict" };
    case "fade":
      return { ...state, status: "idle" };
    case "reload":
      return { status: "idle", lastSavedAt: state.lastSavedAt };
  }
}
