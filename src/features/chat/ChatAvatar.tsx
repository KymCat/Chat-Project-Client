import { memo, useEffect, useState } from "react";
import { useProfileImageUrl } from "../member/profileImage";

interface ChatAvatarProps {
  name: string;
  memberId?: number | null;
  imageRevision?: number;
  imageUrl?: string | null;
  className?: string;
}

function getInitial(name: string) {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "?";
}

export const ChatAvatar = memo(function ChatAvatar({
  name,
  memberId = null,
  imageRevision,
  imageUrl,
  className = "",
}: ChatAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const profileImageUrl = useProfileImageUrl(memberId, imageRevision);
  const resolvedImageUrl = imageUrl ?? profileImageUrl;

  useEffect(() => {
    setImageFailed(false);
  }, [resolvedImageUrl]);

  return (
    <span
      className={["chat-avatar", className].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      {resolvedImageUrl && !imageFailed
        ? (
          <img
            src={resolvedImageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
          />
        )
        : getInitial(name)}
    </span>
  );
});
