import type {
  FieldValue,
  FormDefinition,
  SerializedFormDefinition,
} from "../definition";
import type { FormEvent } from "./events";
import { createInitialState, reduce } from "./reducer";
import type { FormState } from "./types";

export interface FormStore {
  getState(): FormState;
  dispatch(event: FormEvent): void;
  subscribe(listener: () => void): () => void;
  replace(state: FormState): void;
}

export function createFormStore(
  definition: FormDefinition | SerializedFormDefinition,
  initialValues?: Record<string, FieldValue>,
): FormStore {
  let state = createInitialState(definition, initialValues);
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    getState: () => state,
    dispatch(event) {
      const nextState = reduce(state, event);
      if (nextState !== state) {
        state = nextState;
        notify();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    replace(nextState) {
      if (nextState !== state) {
        state = nextState;
        notify();
      }
    },
  };
}
