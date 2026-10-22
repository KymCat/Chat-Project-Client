import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthProvider";

const LOADING_TEXT = "Get Over the World 🌐";
const TYPING_INTERVAL_MS = 65;
const COMPLETION_DELAY_MS = 320;

interface LoadingScreenProps {
  overlay?: boolean;
  onComplete?: () => void;
}

function LoadingScreen({ overlay = false, onComplete }: LoadingScreenProps) {
  const prefersReducedMotion = useReducedMotion();
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    const characters = Array.from(LOADING_TEXT);
    let characterIndex = 0;
    let completionTimeoutId: number | undefined;

    if (prefersReducedMotion) {
      setDisplayedText(LOADING_TEXT);
      if (onComplete) {
        completionTimeoutId = window.setTimeout(onComplete, COMPLETION_DELAY_MS);
      }

      return () => {
        if (completionTimeoutId !== undefined) {
          window.clearTimeout(completionTimeoutId);
        }
      };
    }

    setDisplayedText("");
    const typingIntervalId = window.setInterval(() => {
      characterIndex += 1;
      setDisplayedText(characters.slice(0, characterIndex).join(""));

      if (characterIndex >= characters.length) {
        window.clearInterval(typingIntervalId);
        if (onComplete) {
          completionTimeoutId = window.setTimeout(onComplete, COMPLETION_DELAY_MS);
        }
      }
    }, TYPING_INTERVAL_MS);

    return () => {
      window.clearInterval(typingIntervalId);
      if (completionTimeoutId !== undefined) {
        window.clearTimeout(completionTimeoutId);
      }
    };
  }, [onComplete, prefersReducedMotion]);

  return (
    <motion.div
      className={overlay ? "loading-screen is-overlay" : "loading-screen"}
      aria-label={LOADING_TEXT}
      aria-live="polite"
      role="status"
      initial={false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{
        duration: prefersReducedMotion ? 0 : 0.38,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <p className="loading-typing-text" aria-hidden="true">
        {displayedText}
        <span className="loading-typing-cursor">█</span>
      </p>
    </motion.div>
  );
}

export function ProtectedRoute() {
  const {
    accessToken,
    isBootstrapping,
    isLoginTransitionPending,
    completeLoginTransition,
  } = useAuth();

  if (isBootstrapping) return <LoadingScreen />;
  if (!accessToken) return <Navigate to="/login" replace />;

  return (
    <>
      <Outlet />
      <AnimatePresence initial={false}>
        {isLoginTransitionPending && (
          <LoadingScreen overlay onComplete={completeLoginTransition} />
        )}
      </AnimatePresence>
    </>
  );
}

export function PublicOnlyRoute() {
  const { accessToken, isBootstrapping } = useAuth();

  if (isBootstrapping) return <LoadingScreen />;
  return accessToken ? <Navigate to="/chat" replace /> : <Outlet />;
}
