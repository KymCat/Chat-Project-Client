import React, {useEffect, useRef, useState} from "react";
import './css/app.css';
import { connectStomp, sendMessage, enterMessage } from "./WebSocketClient";

function App() {
  // 채팅 입력칸
  const [input,setInput] = useState({
      sender: '', 
      content: '',
      type: ''
    });

  // 일반 메세지 리스트 관리
  const [messages, setMessages] = useState([]); 

  // 사용자 구분을 위한 랜덤 사용자 아이디
  const [nickname] = useState(Math.random().toString(36).slice(2, 9));

  // 채팅 자동 스크롤을 위한 DOM 요소,값 접근 훅
  const chatBoxRef = useRef(null);
  

  // 메시지 보내기
  const sendHandler = () => {
    if (input.content && input.content.trim() !== '') {
      sendMessage({
          sender: nickname, 
          content: input.content,
          type: "Chat"
        });

      setInput({sender: '', content: '', type: ''});
    }
  }

  // 최초 웹 렌더링 후 STOMP 구독
  useEffect(() => {
    connectStomp(
      (msg) => setMessages(prev => [...prev, msg]),
      () => enterMessage(nickname)
    );
  }, []); // 의존성 빈배열 == useEffect가 한번만 실행, 이후 실행 X


  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages]); // 메시지가 추가될 때마다 렌더링

  return (
    <div className="chat-container">
      <h1>채팅 테스트</h1>

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