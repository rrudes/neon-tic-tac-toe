const socket = io();
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// --- Audio Synthesis ---
const playSound = (type) => {
    if (audioCtx.state === 'suspended') return;
    if (document.getElementById('music-btn').classList.contains('muted')) return;
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;
    
    if (type === 'hover') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.05);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
    } else if (type === 'click') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    } else if (type === 'win') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(554.37, now + 0.1);
        osc.frequency.setValueAtTime(659.25, now + 0.2);
        osc.frequency.setValueAtTime(880, now + 0.3);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 1);
        osc.start(now);
        osc.stop(now + 1);
    } else if (type === 'chat') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    }
};

document.getElementById('music-btn').addEventListener('click', function() {
    this.classList.toggle('muted');
    if(this.classList.contains('muted')) {
        this.textContent = '🔇';
    } else {
        this.textContent = '🔊';
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }
});

// --- Dynamic Background ---
const canvas = document.getElementById("bg-canvas");
const ctx = canvas.getContext("2d");
let w, h;
let particles = [];

function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

for(let i=0; i<50; i++) {
    particles.push({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random()-0.5)*0.5, vy: (Math.random()-0.5)*0.5,
        size: Math.random()*2+1
    });
}
function drawBg() {
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = "rgba(0, 242, 255, 0.5)";
    particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if(p.x < 0) p.x = w; if(p.x > w) p.x = 0;
        if(p.y < 0) p.y = h; if(p.y > h) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
        ctx.fill();
    });
    // draw lines between close particles
    ctx.strokeStyle = "rgba(0, 242, 255, 0.05)";
    ctx.lineWidth = 1;
    for(let i=0; i<particles.length; i++){
        for(let j=i+1; j<particles.length; j++){
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = dx*dx + dy*dy;
            if(dist < 15000) {
                ctx.beginPath();
                ctx.moveTo(particles[i].x, particles[i].y);
                ctx.lineTo(particles[j].x, particles[j].y);
                ctx.stroke();
            }
        }
    }
    requestAnimationFrame(drawBg);
}
drawBg();

// --- 3D Tilt Effect ---
const mainWrapper = document.getElementById('main-wrapper');
const board3d = document.querySelector('.board-3d');
document.addEventListener('mousemove', (e) => {
    if(window.innerWidth < 850) return; // Disable tilt on mobile layout for stability
    const xAxis = (window.innerWidth / 2 - e.pageX) / 40;
    const yAxis = (window.innerHeight / 2 - e.pageY) / 40;
    board3d.style.transform = `rotateY(${xAxis}deg) rotateX(${yAxis * -1}deg)`;
});

// --- DOM Elements ---
const boardEl = document.getElementById("board");
const statusTextEl = document.getElementById("status-text");
const statusDotEl = document.getElementById("status-dot");
const errorEl = document.getElementById("error");
const playerInfoEl = document.getElementById("player-info");
const playersCountEl = document.getElementById("players-count");
const roomInput = document.getElementById("room-input");
const passwordInput = document.getElementById("password-input");
const nameInput = document.getElementById("name-input");
const joinBtn = document.getElementById("join-btn");
const copyBtn = document.getElementById("copy-btn");
const rematchBtn = document.getElementById("rematch-btn");
const loginControls = document.getElementById("login-controls");
const chatHistoryEl = document.getElementById("chat-history");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send");
const emojiBar = document.getElementById("emoji-bar");
const gameContainer = document.querySelector(".game-container");

const rematchModal = document.getElementById("rematch-modal");
const acceptRematchBtn = document.getElementById("accept-rematch-btn");
const declineRematchBtn = document.getElementById("decline-rematch-btn");

let roomId = null;
let mySymbol = null;
let currentTurn = "X";
let isGameActive = false;
let myName = null;

try { roomInput.focus(); } catch (e) {}

// Build Board
const cells = [];
for (let i = 0; i < 9; i++) {
    const c = document.createElement("div");
    c.className = "cell";
    c.dataset.index = i;
    c.tabIndex = 0;
    c.setAttribute("role", "button");
    c.addEventListener("mouseenter", () => {
        if(isGameActive && currentTurn === mySymbol && !c.hasChildNodes()) playSound('hover');
    });
    c.addEventListener("click", () => handleCellClick(i));
    c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleCellClick(i); }});
    boardEl.appendChild(c);
    cells.push(c);
}

function updateTurnUI() {
    if (!isGameActive) {
        board3d.classList.remove('my-turn-active');
        return;
    }
    if (currentTurn === mySymbol) {
        board3d.classList.add('my-turn-active');
    } else {
        board3d.classList.remove('my-turn-active');
    }
}

function showError(msg) {
    errorEl.textContent = msg;
    statusTextEl.textContent = "Error";
    statusDotEl.className = "status-dot error";
    setTimeout(() => { errorEl.textContent = ""; statusTextEl.textContent = "System Idle"; statusDotEl.className = "status-dot"; }, 3500);
}

function renderCell(c, symbol) {
    c.innerHTML = "";
    c.className = "cell"; 
    if(symbol === "X") {
        c.classList.add("x");
        c.innerHTML = '<svg><use href="#icon-x"></use></svg>';
    } else if(symbol === "O") {
        c.classList.add("o");
        c.innerHTML = '<svg><use href="#icon-o"></use></svg>';
    }
}

// Join Room
joinBtn.addEventListener("click", () => {
    const r = (roomInput.value || "").trim();
    const p = (passwordInput.value || "").trim();
    const n = (nameInput.value || "").trim() || "Anonymous";
    if (!r || r.length < 3) return showError("Code must be at least 3 chars.");

    roomId = r;
    myName = n;
    joinBtn.disabled = true;
    joinBtn.textContent = "Establishing Link...";
    if (audioCtx.state === 'suspended') audioCtx.resume();
    socket.emit("joinRoom", { roomId: r, password: p, playerName: n });
    playSound('click');
});

// Copy Code
copyBtn.addEventListener("click", () => {
    if (!roomId) return showError("No joined room to copy.");
    playSound('click');
    navigator.clipboard?.writeText(roomId).then(() => {
        copyBtn.textContent = "Copied ✅";
        setTimeout(() => copyBtn.textContent = "📋 Copy Code", 1500);
    }).catch(() => showError("Copy failed."));
});

// Rematch Button Logic (Initiator)
rematchBtn.addEventListener("click", () => {
    if (!roomId) return;
    playSound('click');
    rematchBtn.textContent = "Awaiting Uplink...";
    rematchBtn.classList.add("selected");
    rematchBtn.disabled = true;
    socket.emit("requestRematch", { roomId });
});

// Modal Button Logic (Receiver)
acceptRematchBtn.addEventListener("click", () => {
    if (!roomId) return;
    playSound('click');
    socket.emit("requestRematch", { roomId });
    rematchModal.classList.remove("active");
});

declineRematchBtn.addEventListener("click", () => {
    playSound('click');
    rematchModal.classList.remove("active");
});

// Socket Events
socket.on("roomError", (msg) => {
    roomId = null;
    joinBtn.disabled = false;
    joinBtn.textContent = "Initialize Link";
    showError(msg);
});

socket.on("roomJoined", (joinedRoomId) => {
    if (joinedRoomId) roomId = joinedRoomId;
    loginControls.style.display = "none";
    copyBtn.style.display = "flex";
    copyBtn.disabled = false;
    statusTextEl.textContent = `Linked: ${roomId}`;
    statusDotEl.className = "status-dot active";
});

socket.on("init", (data) => {
    mySymbol = data.symbol ?? null;
    currentTurn = data.turn ?? "X";
    playersCountEl.innerHTML = `<span class="icon">👥</span> ${data.playersCount}/2 Connected`;
    playerInfoEl.textContent = mySymbol ? `Designation: ${mySymbol}` : "Spectator";
    
    isGameActive = true; 

    if (Array.isArray(data.board)) {
        data.board.forEach((val, i) => {
            renderCell(cells[i], val);
        });
    }
    updateTurnUI();
});

function handleCellClick(index) {
    if (!roomId) return showError("Initialize link first.");
    if (!mySymbol) return showError("Spectator mode active.");
    if (!isGameActive) return showError("Match concluded.");
    if (currentTurn !== mySymbol) return showError("Awaiting opponent...");
    if (cells[index].hasChildNodes()) return;
    
    playSound('click');
    socket.emit("makeMove", { roomId, index, symbol: mySymbol });
}

socket.on("moveMade", ({ index, symbol, turn, winner, winningLine, isDraw }) => {
    renderCell(cells[index], symbol);
    currentTurn = turn;
    
    if (winner || isDraw) {
        isGameActive = false;
        updateTurnUI();
        rematchBtn.style.display = "flex";
        if (winner && Array.isArray(winningLine)) {
            winningLine.forEach(i => cells[i].classList.add("win-highlight"));
            if (winner === mySymbol) {
                playSound('win');
                try { confetti({ particleCount: 100, spread: 70, colors: ['#00f2ff', '#ff0055', '#b026ff'] }); } catch (e) {}
            } else {
                // optional lose sound
            }
        }
    } else {
        isGameActive = true;
        updateTurnUI();
    }
});

socket.on("rematchRequestedByOpponent", () => {
    playSound('chat');
    rematchModal.classList.add("active");
});

socket.on("resetBoard", () => {
    cells.forEach(c => { 
        c.innerHTML = ""; 
        c.className = "cell"; 
    });
    isGameActive = true;
    currentTurn = "X";
    updateTurnUI();
    
    rematchBtn.style.display = "none";
    rematchBtn.textContent = "🔄 Request Rematch";
    rematchBtn.classList.remove("selected");
    rematchBtn.disabled = false;
    rematchModal.classList.remove("active");

    appendChat({ senderName: "System", message: "Matrix Reset. Initiate.", symbol: null });
});

socket.on("opponentLeft", () => {
    appendChat({ senderName: "System", message: "Opponent link severed.", symbol: null });
    isGameActive = false;
    updateTurnUI();
    statusTextEl.textContent = "Opponent Offline";
    statusDotEl.className = "status-dot waiting";
});

// Chat & Reactions
function appendChat({ senderName, message, symbol }) {
    if(senderName !== "System" && senderName !== myName) playSound('chat');
    
    const wrapper = document.createElement("div");
    if (senderName === "System") {
        const el = document.createElement("div");
        el.className = "chat-msg system";
        el.textContent = message;
        wrapper.appendChild(el);
    } else {
        const nameEl = document.createElement("div");
        nameEl.className = "chat-sender";
        nameEl.textContent = senderName + (symbol ? ` [${symbol}]` : "");
        wrapper.appendChild(nameEl);
        const msgEl = document.createElement("div");
        const isMe = (myName && senderName === myName);
        msgEl.className = "chat-msg " + (isMe ? "me" : "other");
        msgEl.textContent = message;
        wrapper.appendChild(msgEl);
    }
    chatHistoryEl.appendChild(wrapper);
    chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
}

chatSendBtn.addEventListener("click", () => {
    const txt = (chatInput.value || "").trim();
    if (!txt || !roomId) return;
    playSound('click');
    socket.emit("chatMessage", { roomId, message: txt });
    chatInput.value = "";
});
chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); chatSendBtn.click(); }});
socket.on("chatMessage", appendChat);

function spawnFloatingEmoji(emoji) {
    const el = document.createElement("div");
    el.className = "reaction";
    el.textContent = emoji;
    const rect = gameContainer.getBoundingClientRect();
    const padding = 24;
    const left = Math.max(padding, Math.random() * (rect.width - padding * 2));
    el.style.left = `${left}px`;
    gameContainer.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch (e) {} }, 2600);
}
emojiBar?.addEventListener("click", (e) => {
    const btn = e.target.closest?.(".emoji-btn");
    if (!btn || !roomId) return;
    playSound('click');
    socket.emit("sendReaction", { roomId, emoji: btn.textContent.trim() });
});
socket.on("playerReaction", ({ emoji }) => spawnFloatingEmoji(emoji));
socket.on("playersCount", (count) => { playersCountEl.innerHTML = `<span class="icon">👥</span> ${count}/2 Connected`; });