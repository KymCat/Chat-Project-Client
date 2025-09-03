import React, {useEffect, useRef, useState} from "react";
import './css/app.css';
import { connectStomp, sendMessage, enterMessage, stompClient } from "./WebSocketClient";

function App() {
  // 채팅 입력칸

  // 일반 메세지 리스트 관리
  const [messages, setMessages] = useState([]); 

  // 사용자 구분을 위한 랜덤 사용자 아이디
  const [nickname] = useState(Math.random().toString(36).slice(2, 9));

  // 방 선택
  const [roomId, setRoomId] = useState("room1");

  // 채팅 자동 스크롤을 위한 DOM 요소,값 접근 훅
  const chatBoxRef = useRef(null);

    const [input,setInput] = useState({
      sender: nickname, 
      content: '',
      type: 'Chat',
      roomId: roomId
    });
  

  /**
   * 
   * 채팅 전송 핸들러
   * 채팅 입력 후, 엔터 혹은 전송 버튼 클릭시 호출
   */
  const sendHandler = () => {
    if (input.content && input.content.trim() !== '') {
      sendMessage({
          sender: input.sender, 
          content: input.content,
          type: input.type,
          roomId: input.roomId
        });

      setInput({sender: input.sender, content: '', type: input.type, roomId: input.roomId});
    }
  }

  /**
   * 
   * roomId가 변경될때마다 렌더링
   * connectStomp() : 현재 채팅방 구독
   * return() : 새롭게 렌더링 되기전에 stompClient 종료
   */
  useEffect(() => {
    setMessages([]);
    setInput({sender: nickname, content: '', type: "Chat", roomId: roomId});

    connectStomp(
      (msg) => setMessages(prev => [...prev, msg]),
      () => enterMessage(nickname, roomId),
      roomId
    );

    return () => { 
      stompClient.deactivate();
    };
  }, [roomId]);


  /**
   * 
   * messages가 바뀔때마다 스크롤을 맨 아래로 내리는 기능
   */
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages]);


  return (
    <div className="chat-container">
      <h1>채팅 프로젝트</h1>

      {/* 채팅방 선택*/}
      <div className="room-select">
        <label>채팅방 선택: </label>
        <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="room1">방 1</option>
          <option value="room2">방 2</option>
          <option value="room3">방 3</option>
        </select>
      </div>

      {/* 채팅 박스*/}
      <div className="chat-box" ref={chatBoxRef}>
        {messages.map((msg, idx) => (
          <div key={idx} 
            className={`chat-message ${
              msg.type === 'Enter' 
                ? "system-message"
                : msg.sender === nickname
                  ? "my-message"
                  : "other-message"
            }`}>

            <strong>{
            msg.type === "Enter" 
              ? "[System]" 
              : msg.sender === nickname 
                ? "[me]" 
                : "[other]"}: 
            </strong>
            {msg.content}
          </div>
        ))}
      </div>

      {/* 채팅 입력*/}
      <div className="chat-input">
        <input 
          value={input.content} 
          onChange={(e) => setInput({...input, content: e.target.value})}
          onKeyDown={(e) => e.key === 'Enter' && sendHandler()}
          placeholder="메시지 입력"
        />
        <button onClick={sendHandler}>전송</button>
      </div>
    </div>
  );
}

export default App;