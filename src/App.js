import React, {useState} from "react";
import './WebSocketClient';
import { sendMessage } from "./WebSocketClient";

function App() {
  const [input,setInput] = useState('');

  const sendHandler = () => {
    sendMessage(input);
    setInput('');
  }

  return (
    <div>
      <h1>채팅 테스트</h1>
      <input 
        value={input} 
        onChange={(e) => setInput(e.target.value)} 
        placeholder="메시지 입력"
      />
      <button onClick={sendHandler}>전송</button>
    </div>
  );
}

export default App;