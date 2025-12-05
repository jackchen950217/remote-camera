import React, { useState, useEffect, useRef } from 'react';
import { HashRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, addDoc } from 'firebase/firestore';
import { Camera, Monitor, Wifi, Power, Copy, ShieldCheck, RefreshCw, Activity, ArrowDownCircle, XCircle } from 'lucide-react';

// --- 1. Firebase 初始化 ---
let firebaseConfig;
let appId = 'default-app-id';

// 判斷是否為預覽環境
if (typeof __firebase_config !== 'undefined') {
  // 預覽環境 (不要動這裡)
  firebaseConfig = JSON.parse(__firebase_config);
  if (typeof __app_id !== 'undefined') appId = __app_id;
} else {
  // ---【正式部署環境】(已填入您的設定) ---
  firebaseConfig = {
    apiKey: "AIzaSyCRoAh0dtSAs5BIDyaBkOousivW-WAEHhk",
    authDomain: "remotecamera-47707.firebaseapp.com",
    projectId: "remotecamera-47707",
    storageBucket: "remotecamera-47707.firebasestorage.app",
    messagingSenderId: "608671743750",
    appId: "1:608671743750:web:663afaed75cd1a65cf6887",
    measurementId: "G-BZBHTH4BSW"
  };
  // 給您的 App 一個固定的識別名稱
  appId = 'my-remote-camera-app'; 
}

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- 2. WebRTC 配置 (Metered.ca TURN) ---
const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.relay.metered.ca:80" },
    {
      urls: "turn:global.relay.metered.ca:80",
      username: "8578b27b2c9e1c66e9bdf656",
      credential: "d3PMiwK+HSKTgVzp",
    },
    {
      urls: "turn:global.relay.metered.ca:80?transport=tcp",
      username: "8578b27b2c9e1c66e9bdf656",
      credential: "d3PMiwK+HSKTgVzp",
    },
    {
      urls: "turn:global.relay.metered.ca:443",
      username: "8578b27b2c9e1c66e9bdf656",
      credential: "d3PMiwK+HSKTgVzp",
    },
    {
      urls: "turns:global.relay.metered.ca:443?transport=tcp",
      username: "8578b27b2c9e1c66e9bdf656",
      credential: "d3PMiwK+HSKTgVzp",
    },
  ],
  iceCandidatePoolSize: 10,
};

// ==========================================
// 主程式入口 (App)
// ==========================================
export default function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const initAuth = async () => {
      // 優先檢查是否有預覽環境的 token，否則使用匿名登入
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token); 
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    onAuthStateChanged(auth, setUser);
  }, []);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="animate-spin mr-2"><RefreshCw /></div> 連線伺服器中...
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/camera" element={<CameraApp />} />
        <Route path="/viewer" element={<ViewerApp />} />
      </Routes>
    </Router>
  );
}

// ==========================================
// 頁面 1: 首頁 (Home)
// ==========================================
function Home() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-6 space-y-8 animate-fade-in">
      <h1 className="text-4xl font-bold text-blue-400 mb-8 text-center">
        舊機復活監控系統
      </h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
        <Link to="/camera" className="group text-decoration-none">
          <div className="bg-gray-800 hover:bg-gray-700 border-2 border-blue-500/30 hover:border-blue-500 p-8 rounded-2xl flex flex-col items-center transition-all transform hover:-translate-y-1 shadow-xl cursor-pointer h-full">
            <div className="bg-blue-900/30 p-4 rounded-full mb-4 group-hover:bg-blue-900/50 transition-colors">
              <Camera size={64} className="text-blue-400" />
            </div>
            <span className="text-2xl font-bold mb-2 text-white">我是相機端</span>
            <span className="text-gray-400 text-sm text-center">
              安裝在舊手機上<br/>(提供影像)
            </span>
          </div>
        </Link>

        <Link to="/viewer" className="group text-decoration-none">
          <div className="bg-gray-800 hover:bg-gray-700 border-2 border-emerald-500/30 hover:border-emerald-500 p-8 rounded-2xl flex flex-col items-center transition-all transform hover:-translate-y-1 shadow-xl cursor-pointer h-full">
            <div className="bg-emerald-900/30 p-4 rounded-full mb-4 group-hover:bg-emerald-900/50 transition-colors">
              <Monitor size={64} className="text-emerald-400" />
            </div>
            <span className="text-2xl font-bold mb-2 text-white">我是監控端</span>
            <span className="text-gray-400 text-sm text-center">
              使用電腦或新手機<br/>(觀看影像)
            </span>
          </div>
        </Link>
      </div>
      
      <div className="mt-8 text-xs text-gray-600">
         v2.2 - Configured
      </div>
    </div>
  );
}

// ==========================================
// 頁面 2: 相機端 (CameraApp)
// ==========================================
function CameraApp() {
  const [roomId, setRoomId] = useState('');
  const [status, setStatus] = useState('初始化中...');
  const [isStreaming, setIsStreaming] = useState(false);
  const navigate = useNavigate();
  
  const localStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const videoRef = useRef(null);

  // ID 管理與監聽
  useEffect(() => {
    let savedId = localStorage.getItem('my_camera_room_id');
    if (!savedId) {
      savedId = Math.random().toString(36).substring(2, 8).toUpperCase();
      localStorage.setItem('my_camera_room_id', savedId);
    }
    setRoomId(savedId);
    setStatus('待機中 - 等待監控端連線...');

    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'camera_rooms', savedId);
    setDoc(roomRef, { status: 'waiting', lastUpdated: new Date() }, { merge: true });

    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      const data = snapshot.data();
      if (!data) return;
      if (data.status === 'requested' && !isStreaming) startStreaming(savedId);
      if (data.status === 'ended') stopStreaming();
    });

    return () => {
      unsubscribe();
      stopStreaming();
    };
  }, []);

  const startStreaming = async (currentRoomId) => {
    try {
      setStatus('收到連線請求，啟動相機...');
      setIsStreaming(true);

      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' },
        audio: false 
      });
      localStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      const pc = new RTCPeerConnection(rtcConfig);
      peerConnectionRef.current = pc;

      pc.oniceconnectionstatechange = () => {
        if (['disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)) {
          stopStreaming();
        }
      };

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const callerCandidates = collection(db, 'artifacts', appId, 'public', 'data', `candidates_caller_${currentRoomId}`);
      pc.onicecandidate = (event) => {
        if (event.candidate) addDoc(callerCandidates, event.candidate.toJSON());
      };

      const offerDescription = await pc.createOffer();
      await pc.setLocalDescription(offerDescription);

      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'camera_rooms', currentRoomId);
      await updateDoc(roomRef, {
        offer: { type: offerDescription.type, sdp: offerDescription.sdp },
        status: 'offering' 
      });

      onSnapshot(roomRef, (snapshot) => {
        const data = snapshot.data();
        if (!pc.currentRemoteDescription && data?.answer) {
          const answerDescription = new RTCSessionDescription(data.answer);
          pc.setRemoteDescription(answerDescription);
          setStatus('監控端已連線，正在傳輸影像');
        }
      });

      const calleeCandidates = collection(db, 'artifacts', appId, 'public', 'data', `candidates_callee_${currentRoomId}`);
      onSnapshot(calleeCandidates, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added') {
            await pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
          }
        });
      });

    } catch (err) {
      console.error(err);
      setStatus('相機啟動失敗: ' + err.message);
      setIsStreaming(false);
    }
  };

  const stopStreaming = async () => {
    setStatus('待機中 - 省流模式啟動');
    setIsStreaming(false);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    if (roomId) {
       const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'camera_rooms', roomId);
       try {
         await updateDoc(roomRef, { status: 'waiting', offer: null, answer: null });
       } catch(e) {}
    }
  };

  const copyId = () => {
    const textArea = document.createElement("textarea");
    textArea.value = roomId;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      const successful = document.execCommand('copy');
      if(successful) alert('ID 已複製');
      else alert('複製失敗');
    } catch (err) {
      alert('複製失敗，請手動選取');
    }
    document.body.removeChild(textArea);
  };

  return (
    <div className="flex flex-col h-screen bg-black text-white">
      <div className="bg-gray-900 p-4 border-b border-gray-800 flex justify-between items-center shadow-lg z-10">
        <div>
           <div className="text-gray-400 text-sm uppercase tracking-wider mb-1">本機固定 ID</div>
           <div className="text-6xl font-mono text-blue-400 font-bold flex items-center gap-3">
             {roomId}
             <button onClick={copyId} className="bg-gray-800 p-3 rounded hover:bg-gray-700 text-white"><Copy size={24} /></button>
           </div>
        </div>
        <div className="flex flex-col items-end gap-2">
           <button onClick={() => navigate('/')} className="text-xs bg-gray-800 px-2 py-1 rounded text-gray-400">Back</button>
           <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold transition-all ${isStreaming ? 'bg-red-900/80 text-red-200 animate-pulse' : 'bg-green-900/80 text-green-200'}`}>
            {isStreaming ? <Wifi size={16} /> : <ShieldCheck size={16} />}
            {isStreaming ? '傳輸中' : '省流待機'}
           </div>
        </div>
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-gray-900">
        {isStreaming ? (
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
        ) : (
          <div className="text-center p-8 opacity-60">
            <Power size={100} className="mx-auto mb-6 text-gray-700" />
            <h3 className="text-2xl font-bold text-gray-300">休眠中</h3>
            <p className="text-gray-500 mt-2">請在監控端輸入 ID 連線<br/>鏡頭將自動喚醒</p>
          </div>
        )}
        <div className="absolute bottom-8 left-0 right-0 flex justify-center">
          <span className="bg-black/70 px-6 py-2 rounded-full text-sm text-gray-300 backdrop-blur-md border border-gray-700 shadow-xl">
            {status}
          </span>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 頁面 3: 監控端 (ViewerApp)
// ==========================================
function ViewerApp() {
  const [inputRoomId, setInputRoomId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState('準備就緒');
  const [speed, setSpeed] = useState(0);
  const [totalUsage, setTotalUsage] = useState(0);
  const navigate = useNavigate();
  
  const videoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const roomIdRef = useRef(null);
  const statsIntervalRef = useRef(null);

  useEffect(() => {
    if (isConnected && peerConnectionRef.current) {
      let lastBytes = 0;
      statsIntervalRef.current = setInterval(async () => {
        if (!peerConnectionRef.current) return;
        const stats = await peerConnectionRef.current.getStats();
        let currentTotalBytes = 0;
        stats.forEach(report => {
          if (report.type === 'inbound-rtp' && (report.kind === 'video' || report.kind === 'audio')) {
            currentTotalBytes += (report.bytesReceived || 0);
          }
        });

        if (currentTotalBytes > 0) {
           setTotalUsage((currentTotalBytes / 1024 / 1024).toFixed(2));
           if (lastBytes > 0) {
             const bytesDiff = currentTotalBytes - lastBytes;
             setSpeed((bytesDiff / 1024).toFixed(1));
           }
           lastBytes = currentTotalBytes;
        }
      }, 1000);
    }
    return () => { if (statsIntervalRef.current) clearInterval(statsIntervalRef.current); };
  }, [isConnected]);

  const connectToCamera = async () => {
    if (!inputRoomId) return;
    const cleanId = inputRoomId.trim().toUpperCase();
    roomIdRef.current = cleanId;
    
    setIsConnected(true);
    setStatus('正在喚醒相機端...');
    setSpeed(0);
    setTotalUsage(0);

    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'camera_rooms', cleanId);
    await setDoc(roomRef, { status: 'requested' }, { merge: true });

    const unsubscribe = onSnapshot(roomRef, async (snapshot) => {
      const data = snapshot.data();
      if (data?.status === 'offering' && data?.offer && !peerConnectionRef.current) {
        setStatus('建立加密連線中...');
        await handleOffer(data.offer, cleanId);
      }
    });
  };

  const handleOffer = async (offer, currentRoomId) => {
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnectionRef.current = pc;

    pc.ontrack = (event) => {
      if (videoRef.current) {
        videoRef.current.srcObject = event.streams[0];
        setStatus('影像接收中');
      }
    };
    
    pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'disconnected') setStatus('連線中斷');
    };

    const calleeCandidates = collection(db, 'artifacts', appId, 'public', 'data', `candidates_callee_${currentRoomId}`);
    pc.onicecandidate = (event) => {
      if (event.candidate) addDoc(calleeCandidates, event.candidate.toJSON());
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'camera_rooms', currentRoomId);
    await updateDoc(roomRef, {
      answer: { type: answer.type, sdp: answer.sdp },
      status: 'connected'
    });

    const callerCandidates = collection(db, 'artifacts', appId, 'public', 'data', `candidates_caller_${currentRoomId}`);
    onSnapshot(callerCandidates, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          await pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
        }
      });
    });
  };

  const handleDisconnect = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (roomIdRef.current) {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'camera_rooms', roomIdRef.current);
      updateDoc(roomRef, { status: 'ended' }).catch(e => {});
    }
    setIsConnected(false);
    setInputRoomId('');
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-900 p-6 animate-fade-in text-gray-100 relative">
        <button onClick={() => navigate('/')} className="absolute top-4 left-4 text-gray-400 hover:text-white">← Back Home</button>
        <div className="bg-gray-800 p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-700">
          <h2 className="text-2xl font-bold mb-6 text-center text-emerald-400 flex items-center justify-center gap-2">
            <Monitor /> 遠端監控台
          </h2>
          <div className="mb-6">
            <label className="text-gray-400 text-sm mb-2 block">請輸入相機端 ID</label>
            <input
              type="text"
              placeholder="例如: X7Y9Z1"
              value={inputRoomId}
              onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white text-center text-2xl tracking-widest font-mono focus:ring-2 focus:ring-emerald-500 outline-none uppercase"
            />
          </div>
          <button
            onClick={connectToCamera}
            disabled={!inputRoomId}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white py-4 rounded-lg font-bold text-lg transition-colors shadow-lg"
          >
            喚醒並連線
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-black">
      <div className="bg-gray-900/90 backdrop-blur-md p-3 flex justify-between items-center px-4 border-b border-gray-800 absolute top-0 left-0 right-0 z-10">
        <div className="flex items-center gap-4">
           <div className="flex flex-col">
              <span className="text-[10px] text-gray-400 uppercase">Status</span>
              <div className="flex items-center gap-1 text-sm font-bold text-white">
                <div className={`w-2 h-2 rounded-full ${status === '影像接收中' ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`}></div>
                {status === '影像接收中' ? 'LIVE' : 'Connecting...'}
              </div>
           </div>
           <div className="flex items-center gap-4 bg-black/40 px-3 py-1 rounded-lg border border-gray-700">
              <div className="flex items-center gap-2">
                 <Activity size={14} className="text-blue-400" />
                 <div>
                    <span className="text-[10px] text-gray-400 block">Speed</span>
                    <span className="text-sm font-mono font-bold text-blue-200">{speed} <span className="text-xs text-blue-500">KB/s</span></span>
                 </div>
              </div>
              <div className="w-[1px] h-6 bg-gray-700"></div>
              <div className="flex items-center gap-2">
                 <ArrowDownCircle size={14} className="text-purple-400" />
                 <div>
                    <span className="text-[10px] text-gray-400 block">Total</span>
                    <span className="text-sm font-mono font-bold text-purple-200">{totalUsage} <span className="text-xs text-purple-500">MB</span></span>
                 </div>
              </div>
           </div>
        </div>
        <button onClick={handleDisconnect} className="bg-red-900/80 text-red-100 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-800 flex items-center gap-2">
          <XCircle size={16} /> 斷線
        </button>
      </div>
      <div className="flex-1 relative flex items-center justify-center pt-16 pb-4">
        <video ref={videoRef} autoPlay playsInline controls className="w-full h-full object-contain" />
      </div>
    </div>
  );
}