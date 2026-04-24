export type SectionSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export type SectionSave = {
  status: SectionSaveStatus;
  lastSavedAt: number | null;
  attempts: number;
};

export type SectionSaveAction =
  | { type: "edit" }
  | { type: "saveStart" }
  | { type: "saveOk"; at: number }
  | { type: "saveErr" }
  | { type: "fade" }
  | { type: "reload" };

export function initialSectionSave(): SectionSave {
  return { status: "idle", lastSavedAt: null, attempts: 0 };
}

export function reduceSectionSave(state: SectionSave, action: SectionSaveAction): SectionSave {
  switch (action.type) {
    case "edit":
      return { ...state, status: "dirty" };
    case "saveStart":
      return { ...state, status: "saving" };
    case "saveOk":
      return { status: "saved", lastSavedAt: action.at, attempts: 0 };
    case "saveErr":
      return { ...state, status: "error", attempts: state.attempts + 1 };
    case "fade":
      return { ...state, status: "idle" };
    case "reload":
      return { status: "idle", lastSavedAt: state.lastSavedAt, attempts: 0 };
  }
}
