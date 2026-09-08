import { Client, type IMessage, type StompSubscription } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { webSocketUrl } from "../../shared/config/env";

export interface ChatMessage {
  content: string;
  senderId: number;
  senderNickname: string;
  type: "CHAT" | "ENTER" | "LEAVE";
  roomId: string;
}

interface ChatMessageRequest {
  content: string;
  roomId: string;
}

interface ConnectOptions {
  roomId: string;
  accessToken: string;
  onMessage: (message: ChatMessage) => void;
  onStatusChange: (connected: boolean) => void;
  onError: (message: string) => void;
}

export function connectChat(options: ConnectOptions) {
  let messageSubscription: StompSubscription | undefined;
  let enterSubscription: StompSubscription | undefined;

  const client = new Client({
    webSocketFactory: () => new SockJS(webSocketUrl),
    connectHeaders: {
      Authorization: `Bearer ${options.accessToken}`,
    },
    reconnectDelay: 5000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    onConnect: () => {
      options.onStatusChange(true);

      const receive = (frame: IMessage) => {
        try {
          options.onMessage(JSON.parse(frame.body) as ChatMessage);
        } catch {
          options.onError("수신한 메시지를 읽을 수 없습니다.");
        }
      };

      messageSubscription = client.subscribe(`/sub/msg/${options.roomId}`, receive);
      enterSubscription = client.subscribe(`/sub/enter/${options.roomId}`, receive);

      client.publish({
        destination: "/pub/enter",
        body: JSON.stringify({
          content: "",
          roomId: options.roomId,
        } satisfies ChatMessageRequest),
      });
    },
    onDisconnect: () => options.onStatusChange(false),
    onWebSocketClose: () => options.onStatusChange(false),
    onStompError: () => options.onError("채팅 서버 연결에 실패했습니다."),
  });

  client.activate();

  return {
    send(content: string) {
      if (!client.connected) {
        throw new Error("채팅 서버에 연결되어 있지 않습니다.");
      }

      client.publish({
        destination: "/pub/msg",
        body: JSON.stringify({
          content,
          roomId: options.roomId,
        } satisfies ChatMessageRequest),
      });
    },
    disconnect() {
      messageSubscription?.unsubscribe();
      enterSubscription?.unsubscribe();
      void client.deactivate();
    },
  };
}
