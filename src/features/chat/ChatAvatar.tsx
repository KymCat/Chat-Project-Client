import { useEffect, useState } from "react";

interface ChatAvatarProps {
  name: string;
  imageUrl?: string | null;
  className?: string;
}

function getInitial(name: string) {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "?";
}

export function ChatAvatar({ name, imageUrl, className = "" }: ChatAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <span
      className={["chat-avatar", className].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      {imageUrl && !imageFailed
        ? <img src={imageUrl} alt="" onError={() => setImageFailed(true)} />
        : getInitial(name)}
    </span>
  );
}
