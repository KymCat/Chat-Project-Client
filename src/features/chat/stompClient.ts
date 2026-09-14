import { Client, type IMessage, type StompSubscription } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { webSocketUrl } from "../../shared/config/env";
import type { ChatMessage } from "./api";

export type { ChatMessage } from "./api";

interface ChatMessageRequest {
  content: string;
  roomId: number;
}

interface ConnectOptions {
  accessToken: string;
  onMessage: (message: ChatMessage) => void;
  onStatusChange: (connected: boolean) => void;
  onError: (message: string) => void;
}

export function connectChat(options: ConnectOptions) {
  const subscribedRoomIds = new Set<number>();
  const subscriptions = new Map<number, StompSubscription>();

  const receive = (frame: IMessage) => {
    try {
      options.onMessage(JSON.parse(frame.body) as ChatMessage);
    } catch {
      options.onError("수신한 메시지를 읽을 수 없습니다.");
    }
  };

  const subscribe = (roomId: number) => {
    if (!client.connected || subscriptions.has(roomId)) return;

    subscriptions.set(
      roomId,
      client.subscribe(`/sub/msg/${roomId}`, receive),
    );
  };

  const client = new Client({
    webSocketFactory: () => new SockJS(webSocketUrl),
    connectHeaders: {
      Authorization: `Bearer ${options.accessToken}`,
    },
    reconnectDelay: 5000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    onConnect: () => {
      subscriptions.clear();
      subscribedRoomIds.forEach(subscribe);
      options.onStatusChange(true);
    },
    onDisconnect: () => options.onStatusChange(false),
    onWebSocketClose: () => {
      subscriptions.clear();
      options.onStatusChange(false);
    },
    onStompError: () => options.onError("채팅 서버 연결에 실패했습니다."),
  });

  client.activate();

  return {
    syncSubscriptions(roomIds: number[]) {
      const nextRoomIds = new Set(roomIds);

      subscribedRoomIds.forEach((roomId) => {
        if (nextRoomIds.has(roomId)) return;

        subscriptions.get(roomId)?.unsubscribe();
        subscriptions.delete(roomId);
        subscribedRoomIds.delete(roomId);
      });

      nextRoomIds.forEach((roomId) => {
        subscribedRoomIds.add(roomId);
        subscribe(roomId);
      });
    },
    send(roomId: number, content: string) {
      if (!client.connected) {
        throw new Error("채팅 서버에 연결되어 있지 않습니다.");
      }

      client.publish({
        destination: "/pub/msg",
        body: JSON.stringify({
          content,
          roomId,
        } satisfies ChatMessageRequest),
      });
    },
    disconnect() {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      subscriptions.clear();
      subscribedRoomIds.clear();
      void client.deactivate();
    },
  };
}
