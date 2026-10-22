interface ChatAvatarProps {
  name: string;
  imageUrl?: string | null;
  className?: string;
}

function getInitial(name: string) {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "?";
}

export function ChatAvatar({ name, imageUrl, className = "" }: ChatAvatarProps) {
  return (
    <span
      className={["chat-avatar", className].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      {imageUrl ? <img src={imageUrl} alt="" /> : getInitial(name)}
    </span>
  );
}
