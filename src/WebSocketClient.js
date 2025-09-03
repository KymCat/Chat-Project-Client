import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

const SOCKET_URL = 'http://localhost:8080/ws-stomp'; // 스프링부트 WebSocket 엔드포인트

export const stompClient = new Client({
  webSocketFactory: () => new SockJS(SOCKET_URL),
  reconnectDelay: 5000, // 연결 끊기면 5초 후 재연결
});


/**
 * 채팅방 입장 시, 소켓 연결 및 채팅방 구독
 * 
 * @param {function(Object): void} onChatMessage        - 채팅 화면 갱신을 위한 useState의 set함수
 * @param {function(String, String): void} onConnected  - 채팅 입장 시스템 메세지 전송 함수
 * @param {String} roomId                               - 채팅방 번호
 */
export const connectStomp = (onChatMessage, onConnected, roomId) => {

    stompClient.onConnect = () => {
        console.log("STOMP CONNECTED " + roomId);

        // 일반 메세지 구독
        stompClient.subscribe(`/sub/msg/${roomId}`, (msg) => {
            onChatMessage(JSON.parse(msg.body));
        });

        // 입장 메세지 구독
        stompClient.subscribe(`/sub/enter/${roomId}`, (msg) => {
            onChatMessage(JSON.parse(msg.body));
        });

        // 입장 메세지 전송
        if(onConnected) onConnected();

    };
    stompClient.activate();
};

/**
 * 채팅 메세지 전송 함수
 * 
 * @param {Object} msg - 메세지 객체
 */
export const sendMessage = (msg) => {
    if (stompClient.connected) {
        stompClient.publish({
            destination: '/pub/msg',
            body: JSON.stringify(
                {   content: msg.content, 
                    sender: msg.sender,
                    type: msg.type,
                    roomId: msg.roomId
                })
        });
    }
}

/**
 * 채팅방 입장 메세지 전송 함수
 * 
 * @param {String} nickname     - 닉네임
 * @param {String} roomId       - 채팅방 번호
 */
export const enterMessage = (nickname,roomId) => {
    if (stompClient.connected) {
        stompClient.publish( {
            destination: '/pub/enter',
            body: JSON.stringify({
                content:'',
                sender: nickname,
                type: 'Enter',
                roomId: roomId
            })
        })
    }
}