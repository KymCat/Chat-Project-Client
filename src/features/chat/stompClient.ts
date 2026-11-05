import { Client, type IMessage, type StompSubscription } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { webSocketUrl } from "../../shared/config/env";
import type {
  ChatErrorEvent,
  ChatMessageEvent,
  ChatRoomEvent,
  DirectChatResponse,
} from "./api";

export type { ChatMessageEvent, ChatRoomEvent } from "./api";

interface ChatMessageRequest {
  content: string;
  roomId: number;
}

interface ChatAttachmentMessageRequest {
  roomId: number;
  attachmentId: number;
}

interface ConnectOptions {
  accessToken: string;
  onMessage: (event: ChatMessageEvent) => void;
  onDirectMessage: (response: DirectChatResponse) => void;
  onChatError: (event: ChatErrorEvent) => void;
  onRoomEvent: (event: ChatRoomEvent) => void;
  onStatusChange: (connected: boolean) => void;
  onReconnect: () => void;
  onError: (message: string) => void;
}

export function connectChat(options: ConnectOptions) {
  const subscribedRoomIds = new Set<number>();
  const messageSubscriptions = new Map<number, StompSubscription>();
  const roomSubscriptions = new Map<number, StompSubscription>();
  let directMessageSubscription: StompSubscription | null = null;
  let chatErrorSubscription: StompSubscription | null = null;
  let hasConnectedOnce = false;

  const receive = (frame: IMessage) => {
    try {
      options.onMessage(JSON.parse(frame.body) as ChatMessageEvent);
    } catch {
      options.onError("수신한 메시지를 읽을 수 없습니다.");
    }
  };

  const receiveRoomEvent = (frame: IMessage) => {
    try {
      options.onRoomEvent(JSON.parse(frame.body) as ChatRoomEvent);
    } catch {
      options.onError("수신한 채팅방 정보를 읽을 수 없습니다.");
    }
  };

  const receiveDirectMessage = (frame: IMessage) => {
    try {
      options.onDirectMessage(JSON.parse(frame.body) as DirectChatResponse);
    } catch {
      options.onError("수신한 1:1 채팅을 읽을 수 없습니다.");
    }
  };

  const receiveChatError = (frame: IMessage) => {
    try {
      options.onChatError(JSON.parse(frame.body) as ChatErrorEvent);
    } catch {
      options.onError("채팅 오류 정보를 읽을 수 없습니다.");
    }
  };

  const subscribe = (roomId: number) => {
    if (!client.connected || messageSubscriptions.has(roomId)) return;

    messageSubscriptions.set(
      roomId,
      client.subscribe(`/sub/msg/${roomId}`, receive),
    );
    roomSubscriptions.set(
      roomId,
      client.subscribe(`/sub/chat-rooms/${roomId}`, receiveRoomEvent),
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
      const reconnected = hasConnectedOnce;
      hasConnectedOnce = true;

      messageSubscriptions.clear();
      roomSubscriptions.clear();
      directMessageSubscription = client.subscribe(
        "/user/queue/direct-messages",
        receiveDirectMessage,
      );
      chatErrorSubscription = client.subscribe(
        "/user/queue/chat-errors",
        receiveChatError,
      );
      subscribedRoomIds.forEach(subscribe);
      options.onStatusChange(true);

      if (reconnected) {
        options.onReconnect();
      }
    },
    onDisconnect: () => options.onStatusChange(false),
    onWebSocketClose: () => {
      messageSubscriptions.clear();
      roomSubscriptions.clear();
      directMessageSubscription = null;
      chatErrorSubscription = null;
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

        messageSubscriptions.get(roomId)?.unsubscribe();
        roomSubscriptions.get(roomId)?.unsubscribe();
        messageSubscriptions.delete(roomId);
        roomSubscriptions.delete(roomId);
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
    sendAttachment(roomId: number, attachmentId: number) {
      if (!client.connected) {
        throw new Error("채팅 서버에 연결되어 있지 않습니다.");
      }

      client.publish({
        destination: "/pub/msg/attachment",
        body: JSON.stringify({
          roomId,
          attachmentId,
        } satisfies ChatAttachmentMessageRequest),
      });
    },
    disconnect() {
      messageSubscriptions.forEach((subscription) => subscription.unsubscribe());
      roomSubscriptions.forEach((subscription) => subscription.unsubscribe());
      directMessageSubscription?.unsubscribe();
      chatErrorSubscription?.unsubscribe();
      messageSubscriptions.clear();
      roomSubscriptions.clear();
      directMessageSubscription = null;
      chatErrorSubscription = null;
      subscribedRoomIds.clear();
      void client.deactivate();
    },
  };
}
