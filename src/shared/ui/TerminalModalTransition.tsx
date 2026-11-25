import {
  createContext,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router-dom";

const MODAL_HISTORY_STATE_KEY = "__terminalModalOpen";

interface ModalEntry {
  id: string;
  close: () => void;
  canDismiss: () => boolean;
}

interface ModalHistoryContextValue {
  register: (entry: ModalEntry) => void;
  unregister: (id: string) => void;
}

const ModalHistoryContext = createContext<ModalHistoryContextValue | null>(null);

function readLocationState(state: unknown) {
  return state && typeof state === "object"
    ? state as Record<string, unknown>
    : {};
}

function hasModalHistoryState(state: unknown) {
  return readLocationState(state)[MODAL_HISTORY_STATE_KEY] === true;
}

function removeModalHistoryState(state: unknown) {
  const nextState = { ...readLocationState(state) };
  delete nextState[MODAL_HISTORY_STATE_KEY];
  return nextState;
}

export function ModalHistoryProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const [entries, setEntries] = useState<ModalEntry[]>([]);
  const hasSentinelRef = useRef(false);
  const entriesRef = useRef(entries);
  const locationStateRef = useRef(location.state);
  const hasSentinel = hasModalHistoryState(location.state);
  const currentPath = `${location.pathname}${location.search}${location.hash}`;

  entriesRef.current = entries;
  locationStateRef.current = location.state;

  const register = useCallback((entry: ModalEntry) => {
    setEntries((current) => {
      const entryIndex = current.findIndex((candidate) => candidate.id === entry.id);
      if (entryIndex < 0) return [...current, entry];

      const next = [...current];
      next[entryIndex] = entry;
      return next;
    });
  }, []);

  const unregister = useCallback((id: string) => {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);
  const modalHistory = useMemo(
    () => ({ register, unregister }),
    [register, unregister],
  );

  useEffect(() => {
    if (entries.length === 0) {
      if (hasSentinel) {
        if (!hasSentinelRef.current) {
          navigate(currentPath, {
            replace: true,
            state: removeModalHistoryState(location.state),
          });
          return;
        }

        const sentinelPath = currentPath;
        const cleanupTimer = window.setTimeout(() => {
          const browserPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
          if (
            entriesRef.current.length === 0
            && browserPath === sentinelPath
            && hasModalHistoryState(locationStateRef.current)
          ) {
            hasSentinelRef.current = false;
            navigate(-1);
          }
        }, 0);

        return () => window.clearTimeout(cleanupTimer);
      } else {
        hasSentinelRef.current = false;
      }
      return;
    }

    if (hasSentinel) {
      hasSentinelRef.current = true;
      return;
    }

    if (hasSentinelRef.current && navigationType === "POP") {
      const topEntry = entries[entries.length - 1];
      if (!topEntry.canDismiss()) {
        navigate(1);
        return;
      }

      hasSentinelRef.current = false;
      topEntry.close();
      return;
    }

    if (hasSentinelRef.current) {
      hasSentinelRef.current = false;
      return;
    }

    hasSentinelRef.current = true;
    navigate(currentPath, {
      state: {
        ...readLocationState(location.state),
        [MODAL_HISTORY_STATE_KEY]: true,
      },
    });
  }, [
    currentPath,
    entries,
    hasSentinel,
    location.state,
    navigate,
    navigationType,
  ]);

  return (
    <ModalHistoryContext.Provider value={modalHistory}>
      {children}
    </ModalHistoryContext.Provider>
  );
}

interface TerminalModalTransitionProps {
  visible: boolean;
  className: string;
  children: ReactNode;
  onRequestClose?: () => void;
  dismissible?: boolean;
}

export function TerminalModalTransition({
  visible,
  className,
  children,
  onRequestClose,
  dismissible = true,
}: TerminalModalTransitionProps) {
  const prefersReducedMotion = useReducedMotion();
  const modalHistory = useContext(ModalHistoryContext);
  const modalId = useId();
  const onRequestCloseRef = useRef(onRequestClose);
  const dismissibleRef = useRef(dismissible);

  useEffect(() => {
    onRequestCloseRef.current = onRequestClose;
    dismissibleRef.current = dismissible;
  }, [dismissible, onRequestClose]);

  useEffect(() => {
    if (!visible || !modalHistory) return;

    modalHistory.register({
      id: modalId,
      close: () => onRequestCloseRef.current?.(),
      canDismiss: () => dismissibleRef.current,
    });

    return () => modalHistory.unregister(modalId);
  }, [modalHistory, modalId, visible]);

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (
      event.target !== event.currentTarget
      || !dismissible
      || !onRequestClose
    ) {
      return;
    }

    onRequestClose();
  };

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          className={className}
          role="presentation"
          onClick={handleBackdropClick}
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.14 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
